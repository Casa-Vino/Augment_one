// Campaign state and the actions the player can take between missions.
// Every action returns a new state (the old one is never mutated) or an error message.
import { agentTraits, createAgent, derive, EMPTY_RECORD, needsDose } from './agent';
import {
  AGENT_NAMES, AUGMENTS, AUGMENT_BY_ID, CAMPAIGN_LENGTH, CLEAN_BONUS_RATE, CLIENTS, HEAL_PER_TURN, MAX_CAPTIVES, MAX_ROSTER, MAX_SQUAD,
  CONTROL_AT, LOSE_CONTROL_BELOW, MISSIONS, PERSONALITIES, PRICES, REGIONS, REGION_BY_ID, RESEARCH, RIVAL_CODENAMES, RIVAL_NAMES, RIVAL_SYNDICATE, SLOTS,
  TARGET_SITES, TRAIT_BY_ID,
} from './data';
import { CLIENT_CODEX } from './lore';
import { bondKey, bondLevel, resolveMission } from './mission';
import { createRng, hashSeed, type Rng } from './rng';
import type { Agent, Contract, Drugs, MissionResult, MissionType, RivalOrders, RulesOfEngagement, Slot } from './types';

export interface DebriefRecord {
  turn: number;
  contract: Contract;
  result: MissionResult;
  squad: string[];
  rules: RulesOfEngagement;
  upkeep: number;
  doseCost: number;
  /** Team developments: traits earned, bonds formed, captives taken. */
  events: string[];
}

export interface Captive {
  agent: Agent;
  since: number;
  /** Turn of the last recruitment attempt; one attempt per turn. */
  lastAttempt?: number;
}

export interface Sleeper {
  agentId: string;
  regionId: string;
  since: number;
}

export interface CampaignState {
  version: 3;
  seed: number;
  turn: number;
  money: number;
  rp: number;
  /** Reputation for clean work. Raises the chance captives accept an offer. */
  standing: number;
  research: string[];
  roster: Agent[];
  contracts: Contract[];
  history: DebriefRecord[];
  nextId: number;
  bonds: Record<string, number>;
  captives: Captive[];
  codex: string[];
  settings: { lore: boolean };
  /** Influence per district, 0-100. */
  influence: Record<string, number>;
  /** Districts you control and collect income from. */
  owned: string[];
  sleepers: Sleeper[];
  /** What happened overnight: income, sleeper reports. Shown at HQ. */
  news: string[];
  /** Turn of the last Calyx run; one run per turn. */
  calyxTurn: number;
}

export interface SquadOrder {
  agentId: string;
  drugs: Drugs;
  dosed: boolean;
}

export interface MissionOrders {
  rules: RulesOfEngagement;
  rivalOrders: RivalOrders;
}

export type Outcome = { ok: true; state: CampaignState } | { ok: false; error: string };

const fail = (error: string): Outcome => ({ ok: false, error });

export const DEFAULT_ORDERS: MissionOrders = { rules: 'lethal', rivalOrders: 'avoid' };

export function newCampaign(seed: number): CampaignState {
  const rng = createRng(hashSeed(seed, 'roster'));
  const names = rng.shuffle(AGENT_NAMES);
  const personalities = rng.shuffle(PERSONALITIES);
  const state: CampaignState = {
    version: 3,
    seed,
    turn: 1,
    money: 6000,
    rp: 0,
    standing: 0,
    research: [],
    roster: names.slice(0, 4).map((name, i) => createAgent(`a${i + 1}`, name, personalities[i])),
    contracts: [],
    history: [],
    nextId: 5,
    bonds: {},
    captives: [],
    codex: [],
    settings: { lore: true },
    influence: {},
    owned: [],
    sleepers: [],
    news: [],
    calyxTurn: 0,
  };
  state.contracts = generateContracts(state);
  return state;
}

