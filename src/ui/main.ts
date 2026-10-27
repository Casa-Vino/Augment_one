import './style.css';
import { agentTraits, derive, malfunctionChance, NO_DRUGS, type Derived } from '../sim/agent';
import {
  agentNeedsDose, bondName, debriefCaptive, deploy, doseCost, installAugment, isFinished, isUnlocked, livingAgents, migrate, newCampaign, offerPlace,
  persuadeChance, recruit, releaseCaptive, removeAugment, rest, score, setLore, startResearch, toleranceBonus, weeklyCosts,
  type CampaignState, type MissionOrders, type SquadOrder,
} from '../sim/campaign';
import {
  AUGMENTS, CAMPAIGN_LENGTH, MAX_ROSTER, MAX_SQUAD, MISSIONS, PRICES, RESEARCH, RIVAL_SYNDICATE, SLOT_LABELS, SLOTS, TRAITS,
} from '../sim/data';
import { agentBio, briefingLine, CODEX, rivalLine } from '../sim/lore';
import { bondBonusFor, bondKey, bondLevel, missionPhases, resolveMission } from '../sim/mission';
import { hashSeed } from '../sim/rng';
import type { Agent, Augment, Contract, Drugs, PhaseKind, RivalOrders, RulesOfEngagement, Slot, Stat } from '../sim/types';
import { estimatePhases, powerRunsOutAt } from './odds';

// --- State ------------------------------------------------------------------

const SAVE_KEY = 'augment-save-v2';
const V1_SAVE_KEY = 'augment-save-v1';

type Screen =
  | { name: 'hq' }
  | { name: 'agent'; agentId: string; slot?: Slot }
  | { name: 'plan'; contractId: string }
  | { name: 'debrief'; index: number; instant: boolean }
  | { name: 'codex' }
  | { name: 'help' };

let game: CampaignState = load() ?? newCampaign(randomSeed());
let screen: Screen = { name: 'hq' };
let squad = new Map<string, SquadOrder>();
let missionOrders: MissionOrders = { rules: 'lethal', rivalOrders: 'avoid' };
let toast: { text: string; bad: boolean } | null = null;
let versions: string[] = [];

const app = document.getElementById('app')!;

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function load(): CampaignState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(V1_SAVE_KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
  } catch {
    // Saving is a convenience; the game still runs without storage.
  }
}

function apply(outcome: ReturnType<typeof deploy>, success?: string): boolean {
  if (!outcome.ok) {
    toast = { text: outcome.error, bad: true };
    return false;
  }
  game = outcome.state;
  save();
  if (success) toast = { text: success, bad: false };
  return true;
}

function go(next: Screen) {
  screen = next;
  toast = null;
  render();
  window.scrollTo({ top: 0 });
}

// --- Formatting helpers -----------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const cr = (n: number) => `¢${Math.round(n).toLocaleString('en-GB')}`;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`).replace('-', '−');
const STAT_LABELS: Record<Stat, string> = { combat: 'Combat', stealth: 'Stealth', tech: 'Tech', armor: 'Armour', speed: 'Speed', perception: 'Perception' };
const STATS = Object.keys(STAT_LABELS) as Stat[];
const KIND_LABELS: Record<PhaseKind, string> = { stealth: 'Stealth', combat: 'Combat', hack: 'Hack', speed: 'Speed', rival: 'Rival' };
const lore = () => game.settings.lore;

function oddsClass(p: number) {
  return p >= 0.75 ? 'good' : p >= 0.45 ? 'fair' : 'bad';
}

function agentDerived(agent: Agent, drugs: Drugs = NO_DRUGS): Derived {
  return derive(agent, { drugs, toleranceBonus: toleranceBonus(game) });
}

function threat(n: number) {
  return `<span class="threat" title="Threat level ${n} of 5">${'◆'.repeat(n)}<span class="dim">${'◆'.repeat(5 - n)}</span></span>`;
}

function hpBar(agent: Agent) {
  const p = agent.hp / agent.maxHp;
  return `<div class="bar hp ${p < 0.4 ? 'low' : ''}" title="${agent.hp}/${agent.maxHp} HP"><span style="width:${p * 100}%"></span></div>`;
}

function traitChips(agent: Agent) {
  return agentTraits(agent)
    .map((t) => `<span class="trait ${t.kind}" title="${esc(t.desc)}">${t.name}</span>`)
    .join('');
}

function segmented<T extends string>(name: string, value: T, options: [T, string][]) {
  return `<div class="segmented" role="radiogroup" aria-label="${name}">${options
    .map(([v, label]) => `<button role="radio" aria-checked="${v === value}" class="${v === value ? 'on' : ''}" data-action="set-${name}" data-value="${v}">${label}</button>`)
    .join('')}</div>`;
}

// --- Views ------------------------------------------------------------------

function topbar() {
  const done = isFinished(game);
  return `
  <header class="topbar">
    <button class="brand" data-action="home" aria-label="Back to HQ">AUGMENT</button>
    <div class="readouts">
      <span><small>Turn</small> ${Math.min(game.turn, CAMPAIGN_LENGTH)}/${CAMPAIGN_LENGTH}${done ? ' · ended' : ''}</span>
      <span><small>Credits</small> ${cr(game.money)}</span>
      <span><small>Research</small> ${game.rp} RP</span>
      <span title="Reputation for clean work. Helps persuade captives."><small>Standing</small> ${game.standing}</span>
    </div>
    <div class="top-actions">
      <button class="ghost" data-action="codex">Codex</button>
      <button class="ghost" data-action="help">How to play</button>
      <button class="ghost" data-action="new-campaign">New campaign</button>
    </div>
  </header>`;
}

