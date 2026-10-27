// Campaign state and the actions the player can take between missions.
// Every action returns a new state (the old one is never mutated) or an error message.
import { createAgent, derive, needsDose } from './agent';
import {
  AGENT_NAMES, AUGMENT_BY_ID, CAMPAIGN_LENGTH, CLIENTS, HEAL_PER_TURN, MAX_ROSTER, MAX_SQUAD, MISSIONS, PRICES, RESEARCH, TARGET_SITES,
} from './data';
import { resolveMission } from './mission';
import { createRng, hashSeed } from './rng';
import type { Agent, Contract, Drugs, MissionResult, MissionType, Slot } from './types';

export interface DebriefRecord {
  turn: number;
  contract: Contract;
  result: MissionResult;
  squad: string[];
  upkeep: number;
  doseCost: number;
}

export interface CampaignState {
  version: 1;
  seed: number;
  turn: number;
  money: number;
  rp: number;
  research: string[];
  roster: Agent[];
  contracts: Contract[];
  history: DebriefRecord[];
  nextId: number;
}

export interface SquadOrder {
  agentId: string;
  drugs: Drugs;
  dosed: boolean;
}

export type Outcome = { ok: true; state: CampaignState } | { ok: false; error: string };

const fail = (error: string): Outcome => ({ ok: false, error });

export function newCampaign(seed: number): CampaignState {
  const rng = createRng(hashSeed(seed, 'roster'));
  const names = rng.shuffle(AGENT_NAMES);
  const state: CampaignState = {
    version: 1,
    seed,
    turn: 1,
    money: 6000,
    rp: 0,
    research: [],
    roster: names.slice(0, 4).map((name, i) => createAgent(`a${i + 1}`, name)),
    contracts: [],
    history: [],
    nextId: 5,
  };
  state.contracts = generateContracts(state);
  return state;
}

export function generateContracts(state: CampaignState): Contract[] {
  const rng = createRng(hashSeed(state.seed, 'contracts', state.turn));
  const types = rng.shuffle(Object.keys(MISSIONS) as MissionType[]).slice(0, 3);
  const base = 1 + Math.floor((state.turn - 1) * 0.45);
  return types.map((type, i) => {
    const difficulty = Math.max(1, Math.min(5, base + rng.int(-1, 1)));
    const payout = Math.round(((1100 + 900 * difficulty) * MISSIONS[type].payoutMult) / 50) * 50;
    return { id: `t${state.turn}c${i}`, type, difficulty, client: rng.pick(CLIENTS), target: rng.pick(TARGET_SITES), payout };
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
    s.roster.push(createAgent(`a${s.nextId}`, name));
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

export function doseCost(squad: SquadOrder[]): number {
  return squad.filter((o) => o.dosed).length * PRICES.dose;
}

export function agentNeedsDose(state: CampaignState, agent: Agent): boolean {
  return needsDose(derive(agent, { toleranceBonus: toleranceBonus(state) }));
}

export function missionSeed(state: CampaignState, contractId: string): number {
  return hashSeed(state.seed, 'mission', state.turn, contractId);
}

export function deploy(state: CampaignState, contractId: string, squad: SquadOrder[]): Outcome {
  return edit(state, (s) => {
    const contract = s.contracts.find((c) => c.id === contractId);
    if (!contract) return 'Unknown contract.';
    if (!squad.length) return 'Pick at least one agent.';
    if (squad.length > MAX_SQUAD) return `A squad is at most ${MAX_SQUAD} agents.`;
    const agents = squad.map((o) => s.roster.find((a) => a.id === o.agentId));
    if (agents.some((a) => !a || a.status !== 'active')) return 'One of those agents is not available.';
    const doses = doseCost(squad);
    if (doses > s.money) return 'Not enough credits for the suppressant doses.';
    s.money -= doses;

    const result = resolveMission({
      contract,
      squad: squad.map((o, i) => ({ agent: agents[i]!, drugs: o.drugs, dosed: o.dosed })),
      toleranceBonus: toleranceBonus(s),
      seed: missionSeed(state, contractId),
    });

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
    }

    const upkeep = livingAgents(s).length * PRICES.upkeepPerAgent;
    s.money += result.payout - upkeep;
    s.rp += result.rp;
    s.history.push({ turn: s.turn, contract, result, squad: squad.map((o) => o.agentId), upkeep, doseCost: doses });

    const deployed = new Set(squad.map((o) => o.agentId));
    for (const agent of livingAgents(s)) {
      // Agents who just came back only start healing next turn.
      if (!deployed.has(agent.id)) agent.hp = Math.min(agent.maxHp, agent.hp + HEAL_PER_TURN);
    }
    s.turn++;
    s.contracts = generateContracts(s);
  });
}

/** Skip a turn: everyone heals, upkeep is still paid. */
export function rest(state: CampaignState): Outcome {
  return edit(state, (s) => {
    s.money -= livingAgents(s).length * PRICES.upkeepPerAgent;
    for (const agent of livingAgents(s)) agent.hp = Math.min(agent.maxHp, agent.hp + HEAL_PER_TURN * 2);
    s.turn++;
    s.contracts = generateContracts(s);
  });
}

export function score(state: CampaignState): number {
  const wins = state.history.filter((h) => h.result.success).length;
  return wins * 1000 + Math.max(0, state.money) + livingAgents(state).length * 500;
}