/** Upgrades an older save: new fields get defaults, agents get a personality, contracts get districts. */
export function migrate(saved: unknown): CampaignState | null {
  const s = saved as Partial<CampaignState> & { version?: number };
  if (!s || typeof s !== 'object') return null;
  if (s.version === 3) return s as CampaignState;
  if (s.version === 2) {
    const v3: CampaignState = { ...(s as CampaignState), version: 3, influence: {}, owned: [], sleepers: [], news: [], calyxTurn: 0 };
    v3.contracts = generateContracts(v3);
    return v3;
  }
  if (s.version !== 1) return null;
  const rng = createRng(hashSeed(s.seed ?? 0, 'migrate'));
  const roster = (s.roster ?? []).map((a) => ({
    ...a,
    traits: a.traits ?? [rng.pick(PERSONALITIES)],
    record: a.record ?? { ...EMPTY_RECORD },
    origin: a.origin ?? 'founder',
  }));
  const history = (s.history ?? []).map((h) => ({
    ...h,
    rules: h.rules ?? 'lethal',
    events: h.events ?? [],
    result: Object.assign({ alarm: false, kills: 0, subdued: 0, cleanBonus: 0 }, h.result),
  })) as DebriefRecord[];
  return migrate({ ...(s as CampaignState), version: 2, roster, history, standing: 0, bonds: {}, captives: [], codex: [], settings: { lore: true } });
}

function makeRival(rng: Rng, id: string, difficulty: number): Agent {
  const agent = createAgent(id, rng.pick(RIVAL_NAMES), rng.pick(PERSONALITIES), 'captive');
  agent.codename = rng.pick(RIVAL_CODENAMES);
  const maxTier = difficulty >= 3 ? 2 : 1;
  const pool = AUGMENTS.filter((a) => a.tier <= maxTier && !a.id.startsWith('prosthetic'));
  for (const slot of rng.shuffle(SLOTS).slice(0, Math.min(6, 1 + difficulty))) {
    const options = pool.filter((a) => a.slot === slot);
    if (options.length) agent.augments[slot] = rng.pick(options).id;
  }
  return agent;
}

/** Four contracts a turn, each in a different district of the city map. */
export function generateContracts(state: CampaignState): Contract[] {
  const rng = createRng(hashSeed(state.seed, 'contracts', state.turn));
  const types = Object.keys(MISSIONS) as MissionType[];
  const regions = rng.shuffle(REGIONS).slice(0, 4);
  const base = 1 + Math.floor((state.turn - 1) * 0.4);
  return regions.map((region, i) => {
    const type = rng.pick(types);
    const difficulty = Math.max(1, Math.min(5, base + region.offset + rng.int(-1, 0)));
    const payout = Math.round(((1100 + 900 * difficulty) * MISSIONS[type].payoutMult) / 50) * 50;
    const contract: Contract = {
      id: `t${state.turn}c${i}`, type, difficulty, client: rng.pick(CLIENTS), target: `${rng.pick(TARGET_SITES)} in ${region.name}`, payout, regionId: region.id,
    };
    if (rng.chance(0.4)) contract.cleanBonus = Math.round((payout * CLEAN_BONUS_RATE) / 50) * 50;
    const rivalChance = Math.min(0.6, 0.08 + state.turn * 0.04 + (region.lantern ? 0.15 : 0));
    if (state.turn > 1 && rng.chance(rivalChance)) contract.rival = makeRival(rng, `r${state.turn}${i}`, difficulty);
    return contract;
  });
}

export function toleranceBonus(state: CampaignState): number {
  return RESEARCH.filter((r) => state.research.includes(r.id)).reduce((sum, r) => sum + (r.toleranceBonus ?? 0), 0);
}

export function isUnlocked(state: CampaignState, augId: string): boolean {
  const aug = AUGMENT_BY_ID.get(augId);
  return !!aug && (!aug.research || state.research.includes(aug.research));
}

export function livingAgents(state: CampaignState): Agent[] {
  return state.roster.filter((a) => a.status === 'active');
}

export function isFinished(state: CampaignState): 'won' | 'lost' | null {
  if (state.turn > CAMPAIGN_LENGTH) return 'won';
  if (!livingAgents(state).length && state.money < PRICES.recruit) return 'lost';
  return null;
}

function edit(state: CampaignState, fn: (draft: CampaignState) => string | void): Outcome {
  const draft = structuredClone(state);
  const error = fn(draft);
  return error ? fail(error) : { ok: true, state: draft };
}

function unlock(s: CampaignState, ...ids: string[]) {
  for (const id of ids) if (!s.codex.includes(id)) s.codex.push(id);
}