function slotPips(agent: Agent) {
  return `<div class="pips">${SLOTS.map((slot) => {
    const id = agent.augments[slot];
    const missing = agent.missingLimbs.includes(slot as 'arms' | 'legs') && !id;
    const name = id ? AUGMENTS.find((a) => a.id === id)?.name : missing ? `Missing ${slot === 'arms' ? 'arm' : 'leg'}` : 'Empty';
    return `<span class="pip ${id ? 'on' : ''} ${missing ? 'missing' : ''}" title="${SLOT_LABELS[slot]}: ${esc(name ?? '')}"></span>`;
  }).join('')}</div>`;
}

function agentCard(agent: Agent) {
  if (agent.status === 'kia') {
    return `<div class="card agent kia"><div class="row"><strong>${esc(agent.name)}</strong><span class="tag bad">KIA</span></div><p class="muted">${agent.missions} missions</p></div>`;
  }
  const d = agentDerived(agent);
  const over = d.load > d.tolerance;
  const injured = agent.missingLimbs.some((l) => !agent.augments[l]);
  return `
  <button class="card agent" data-action="open-agent" data-id="${agent.id}">
    <div class="row"><strong>${esc(agent.name)}</strong>${agent.origin === 'captive' ? '<span class="tag">Turned</span>' : ''}${injured ? '<span class="tag bad">Injured</span>' : ''}</div>
    ${hpBar(agent)}
    ${slotPips(agent)}
    <div class="traits">${traitChips(agent)}</div>
    <div class="mini">
      <span title="Rejection load / tolerance" class="${over ? 'warn' : ''}">Load ${d.load}/${d.tolerance}</span>
      <span title="Energy capacity${d.drain ? ' / drain per phase' : ''}">Energy ${d.energy}${d.drain ? ` · −${d.drain}/phase` : ''}</span>
    </div>
  </button>`;
}

function contractCard(c: Contract) {
  const m = MISSIONS[c.type];
  return `
  <div class="card contract">
    <div class="row"><strong>${m.label}</strong>${threat(c.difficulty)}</div>
    <p>${esc(c.client)} wants a job done at ${esc(c.target)}.</p>
    ${lore() ? `<p class="quote">${esc(briefingLine(c.type, c.target, hashSeed(c.id, game.seed)))}</p>` : `<p class="muted">${m.blurb}</p>`}
    <div class="phases">${missionPhases(c).map((p) => `<span class="phase ${p.kind}" title="${esc(p.name)}">${KIND_LABELS[p.kind]}</span>`).join('<span class="arrow">›</span>')}</div>
    <div class="flags">
      ${c.rival ? `<span class="tag warn">Rival on site</span>` : ''}
      ${c.cleanBonus ? `<span class="tag good" title="Paid if nobody is killed">+${cr(c.cleanBonus)} if no deaths</span>` : ''}
    </div>
    <div class="row"><span class="pay">${cr(c.payout)}</span><button data-action="plan" data-id="${c.id}">Plan mission</button></div>
  </div>`;
}

function holdingCell() {
  if (!game.captives.length) return '';
  const chance = persuadeChance(game);
  const full = livingAgents(game).length >= MAX_ROSTER;
  return `
  <section class="panel holding">
    <h2>Holding cell</h2>
    <p class="muted small">Each prisoner costs ${cr(PRICES.holdingPerCaptive)} a turn. Offers succeed ${pct(chance)} of the time, at most one attempt per prisoner per turn.</p>
    ${game.captives.map((c) => {
      const tried = c.lastAttempt === game.turn;
      const augs = Object.values(c.agent.augments).map((id) => AUGMENTS.find((a) => a.id === id)?.name).filter(Boolean).join(', ');
      return `<div class="card captive">
        <div class="row"><strong>${esc(c.agent.name)} <span class="muted">“${esc(c.agent.codename ?? '')}”</span></strong><span class="traits">${traitChips(c.agent)}</span></div>
        <p class="muted small">${augs || 'No augments'}</p>
        <div class="actions">
          <button data-action="offer" data-id="${c.agent.id}" ${tried || full ? 'disabled' : ''} title="${full ? 'Roster is full' : tried ? 'Already asked this turn' : 'They join with their augments'}">Offer a place (${pct(chance)})</button>
          <button class="ghost" data-action="debrief-captive" data-id="${c.agent.id}" title="Learn what they know, then let them go">Debrief and release (+2 RP)</button>
          <button class="ghost" data-action="release" data-id="${c.agent.id}">Release (+1 standing)</button>
        </div>
      </div>`;
    }).join('')}
  </section>`;
}

function hqView() {
  const living = livingAgents(game);
  const finished = isFinished(game);
  const research = RESEARCH.map((r) => {
    const done = game.research.includes(r.id);
    const blocked = r.requires && !game.research.includes(r.requires);
    return `<li class="${done ? 'done' : ''}">
      <div><strong>${r.name}</strong><p class="muted">${r.desc}${blocked ? ` Requires ${RESEARCH.find((x) => x.id === r.requires)?.name}.` : ''}</p></div>
      ${done ? '<span class="tag good">Done</span>' : `<button data-action="research" data-id="${r.id}" ${finished || blocked || game.rp < r.cost ? 'disabled' : ''}>${r.cost} RP</button>`}
    </li>`;
  }).join('');
  const history = game.history.map((h, i) => ({ h, i })).reverse().map(({ h, i }) => `
    <li><button class="link" data-action="view-debrief" data-index="${i}">Turn ${h.turn}: ${MISSIONS[h.contract.type].label}, ${esc(h.contract.target)}</button>
      <span class="tag ${h.result.success ? 'good' : 'bad'}">${h.result.success ? (h.result.compromised ? 'Compromised' : 'Success') : 'Failed'}</span></li>`).join('');

  return `
  ${finished ? endBanner(finished) : ''}
  <main class="hq">
    <div class="col">
      <section class="panel roster">
        <div class="panel-head"><h2>Roster</h2><button data-action="recruit" ${finished || living.length >= MAX_ROSTER || game.money < PRICES.recruit ? 'disabled' : ''}>Recruit ${cr(PRICES.recruit)}</button></div>
        <div class="grid">${game.roster.map(agentCard).join('')}</div>
        <p class="muted small">Running costs ${cr(weeklyCosts(game))} a turn. Agents heal 30 HP a turn while not deployed.</p>
      </section>
      ${holdingCell()}
      <section class="panel history">
        <h2>Mission log</h2>
        ${history ? `<ul class="list">${history}</ul>` : '<p class="muted">No missions yet. Augment your agents, then plan a contract.</p>'}
      </section>
    </div>
    <div class="col">
      <section class="panel contracts">
        <div class="panel-head"><h2>Contracts</h2>${finished ? '' : '<button class="ghost" data-action="rest" title="Skip a turn. Everyone heals double; running costs are still due.">Lie low a turn</button>'}</div>
        ${finished ? '<p class="muted">The campaign is over.</p>' : game.contracts.map(contractCard).join('')}
      </section>
      <section class="panel research">
        <h2>Research</h2>
        <p class="muted small">Successful contracts earn research points: the threat level, +1 with no alarm, +1 for a non-lethal job with no deaths.</p>
        <ul class="list">${research}</ul>
      </section>
    </div>
  </main>
  ${footer()}`;
}

function footer() {
  const older = versions.filter((v) => v !== 'v2');
  return `<footer class="footer">
    <span>Augment v2</span>
    ${older.length ? `<span>Earlier versions: ${older.map((v) => `<a href="./${v}/">${v}</a>`).join(' · ')}</span>` : ''}
    <span class="muted">On a phone: open this page, then “Add to Home Screen” or “Install app” to play it like an app, offline too.</span>
  </footer>`;
}

function endBanner(kind: 'won' | 'lost') {
  const wins = game.history.filter((h) => h.result.success).length;
  const clean = game.history.filter((h) => h.result.success && h.result.kills === 0).length;
  return `<div class="banner ${kind}">
    <div><h2>${kind === 'won' ? 'Campaign complete' : 'The syndicate has collapsed'}</h2>
    <p>${wins} of ${game.history.length} contracts completed (${clean} without a death) · ${livingAgents(game).length} agents · standing ${game.standing} · ${cr(game.money)}. Score <strong>${score(game).toLocaleString('en-GB')}</strong>.</p></div>
    <button data-action="new-campaign">New campaign</button>
  </div>`;
}

function statBars(d: Derived) {
  return `<div class="stats">${STATS.map((s) => {
    const v = d.stats[s];
    return `<div class="stat"><span>${STAT_LABELS[s]}</span><div class="bar"><span style="width:${Math.min(100, (v / 40) * 100)}%"></span></div><b>${v}</b></div>`;
  }).join('')}</div>`;
}

function deltaChips(agent: Agent, aug: Augment) {
  const before = agentDerived(agent);
  const after = agentDerived({ ...agent, augments: { ...agent.augments, [aug.slot]: aug.id }, missingLimbs: agent.missingLimbs.filter((l) => l !== aug.slot) });
  const chips: string[] = [];
  for (const s of STATS) {
    const delta = after.stats[s] - before.stats[s];
    if (delta) chips.push(`<span class="chip ${delta > 0 ? 'up' : 'down'}">${signed(delta)} ${STAT_LABELS[s].toLowerCase()}</span>`);
  }
  const budget = [
    [after.energy - before.energy, 'energy', true],
    [after.drain - before.drain, 'drain', false],
    [after.load - before.load, 'load', false],
    [after.signature - before.signature, 'signature', false],
  ] as const;
  for (const [delta, label, goodWhenUp] of budget) {
    if (delta) chips.push(`<span class="chip ${(delta > 0) === goodWhenUp ? 'up' : 'down'}">${signed(delta)} ${label}</span>`);
  }
  if (aug.tags?.includes('nonlethal')) chips.push('<span class="chip up">Non-lethal</span>');
  if (aug.tags?.includes('persuader')) chips.push('<span class="chip up">Persuasion</span>');
  const gained = after.synergies.filter((s) => !before.synergies.some((b) => b.id === s.id));
  for (const s of gained) chips.push(`<span class="chip syn ${Object.values(s.stats).some((v) => (v ?? 0) < 0) ? 'down' : 'up'}" title="${esc(s.desc)}">Synergy: ${s.name}</span>`);
  return chips.join('');
}