export function installAugment(state: CampaignState, agentId: string, augId: string): Outcome {
  return edit(state, (s) => {
    const agent = s.roster.find((a) => a.id === agentId);
    const aug = AUGMENT_BY_ID.get(augId);
    if (!agent || agent.status !== 'active') return 'Agent not available.';
    if (!aug) return 'Unknown augment.';
    if (!isUnlocked(s, augId)) return 'Not researched yet.';
    if (agent.augments[aug.slot] === augId) return 'Already installed.';
    if (s.money < aug.cost) return 'Not enough credits.';
    s.money -= aug.cost;
    agent.augments[aug.slot] = augId;
    if (agent.missingLimbs.includes(aug.slot as 'arms' | 'legs')) {
      agent.missingLimbs = agent.missingLimbs.filter((l) => l !== aug.slot);
      agent.history.push(`Turn ${s.turn}: fitted a ${aug.name.toLowerCase()} in place of a lost limb.`);
    }
  });
}

export function removeAugment(state: CampaignState, agentId: string, slot: Slot): Outcome {
  return edit(state, (s) => {
    const agent = s.roster.find((a) => a.id === agentId);
    if (!agent || !agent.augments[slot]) return 'Nothing to remove.';
    if (slot === 'arms' || slot === 'legs') return 'Removing a limb augment would leave the agent without the limb. Replace it instead.';
    delete agent.augments[slot];
  });
}

export function recruit(state: CampaignState): Outcome {
  return edit(state, (s) => {
    if (livingAgents(s).length >= MAX_ROSTER) return `The roster is full (${MAX_ROSTER}).`;
    if (s.money < PRICES.recruit) return 'Not enough credits.';
    const used = new Set(s.roster.map((a) => a.name));
    const rng = createRng(hashSeed(s.seed, 'recruit', s.nextId));
    const name = rng.pick(AGENT_NAMES.filter((n) => !used.has(n)).concat(used.size >= AGENT_NAMES.length ? [`Recruit ${s.nextId}`] : []));
    s.money -= PRICES.recruit;
    s.roster.push(createAgent(`a${s.nextId}`, name, rng.pick(PERSONALITIES), 'recruit'));
    s.nextId++;
  });
}

export function startResearch(state: CampaignState, projectId: string): Outcome {
  return edit(state, (s) => {
    const project = RESEARCH.find((r) => r.id === projectId);
    if (!project) return 'Unknown project.';
    if (s.research.includes(projectId)) return 'Already researched.';
    if (project.requires && !s.research.includes(project.requires)) return 'Requires earlier research.';
    if (s.rp < project.cost) return 'Not enough research points.';
    s.rp -= project.cost;
    s.research.push(projectId);
  });
}

export function setLore(state: CampaignState, lore: boolean): CampaignState {
  return { ...state, settings: { ...state.settings, lore } };
}

export function doseCost(squad: SquadOrder[]): number {
  return squad.filter((o) => o.dosed).length * PRICES.dose;
}

export function agentNeedsDose(state: CampaignState, agent: Agent): boolean {
  return needsDose(derive(agent, { toleranceBonus: toleranceBonus(state) }));
}

export function missionSeed(state: CampaignState, contractId: string): number {
  return hashSeed(state.seed, 'mission', state.turn, contractId);
}

export function weeklyCosts(state: CampaignState): number {
  const paid = state.roster.filter((a) => a.status === 'active' || a.status === 'sleeper').length;
  return paid * PRICES.upkeepPerAgent + state.captives.length * PRICES.holdingPerCaptive;
}

export function districtIncome(state: CampaignState): number {
  return state.owned.reduce((sum, id) => sum + (REGION_BY_ID.get(id)?.income ?? 0), 0);
}

function shiftInfluence(s: CampaignState, regionId: string, delta: number, news: string[]) {
  const region = REGION_BY_ID.get(regionId);
  if (!region) return;
  const value = Math.max(0, Math.min(CONTROL_AT, (s.influence[regionId] ?? 0) + delta));
  s.influence[regionId] = value;
  const owned = s.owned.includes(regionId);
  if (!owned && value >= CONTROL_AT) {
    s.owned.push(regionId);
    news.push(`${region.name} is yours. It pays ¢${region.income} a turn.`);
  } else if (owned && value < LOSE_CONTROL_BELOW) {
    s.owned = s.owned.filter((id) => id !== regionId);
    news.push(`You have lost your grip on ${region.name}.`);
  }
}

/** Chance per turn that a sleeper is exposed: rises the longer they stay, falls with stealth. */
export function burnChance(state: CampaignState, agent: Agent, turnsIn: number): number {
  const stealth = derive(agent, { toleranceBonus: toleranceBonus(state) }).stats.stealth;
  return Math.max(0.03, Math.min(0.6, 0.06 + 0.04 * turnsIn - (stealth - 10) * 0.006));
}

/** Everything that happens between turns: income, sleepers, healing, new contracts. */
function endTurn(s: CampaignState, deployed: Set<string>, news: string[]) {
  const income = districtIncome(s);
  if (income) {
    s.money += income;
    news.push(`Your districts paid ¢${income.toLocaleString('en-GB')}.`);
  }
  const rng = createRng(hashSeed(s.seed, 'sleepers', s.turn));
  for (const sleeper of [...s.sleepers]) {
    const agent = s.roster.find((a) => a.id === sleeper.agentId)!;
    const region = REGION_BY_ID.get(sleeper.regionId)!;
    const turnsIn = s.turn - sleeper.since;
    if (rng.chance(burnChance(s, agent, turnsIn))) {
      s.sleepers = s.sleepers.filter((x) => x !== sleeper);
      if (rng.chance(0.5)) {
        agent.status = 'active';
        agent.hp = Math.max(1, agent.hp - 40);
        if (!agent.traits.includes('jumpy')) agent.traits.push('jumpy');
        agent.history.push(`Turn ${s.turn}: cover blown in ${region.name}; got out hurt.`);
        news.push(`${agent.name}'s cover in ${region.name} was blown. They made it home, hurt and jumpy.`);
      } else {
        agent.status = 'missing';
        agent.history.push(`Turn ${s.turn}: taken by ${RIVAL_SYNDICATE} in ${region.name}.`);
        news.push(`${agent.name} has gone dark in ${region.name}. ${RIVAL_SYNDICATE} has them.`);
      }
      continue;
    }
    const skim = 150 + 50 * region.offset;
    s.money += skim;
    shiftInfluence(s, region.id, 12, news);
    news.push(`${agent.name}, embedded in ${region.name}: +12 influence, ¢${skim} skimmed.`);
  }
  for (const agent of livingAgents(s)) {
    // Agents who just came back only start healing next turn.
    if (!deployed.has(agent.id)) agent.hp = Math.min(agent.maxHp, agent.hp + HEAL_PER_TURN);
  }
  s.turn++;
  s.contracts = generateContracts(s);
  s.news = news;
}

// --- Team development ----------------------------------------------------

/** Team news gathered during a debrief, grouped so three agents earning Ghost reads as one line. */
interface TeamNews {
  traits: Map<string, string[]>;
  steadied: string[];
  bonds: Map<number, string[]>;
}