function bondsList(agent: Agent) {
  const rows = game.roster
    .filter((other) => other.id !== agent.id && other.status === 'active')
    .map((other) => ({ other, together: game.bonds[bondKey(agent.id, other.id)] ?? 0 }))
    .filter((b) => b.together > 0)
    .sort((a, b) => b.together - a.together);
  if (!rows.length) return '<p class="muted small">No missions with teammates yet. Agents who go in together two or more times start to trust each other.</p>';
  return `<ul class="list">${rows.map(({ other, together }) => {
    const level = bondLevel(together);
    return `<li><span>${esc(other.name)}</span><span class="muted small">${together} ${together === 1 ? 'mission' : 'missions'} together</span>${level ? `<span class="tag good">${bondName(level)}</span>` : ''}</li>`;
  }).join('')}</ul>`;
}

function agentView(agentId: string, openSlot?: Slot) {
  const agent = game.roster.find((a) => a.id === agentId);
  if (!agent) return hqView();
  const d = agentDerived(agent);
  const over = d.load - d.tolerance;
  const phasesOfPower = d.drain ? Math.floor(d.energy / d.drain) : Infinity;

  const slots = SLOTS.map((slot) => {
    const id = agent.augments[slot];
    const aug = id ? AUGMENTS.find((a) => a.id === id) : undefined;
    const missing = agent.missingLimbs.includes(slot as 'arms' | 'legs') && !id;
    const open = openSlot === slot;
    const options = open
      ? AUGMENTS.filter((a) => a.slot === slot).map((a) => {
          const unlocked = isUnlocked(game, a.id);
          const installed = a.id === id;
          const req = a.research ? RESEARCH.find((r) => r.id === a.research)?.name : '';
          return `<li class="option ${installed ? 'installed' : ''} ${unlocked ? '' : 'locked'}">
            <div class="opt-main"><strong>${a.name}</strong> <span class="tier">T${a.tier}</span><p class="muted">${a.desc}</p>
              <div class="chips">${installed ? '<span class="chip">Installed</span>' : deltaChips(agent, a)}</div></div>
            ${installed ? '' : unlocked ? `<button data-action="install" data-id="${a.id}" ${game.money < a.cost ? 'disabled' : ''}>Install ${cr(a.cost)}</button>` : `<span class="tag">Research: ${req}</span>`}
          </li>`;
        }).join('')
      : '';
    return `<div class="slot ${open ? 'open' : ''}">
      <div class="slot-head">
        <span class="slot-name">${SLOT_LABELS[slot]}</span>
        <span class="slot-aug ${missing ? 'bad' : aug ? '' : 'muted'}">${aug ? aug.name : missing ? `Missing ${slot === 'arms' ? 'arm' : 'leg'}: fit a replacement` : 'Natural'}</span>
        <span class="slot-actions">
          ${aug && slot !== 'arms' && slot !== 'legs' ? `<button class="ghost" data-action="remove" data-slot="${slot}">Remove</button>` : ''}
          <button data-action="toggle-slot" data-slot="${slot}">${open ? 'Close' : aug ? 'Swap' : 'Fit'}</button>
        </span>
      </div>
      ${open ? `<ul class="options">${options}</ul>` : ''}
    </div>`;
  }).join('');

  const traits = agentTraits(agent);

  return `
  <main class="agent-screen">
    <div class="crumbs"><button class="link" data-action="home">‹ HQ</button></div>
    <h1>${esc(agent.name)} ${agent.status === 'kia' ? '<span class="tag bad">KIA</span>' : ''}</h1>
    <p class="muted">${agent.hp}/${agent.maxHp} HP · ${agent.missions} missions · ${agent.kills} kills · ${agent.record.subdued} subdued</p>
    ${lore() ? `<p class="bio">${esc(agentBio(agent))}</p>` : ''}
    <div class="two-col">
      <section class="panel body">
        <h2>Body</h2>
        <p class="muted small">Swapping an augment destroys the old one. Lost limbs can only be fixed by fitting something in that slot.</p>
        ${slots}
      </section>
      <section class="panel readout">
        <h2>Capabilities</h2>
        ${statBars(d)}
        <p class="muted small">Shown without squad bonuses. Some traits only apply in small or large squads, or on non-lethal missions.</p>
        <h2>Traits</h2>
        <ul class="list">${traits.map((t) => `<li><div><strong>${t.name}</strong> <span class="trait ${t.kind}">${t.kind}</span><p class="muted">${t.desc}</p></div></li>`).join('')}</ul>
        <h2>Bonds</h2>
        ${bondsList(agent)}
        <h2>Budgets</h2>
        <div class="budget">
          <div class="row"><span>Energy</span><b>${d.energy}</b></div>
          <p class="muted small">${d.drain ? `Powered augments drain ${d.drain} per phase (double in combat): about ${phasesOfPower} quiet phases before they shut down.` : 'No powered augments. Nothing can run dry.'}</p>
          <div class="row"><span>Rejection load</span><b class="${over > 0 ? 'warn' : ''}">${d.load} / ${d.tolerance}</b></div>
          <div class="bar load ${over > 0 ? 'over' : ''}"><span style="width:${Math.min(100, (d.load / (d.tolerance * 1.6)) * 100)}%"></span><i style="left:${(1 / 1.6) * 100}%"></i></div>
          <p class="muted small">${over > 0 ? `Over tolerance. Each phase: ${pct(malfunctionChance(d, false))} chance of a rejection episode without Calyx, ${pct(malfunctionChance(d, true))} with a ${cr(PRICES.dose)} dose.` : 'Within tolerance. No Calyx needed.'}</p>
          <div class="row"><span>Signature</span><b class="${d.signature > 3 ? 'warn' : ''}">${signed(d.signature)}</b></div>
          <p class="muted small">Noise and heat. Loud agents give the team away and draw enemy fire.</p>
        </div>
        ${d.synergies.length ? `<h2>Synergies</h2><ul class="list">${d.synergies.map((s) => `<li><div><strong>${s.name}</strong><p class="muted">${s.desc}</p></div></li>`).join('')}</ul>` : ''}
        ${agent.history.length ? `<h2>Record</h2><ul class="list small">${agent.history.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      </section>
    </div>
  </main>`;
}

function defaultOrder(agent: Agent): SquadOrder {
  return { agentId: agent.id, drugs: { ...NO_DRUGS }, dosed: agentNeedsDose(game, agent) };
}

function squadDerived(orders: SquadOrder[]) {
  const ids = orders.map((o) => o.agentId);
  return orders.map((o) => {
    const agent = game.roster.find((a) => a.id === o.agentId)!;
    return derive(agent, {
      drugs: o.drugs, toleranceBonus: toleranceBonus(game), squadSize: orders.length, rules: missionOrders.rules, bondBonus: bondBonusFor(o.agentId, ids, game.bonds),
    });
  });
}

function forecast(contract: Contract, orders: SquadOrder[]): number {
  const runs = 120;
  let wins = 0;
  const members = orders.map((o) => ({ agent: game.roster.find((a) => a.id === o.agentId)!, drugs: o.drugs, dosed: o.dosed }));
  for (let i = 0; i < runs; i++) {
    const r = resolveMission({ contract, squad: members, toleranceBonus: toleranceBonus(game), seed: 9000 + i, rules: missionOrders.rules, rivalOrders: missionOrders.rivalOrders, bonds: game.bonds });
    if (r.success) wins++;
  }
  return wins / runs;
}

function rivalDossier(contract: Contract) {
  const rival = contract.rival;
  if (!rival) return '';
  const augs = Object.values(rival.augments).map((id) => AUGMENTS.find((a) => a.id === id)?.name).filter(Boolean);
  return `<div class="dossier">
    <h2>Rival operative</h2>
    ${lore() ? `<p class="quote">${esc(rivalLine(rival))}</p>` : `<p><strong>${esc(rival.name)}</strong> “${esc(rival.codename ?? '')}”, ${RIVAL_SYNDICATE}.</p>`}
    <p class="muted small">Augments: ${augs.join(', ') || 'none'}. ${traitChips(rival)}</p>
    ${segmented<RivalOrders>('rival', missionOrders.rivalOrders, [['avoid', 'Avoid'], ['capture', 'Capture'], ['eliminate', 'Eliminate']])}
    <p class="muted small">${{
      avoid: 'Stay out of their way. If they spot the team, it comes to a fight anyway.',
      capture: 'Subdue them and carry them out. A captive can be released, debriefed, or recruited with their augments.',
      eliminate: `Remove them. Counts as a death, so no clean bonus.`,
    }[missionOrders.rivalOrders]}</p>
  </div>`;
}

function planView(contractId: string) {
  const contract = game.contracts.find((c) => c.id === contractId);
  if (!contract) return hqView();
  const m = MISSIONS[contract.type];
  const orders = [...squad.values()];
  const team = squadDerived(orders);
  const phases = estimatePhases(contract, team, missionOrders.rules, missionOrders.rivalOrders);
  const odds = orders.length ? forecast(contract, orders) : 0;
  const doses = doseCost(orders);
  const ids = orders.map((o) => o.agentId);
  const phaseList = missionPhases(contract);

  const agents = livingAgents(game).map((agent) => {
    const order = squad.get(agent.id);
    const d = order ? team[ids.indexOf(agent.id)] : agentDerived(agent);
    const runsOut = order ? powerRunsOutAt(contract, d) : null;
    const over = d.load > d.tolerance;
    const bonded = ids.filter((id) => id !== agent.id && bondLevel(game.bonds[bondKey(agent.id, id)] ?? 0) > 0).map((id) => game.roster.find((a) => a.id === id)!.name);
    const drugRow = (key: keyof Drugs, label: string, effect: string) => `
      <label class="drug"><span>${label}<small>${effect}</small></span>
        <input type="range" min="0" max="3" step="1" value="${order?.drugs[key] ?? 0}" data-action="drug" data-id="${agent.id}" data-drug="${key}" />
        <b>${order?.drugs[key] ?? 0}</b></label>`;
    return `<div class="card pick ${order ? 'selected' : ''}">
      <label class="row pick-head">
        <span><input type="checkbox" data-action="toggle-squad" data-id="${agent.id}" ${order ? 'checked' : ''} ${!order && squad.size >= MAX_SQUAD ? 'disabled' : ''}/> <strong>${esc(agent.name)}</strong></span>
        <span class="muted small">${agent.hp} HP · C${d.stats.combat} S${d.stats.stealth} T${d.stats.tech} Sp${d.stats.speed}</span>
      </label>
      ${hpBar(agent)}
      <div class="traits">${traitChips(agent)}${bonded.length ? `<span class="trait bond" title="Bond bonus to combat and stealth">Bond with ${esc(bonded.join(', '))}</span>` : ''}</div>
      ${order ? `
        <div class="drugs">
          ${drugRow('intelligence', 'Intelligence', '+2 tech')}
          ${drugRow('perception', 'Perception', '+2 perception, +1 combat')}
          ${drugRow('adrenaline', 'Adrenaline', '+2 combat, +2 speed, louder')}
        </div>
        ${over ? `<label class="dose"><input type="checkbox" data-action="dose" data-id="${agent.id}" ${order.dosed ? 'checked' : ''}/> Calyx dose (${cr(PRICES.dose)}). Rejection risk per phase: ${pct(malfunctionChance(d, order.dosed))}</label>` : ''}
        ${missionOrders.rules === 'nonlethal' && !d.tags.has('nonlethal') ? '<p class="warn small">No non-lethal gear: −3 to takedowns.</p>' : ''}
        ${runsOut !== null ? `<p class="warn small">Powered augments will run dry during “${esc(phaseList[runsOut].name)}”.</p>` : ''}
        ${order.drugs.intelligence + order.drugs.perception + order.drugs.adrenaline >= 6 ? '<p class="warn small">Heavy dosing: overdose risk on the comedown.</p>' : ''}
      ` : ''}
    </div>`;
  }).join('');

  return `
  <main class="plan">
    <div class="crumbs"><button class="link" data-action="home">‹ HQ</button></div>
    <h1>${m.label} ${threat(contract.difficulty)}</h1>
    <p>${esc(contract.client)} · ${esc(contract.target)} · <span class="pay">${cr(contract.payout)}</span>${contract.cleanBonus ? ` <span class="tag good">+${cr(contract.cleanBonus)} if nobody dies</span>` : ''}</p>
    ${lore() ? `<p class="quote">${esc(briefingLine(contract.type, contract.target, hashSeed(contract.id, game.seed)))}</p>` : ''}
    <p class="muted">${m.blurb}</p>
    <div class="two-col">
      <section class="panel">
        <h2>Rules of engagement</h2>
        ${segmented<RulesOfEngagement>('rules', missionOrders.rules, [['lethal', 'Lethal'], ['nonlethal', 'Non-lethal']])}
        <p class="muted small">${missionOrders.rules === 'lethal' ? 'Guards who get in the way are killed.' : 'Guards are knocked out, never killed. Harder without non-lethal gear, but earns standing, extra research and any no-deaths bonus.'}</p>
        ${rivalDossier(contract)}
        <h2>Squad <small class="muted">${squad.size}/${MAX_SQUAD}</small></h2>
        <div class="grid picks">${agents}</div>
      </section>
      <section class="panel">
        <h2>Analyst forecast</h2>
        <div class="forecast ${orders.length ? oddsClass(odds) : ''}">${orders.length ? pct(odds) : '—'}<small>${orders.length ? 'of simulated runs succeed' : 'Select a squad'}</small></div>
        <ol class="phase-list">${phases.map((p) => `
          <li><span class="phase ${p.kind}">${KIND_LABELS[p.kind]}</span>
            <div><strong>${esc(p.name)}</strong>${p.objective ? ' <span class="tag">Objective</span>' : ''}<p class="muted small">${p.note}</p></div>
            <b class="${oddsClass(p.chance)}">${orders.length ? pct(p.chance) : ''}</b></li>`).join('')}
        </ol>
        <p class="muted small">Only objective phases decide the contract. Failing another phase raises the alarm or starts a fight, which costs HP and makes later checks harder. Per-phase figures assume no alarm and nobody down.</p>
        <div class="deploy">
          <div><span class="muted">Calyx doses</span> <b>${cr(doses)}</b></div>
          <button class="primary" data-action="deploy" data-id="${contract.id}" ${orders.length ? '' : 'disabled'}>Deploy squad</button>
        </div>
      </section>
    </div>
  </main>`;
}

function debriefView(index: number, instant: boolean) {
  const rec = game.history[index];
  if (!rec) return hqView();
  const { result, contract } = rec;
  const outcomes = result.outcomes.map((o) => {
    const agent = game.roster.find((a) => a.id === o.agentId);
    const status = o.kia ? '<span class="tag bad">KIA</span>' : o.lostLimb ? `<span class="tag bad">Lost ${o.lostLimb === 'arms' ? 'an arm' : 'a leg'}</span>` : o.downed ? '<span class="tag warn">Downed</span>' : '<span class="tag good">OK</span>';
    const tally = rec.rules === 'nonlethal' ? `${o.subdued} subdued` : `${o.kills} kills`;
    return `<li><strong>${esc(agent?.name ?? '?')}</strong> ${status} <span class="muted small">${o.kia ? '' : `${o.hp} HP · `}${tally}</span></li>`;
  }).join('');
  const net = result.payout + result.cleanBonus - rec.upkeep - rec.doseCost;
  const delay = (i: number) => (instant ? 0 : i * 140);
  return `
  <main class="debrief">
    <div class="crumbs"><button class="link" data-action="home">‹ HQ</button></div>
    <h1>Debrief · ${MISSIONS[contract.type].label}</h1>
    <div class="two-col">
      <section class="panel log ${instant ? 'instant' : ''}">
        ${result.log.map((l, i) => `<p class="line ${l.tone}" style="animation-delay:${delay(i)}ms">${esc(l.text)}</p>`).join('')}
        ${instant ? '' : '<button class="ghost skip" data-action="skip">Skip</button>'}
      </section>
      <section class="panel summary">
        <div class="result ${result.success ? 'good' : 'bad'}">${result.success ? (result.compromised ? 'Compromised' : 'Success') : 'Failed'}</div>
        <ul class="ledger">
          <li><span>Payment</span><b>${cr(result.payout)}</b></li>
          ${result.cleanBonus ? `<li><span>No-deaths bonus</span><b class="good">${cr(result.cleanBonus)}</b></li>` : ''}
          <li><span>Calyx</span><b>${rec.doseCost ? '−' : ''}${cr(rec.doseCost)}</b></li>
          <li><span>Running costs</span><b>−${cr(rec.upkeep)}</b></li>
          <li class="total"><span>Net</span><b class="${net >= 0 ? 'good' : 'bad'}">${net < 0 ? '−' : ''}${cr(Math.abs(net))}</b></li>
          <li><span>Research</span><b>+${result.rp} RP</b></li>
        </ul>
        <h2>Squad</h2>
        <ul class="list">${outcomes}</ul>
        ${rec.events.length ? `<h2>The team</h2><ul class="list events">${rec.events.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        <button class="primary" data-action="home">Return to HQ</button>
      </section>
    </div>
  </main>`;
}

function codexView() {
  const groups = [...new Set(CODEX.map((e) => e.group))];
  const traitRows = TRAITS.filter((t) => t.kind !== 'personality')
    .map((t) => `<li><div><strong>${t.name}</strong> <span class="trait ${t.kind}">${t.kind}</span><p class="muted">${t.how} ${t.desc}</p></div></li>`)
    .join('');
  return `
  <main class="codex">
    <div class="crumbs"><button class="link" data-action="home">‹ HQ</button></div>
    <h1>Codex</h1>
    <label class="toggle"><input type="checkbox" data-action="toggle-lore" ${lore() ? 'checked' : ''}/> Show lore in briefings and dossiers</label>
    <div class="two-col">
      <section class="panel prose">
        ${groups.map((g) => `<h2>${g}</h2>${CODEX.filter((e) => e.group === g).map((e) => {
          const known = !e.locked || game.codex.includes(e.id);
          return known
            ? `<article><h3>${esc(e.title)}</h3>${e.body.map((p) => `<p>${esc(p)}</p>`).join('')}</article>`
            : `<article class="locked"><h3>Unknown</h3><p class="muted">Not yet encountered.</p></article>`;
        }).join('')}`).join('')}
      </section>
      <section class="panel">
        <h2>Traits agents can pick up</h2>
        <ul class="list">${traitRows}</ul>
      </section>
    </div>
  </main>`;
}

function helpView() {
  return `
  <main class="help">
    <div class="crumbs"><button class="link" data-action="home">‹ HQ</button></div>
    <h1>How to play</h1>
    <section class="panel prose">
      <p>You run a small syndicate of agents for ${CAMPAIGN_LENGTH} turns. Each turn, pick one contract, choose a squad and send them in. The mission plays out on its own; the debrief tells you why it went the way it did.</p>
      <h2>The loop</h2>
      <ol><li><b>Design the team.</b> Click an agent to fit augments into six body slots.</li><li><b>Take a contract.</b> Each mission type tests different things: stealth, combat, hacking, speed.</li><li><b>Set your orders.</b> Lethal or non-lethal, and what to do about any rival operative.</li><li><b>Watch the forecast.</b> The planning screen simulates the mission with your exact squad and orders.</li><li><b>Read the debrief</b>, then rebuild.</li></ol>
      <h2>Every augment has a price</h2>
      <ul>
        <li><b>Energy.</b> Powered augments drain energy each phase, double in combat. If it runs out they shut down mid-mission.</li>
        <li><b>Rejection.</b> Every augment adds load. Over tolerance, an agent risks rejection episodes each phase unless dosed with Calyx.</li>
        <li><b>Signature.</b> Loud builds get the team spotted and draw enemy fire.</li>
      </ul>
      <h2>The team</h2>
      <ul>
        <li><b>Personalities.</b> Every agent has one: some prefer working alone, some a full squad, some refuse to kill.</li>
        <li><b>Traits.</b> Agents earn perks from what they do, like Ghost after three quiet missions. Going down leaves them Jumpy until they have a clean mission.</li>
        <li><b>Bonds.</b> Agents who go in together twice start to trust each other: a bonus when deployed together, and they fight harder if their partner goes down.</li>
      </ul>
      <h2>The quiet way</h2>
      <ul>
        <li><b>Non-lethal missions</b> knock guards out instead. Without arc gloves, sedative mist or the right trait, takedowns are harder.</li>
        <li><b>Leaving no bodies</b> raises your standing, earns extra research and collects any no-deaths bonus the client offers. Pure stealth counts too.</li>
        <li><b>Rival operatives</b> from ${RIVAL_SYNDICATE} sometimes work the same site. Avoid them, eliminate them, or capture them and carry them home. A captive can be released, debriefed for research, or offered a place on your team, augments included.</li>
      </ul>
      <h2>Drugs and injuries</h2>
      <p>Intelligence, perception and adrenaline boost an agent for one mission, then they crash. Downed agents may lose a limb; fit any augment in that slot to replace it. Agents left behind do not come back.</p>
    </section>
  </main>`;
}

function render() {
  let body: string;
  switch (screen.name) {
    case 'hq': body = hqView(); break;
    case 'agent': body = agentView(screen.agentId, screen.slot); break;
    case 'plan': body = planView(screen.contractId); break;
    case 'debrief': body = debriefView(screen.index, screen.instant); break;
    case 'codex': body = codexView(); break;
    case 'help': body = helpView(); break;
  }
  app.innerHTML = `${topbar()}${toast ? `<div class="toast ${toast.bad ? 'bad' : ''}" role="status">${esc(toast.text)}</div>` : ''}${body}`;
}

// --- Events -----------------------------------------------------------------

app.addEventListener('click', (event) => {
  const el = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el || el.matches('input')) return;
  const { action, id, slot, index, value } = el.dataset;
  toast = null;
  switch (action) {
    case 'home': return go({ name: 'hq' });
    case 'help': return go({ name: 'help' });
    case 'codex': return go({ name: 'codex' });
    case 'new-campaign':
      if (game.history.length && !confirm('Abandon this campaign and start a new one?')) return;
      game = { ...newCampaign(randomSeed()), settings: game.settings };
      save();
      return go({ name: 'hq' });
    case 'open-agent': return go({ name: 'agent', agentId: id! });
    case 'toggle-slot':
      if (screen.name === 'agent') screen = { ...screen, slot: screen.slot === slot ? undefined : (slot as Slot) };
      break;
    case 'install':
      if (screen.name === 'agent') {
        const aug = AUGMENTS.find((a) => a.id === id);
        if (apply(installAugment(game, screen.agentId, id!), `${aug?.name} installed.`)) screen = { ...screen, slot: undefined };
      }
      break;
    case 'remove':
      if (screen.name === 'agent') apply(removeAugment(game, screen.agentId, slot as Slot), 'Augment removed.');
      break;
    case 'recruit': apply(recruit(game), 'New agent recruited.'); break;
    case 'research': apply(startResearch(game, id!), 'Research complete.'); break;
    case 'rest': apply(rest(game), 'The team lies low for a turn.'); break;
    case 'offer': {
      const { outcome, accepted } = offerPlace(game, id!);
      if (apply(outcome)) toast = accepted ? { text: 'They accepted. A new agent joins the roster, augments and all.', bad: false } : { text: 'They turned you down. Try again next turn.', bad: true };
      break;
    }
    case 'release': apply(releaseCaptive(game, id!), 'Released. Your standing rises.'); break;
    case 'debrief-captive': apply(debriefCaptive(game, id!), 'Debriefed and released. +2 RP.'); break;
    case 'plan': {
      squad = new Map();
      missionOrders = { rules: game.history.at(-1)?.rules ?? 'lethal', rivalOrders: 'avoid' };
      return go({ name: 'plan', contractId: id! });
    }
    case 'set-rules': missionOrders = { ...missionOrders, rules: value as RulesOfEngagement }; break;
    case 'set-rival': missionOrders = { ...missionOrders, rivalOrders: value as RivalOrders }; break;
    case 'deploy':
      if (apply(deploy(game, id!, [...squad.values()], missionOrders))) return go({ name: 'debrief', index: game.history.length - 1, instant: false });
      break;
    case 'view-debrief': return go({ name: 'debrief', index: Number(index), instant: true });
    case 'skip':
      if (screen.name === 'debrief') screen = { ...screen, instant: true };
      break;
    default: return;
  }
  render();
});

app.addEventListener('change', (event) => {
  const el = event.target as HTMLInputElement;
  const { action, id, drug } = el.dataset;
  if (action === 'toggle-lore') {
    game = setLore(game, el.checked);
    save();
    return render();
  }
  if (!id) return;
  const agent = game.roster.find((a) => a.id === id);
  if (!agent) return;
  if (action === 'toggle-squad') {
    if (el.checked && squad.size < MAX_SQUAD) squad.set(id, defaultOrder(agent));
    else squad.delete(id);
  } else if (action === 'dose') {
    const o = squad.get(id);
    if (o) o.dosed = el.checked;
  } else if (action === 'drug') {
    const o = squad.get(id);
    if (o) o.drugs = { ...o.drugs, [drug as keyof Drugs]: Number(el.value) };
  } else return;
  render();
});

app.addEventListener('input', (event) => {
  // Live label update while dragging a drug slider; full re-render happens on change.
  const el = event.target as HTMLInputElement;
  if (el.dataset.action === 'drug') el.nextElementSibling!.textContent = el.value;
});

// Older playable versions are listed by the deploy workflow.
fetch('./versions.json')
  .then((r) => (r.ok ? r.json() : []))
  .then((list: unknown) => {
    if (Array.isArray(list)) versions = list.filter((v): v is string => typeof v === 'string');
    if (screen.name === 'hq') render();
  })
  .catch(() => {});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

render();