function joinNames(names: string[]): string {
  return names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function newsLines(news: TeamNews): string[] {
  const lines: string[] = [];
  for (const [traitId, names] of news.traits) {
    const t = TRAIT_BY_ID.get(traitId)!;
    const who = joinNames(names);
    lines.push(t.kind === 'quirk' ? `${who} ${names.length > 1 ? 'are' : 'is'} ${t.name.toLowerCase()} for now: ${t.desc}` : `${who} earned ${t.name}: ${t.desc}`);
  }
  if (news.steadied.length) lines.push(`${joinNames(news.steadied)} ${news.steadied.length > 1 ? 'have' : 'has'} steadied and ${news.steadied.length > 1 ? 'are' : 'is'} no longer jumpy.`);
  const trusted = news.bonds.get(1);
  if (trusted?.length) lines.push(`New trust: ${trusted.join(', ')} (+1 combat and stealth together).`);
  const inseparable = news.bonds.get(2);
  if (inseparable?.length) lines.push(`Now inseparable: ${inseparable.join(', ')} (+2 combat and stealth together).`);
  return lines;
}

function grant(agent: Agent, traitId: string, turn: number, news: TeamNews) {
  if (agent.traits.includes(traitId)) return;
  const trait = TRAIT_BY_ID.get(traitId)!;
  agent.traits.push(traitId);
  if (trait.maxHp) agent.maxHp += trait.maxHp;
  agent.history.push(`Turn ${turn}: became ${trait.name.toLowerCase()}.`);
  news.traits.set(traitId, [...(news.traits.get(traitId) ?? []), agent.name]);
}

function developAgent(agent: Agent, out: MissionResult['outcomes'][number], result: MissionResult, wasOver: boolean, turn: number, events: TeamNews) {
  const r = agent.record;
  if (result.success && !result.alarm) r.quietMissions++;
  r.hacks += out.hacks;
  r.subdued += out.subdued;
  if (out.carried) r.carries++;
  if (wasOver) r.overTolerance++;
  if (out.downed) {
    r.timesDowned++;
    grant(agent, 'survivor', turn, events);
    grant(agent, 'jumpy', turn, events);
  } else if (agent.traits.includes('jumpy')) {
    agent.traits = agent.traits.filter((t) => t !== 'jumpy');
    events.steadied.push(agent.name);
  }
  if (r.quietMissions >= 3) grant(agent, 'ghost', turn, events);
  if (r.hacks >= 3) grant(agent, 'steady-hands', turn, events);
  if (r.carries >= 1) grant(agent, 'pack-mule', turn, events);
  if (r.subdued >= 10) grant(agent, 'peacekeeper', turn, events);
  if (r.overTolerance >= 3) grant(agent, 'iron-will', turn, events);
}

const BOND_NAMES = ['', 'Trusted', 'Inseparable'];

export function bondName(level: number): string {
  return BOND_NAMES[level] ?? '';
}

export function deploy(state: CampaignState, contractId: string, squad: SquadOrder[], orders: MissionOrders = DEFAULT_ORDERS): Outcome {
  return edit(state, (s) => {
    const contract = s.contracts.find((c) => c.id === contractId);
    if (!contract) return 'Unknown contract.';
    if (!squad.length) return 'Pick at least one agent.';
    if (squad.length > MAX_SQUAD) return `A squad is at most ${MAX_SQUAD} agents.`;
    const agents = squad.map((o) => s.roster.find((a) => a.id === o.agentId));
    if (agents.some((a) => !a || a.status !== 'active')) return 'One of those agents is not available.';
    const doses = doseCost(squad);
    if (doses > s.money) return 'Not enough credits for the Calyx doses.';
    s.money -= doses;

    const overBefore = new Map(agents.map((a) => [a!.id, agentNeedsDose(s, a!)]));
    const result = resolveMission({
      contract,
      squad: squad.map((o, i) => ({ agent: agents[i]!, drugs: o.drugs, dosed: o.dosed })),
      toleranceBonus: toleranceBonus(s),
      seed: missionSeed(state, contractId),
      rules: orders.rules,
      rivalOrders: orders.rivalOrders,
      bonds: s.bonds,
    });

    const team: TeamNews = { traits: new Map(), steadied: [], bonds: new Map() };
    for (const out of result.outcomes) {
      const agent = s.roster.find((a) => a.id === out.agentId)!;
      agent.missions++;
      agent.kills += out.kills;
      agent.hp = Math.max(1, Math.min(agent.maxHp, out.hp));
      if (out.kia) {
        agent.status = 'kia';
        agent.history.push(`Turn ${s.turn}: killed in action, ${contract.target}.`);
        continue;
      }
      if (out.lostLimb) {
        delete agent.augments[out.lostLimb];
        agent.missingLimbs.push(out.lostLimb);
        agent.history.push(`Turn ${s.turn}: lost ${out.lostLimb === 'arms' ? 'an arm' : 'a leg'} at ${contract.target}.`);
      }
      if (out.overdose) agent.history.push(`Turn ${s.turn}: overdosed after the mission.`);
      developAgent(agent, out, result, overBefore.get(agent.id) ?? false, s.turn, team);
    }

    // Bonds grow between every pair who went in together and came back.
    const survivors = result.outcomes.filter((o) => !o.kia).map((o) => o.agentId);
    for (let i = 0; i < survivors.length; i++) {
      for (let j = i + 1; j < survivors.length; j++) {
        const key = bondKey(survivors[i], survivors[j]);
        const before = bondLevel(s.bonds[key] ?? 0);
        s.bonds[key] = (s.bonds[key] ?? 0) + 1;
        const after = bondLevel(s.bonds[key]);
        if (after > before) {
          const [a, b] = [survivors[i], survivors[j]].map((id) => s.roster.find((x) => x.id === id)!.name);
          team.bonds.set(after, [...(team.bonds.get(after) ?? []), `${a} & ${b}`]);
        }
      }
    }

    const events = newsLines(team);

    if (result.success && result.kills === 0) {
      s.standing++;
      events.push('Word gets around that your people leave no bodies. Standing +1.');
    }
    if (result.captive) {
      if (s.captives.length < MAX_CAPTIVES) {
        s.captives.push({ agent: result.captive, since: s.turn });
        events.push(`${result.captive.name} (“${result.captive.codename}”) is in the holding cell.`);
        unlock(s, 'capture');
      } else {
        events.push(`The holding cell is full, so ${result.captive.name} was released at the city limits.`);
      }
    }

    unlock(s, CLIENT_CODEX[contract.client]);
    if (contract.rival) unlock(s, 'black-lantern');

    const upkeep = weeklyCosts(s);
    s.money += result.payout + result.cleanBonus - upkeep;
    s.rp += result.rp;
    s.history.push({ turn: s.turn, contract, result, squad: squad.map((o) => o.agentId), rules: orders.rules, upkeep, doseCost: doses, events });

    const news: string[] = [];
    if (contract.regionId) {
      const gain = result.success ? 20 + 5 * contract.difficulty + (result.kills === 0 ? 10 : 0) : -10;
      shiftInfluence(s, contract.regionId, gain, news);
      const region = REGION_BY_ID.get(contract.regionId)!;
      events.push(`Influence in ${region.name} ${gain >= 0 ? '+' : '−'}${Math.abs(gain)} (now ${s.influence[region.id]}%).`);
    }
    endTurn(s, new Set(squad.map((o) => o.agentId)), news);
  });
}

/** Skip a turn: everyone heals, upkeep is still paid. */
export function rest(state: CampaignState): Outcome {
  return edit(state, (s) => {
    s.money -= weeklyCosts(s);
    for (const agent of livingAgents(s)) agent.hp = Math.min(agent.maxHp, agent.hp + HEAL_PER_TURN);
    endTurn(s, new Set(), ['The cell lay low for a turn.']);
  });
}

// --- Sleepers ---------------------------------------------------------------

/** Embed an agent in a district. They build influence and skim funds each turn until recalled or burned. */
export function placeSleeper(state: CampaignState, agentId: string, regionId: string): Outcome {
  return edit(state, (s) => {
    const agent = s.roster.find((a) => a.id === agentId);
    if (!agent || agent.status !== 'active') return 'Agent not available.';
    if (!REGION_BY_ID.has(regionId)) return 'Unknown district.';
    if (s.sleepers.some((x) => x.regionId === regionId)) return 'You already have someone embedded there.';
    if (livingAgents(s).length <= 1) return 'Keep at least one agent at home.';
    agent.status = 'sleeper';
    s.sleepers.push({ agentId, regionId, since: s.turn });
    agent.history.push(`Turn ${s.turn}: went under in ${REGION_BY_ID.get(regionId)!.name}.`);
  });
}

export function recallSleeper(state: CampaignState, agentId: string): Outcome {
  return edit(state, (s) => {
    const sleeper = s.sleepers.find((x) => x.agentId === agentId);
    const agent = s.roster.find((a) => a.id === agentId);
    if (!sleeper || !agent) return 'Nobody to recall.';
    s.sleepers = s.sleepers.filter((x) => x !== sleeper);
    agent.status = 'active';
    agent.history.push(`Turn ${s.turn}: came in from the cold.`);
  });
}

// --- The Calyx run ------------------------------------------------------------

export interface CalyxStop {
  name: string;
  reward: number;
  /** Chance of being caught at this stop. */
  risk: number;
  caught: boolean;
}

const MARKET_STOPS = ['Noodle bar back door', 'Laundromat', 'Pachinko parlour', 'Night clinic', 'Rooftop drop', 'Customs blind spot'];

/** A push-your-luck smuggling run. The stops are fixed per turn, so reloading changes nothing. */
export function calyxStops(state: CampaignState, agentId: string): CalyxStop[] {
  const agent = state.roster.find((a) => a.id === agentId);
  const stealth = agent ? derive(agent, { toleranceBonus: toleranceBonus(state) }).stats.stealth : 10;
  const rng = createRng(hashSeed(state.seed, 'calyx', state.turn, agentId));
  return MARKET_STOPS.map((name, i) => {
    const risk = Math.max(0.03, Math.min(0.8, 0.06 + 0.09 * i - (stealth - 10) * 0.008));
    return { name, reward: 150 + 120 * i, risk, caught: rng.chance(risk) };
  });
}

/** Settle a run where the player pushed through `stops` stops before banking (or being caught). */
export function runCalyx(state: CampaignState, agentId: string, stops: number): Outcome {
  return edit(state, (s) => {
    if (s.calyxTurn === s.turn) return 'One Calyx run a turn.';
    const agent = s.roster.find((a) => a.id === agentId);
    if (!agent || agent.status !== 'active') return 'Agent not available.';
    const route = calyxStops(state, agentId).slice(0, Math.max(1, Math.min(MARKET_STOPS.length, stops)));
    s.calyxTurn = s.turn;
    const caughtAt = route.findIndex((stop) => stop.caught);
    if (caughtAt >= 0) {
      agent.hp = Math.max(1, agent.hp - 25);
      agent.history.push(`Turn ${s.turn}: caught on a Calyx run at the ${route[caughtAt].name.toLowerCase()}.`);
      return;
    }
    s.money += route.reduce((sum, stop) => sum + stop.reward, 0);
  });
}

// --- Captives -------------------------------------------------------------

export function persuadeChance(state: CampaignState): number {
  const persuader = livingAgents(state).some((a) => derive(a).tags.has('persuader'));
  return Math.min(0.85, 0.2 + 0.08 * state.standing + (persuader ? 0.15 : 0));
}

export function releaseCaptive(state: CampaignState, agentId: string): Outcome {
  return edit(state, (s) => {
    const captive = s.captives.find((c) => c.agent.id === agentId);
    if (!captive) return 'No such prisoner.';
    s.captives = s.captives.filter((c) => c !== captive);
    s.standing++;
  });
}

export function debriefCaptive(state: CampaignState, agentId: string): Outcome {
  return edit(state, (s) => {
    const captive = s.captives.find((c) => c.agent.id === agentId);
    if (!captive) return 'No such prisoner.';
    s.captives = s.captives.filter((c) => c !== captive);
    s.rp += 2;
  });
}

/** One attempt per captive per turn. On success they join the roster, augments and all. */
export function offerPlace(state: CampaignState, agentId: string): { outcome: Outcome; accepted: boolean } {
  let accepted = false;
  const outcome = edit(state, (s) => {
    const captive = s.captives.find((c) => c.agent.id === agentId);
    if (!captive) return 'No such prisoner.';
    if (captive.lastAttempt === s.turn) return 'They need time to think. Try again next turn.';
    if (livingAgents(s).length >= MAX_ROSTER) return `The roster is full (${MAX_ROSTER}).`;
    captive.lastAttempt = s.turn;
    accepted = createRng(hashSeed(s.seed, 'persuade', agentId, s.turn)).chance(persuadeChance(s));
    if (!accepted) return;
    s.captives = s.captives.filter((c) => c !== captive);
    const agent = { ...captive.agent, id: `a${s.nextId}`, origin: 'captive' as const, hp: Math.max(captive.agent.hp, 60) };
    agent.history = [`Turn ${s.turn}: left ${RIVAL_SYNDICATE} and joined your syndicate.`];
    s.nextId++;
    s.roster.push(agent);
  });
  return { outcome, accepted: outcome.ok && accepted };
}

export function score(state: CampaignState): number {
  const wins = state.history.filter((h) => h.result.success).length;
  return wins * 1000 + Math.max(0, state.money) + livingAgents(state).length * 500 + state.standing * 250 + state.owned.length * 1500;
}

export function describeTraits(agent: Agent): string {
  return agentTraits(agent).map((t) => t.name).join(', ');
}
