// Resolves a mission phase by phase from a seed, and writes the debrief as it goes.
// The same contract, squad, orders and seed always produce the same result.
import { derive, drugLoad, loudestSource, malfunctionChance, topSource, type Derived } from './agent';
import { BOND_LEVELS, MISSIONS, NONLETHAL_PENALTY, RIVAL_SYNDICATE } from './data';
import { createRng } from './rng';
import type {
  Agent, AgentOutcome, Contract, Drugs, Limb, LogLine, MissionResult, PhaseTemplate, ReplayEvent, RivalOrders, RulesOfEngagement,
} from './types';

export interface SquadMember {
  agent: Agent;
  drugs: Drugs;
  dosed: boolean;
}

export interface MissionInput {
  contract: Contract;
  squad: SquadMember[];
  toleranceBonus: number;
  seed: number;
  rules?: RulesOfEngagement;
  rivalOrders?: RivalOrders;
  /** Missions together per pair of agents, keyed by bondKey(). */
  bonds?: Record<string, number>;
}

interface Operative {
  agent: Agent;
  drugs: Drugs;
  dosed: boolean;
  d: Derived;
  bondBonus: number;
  hp: number;
  energy: number;
  powered: boolean;
  downed: boolean;
  stunned: boolean;
  /** Combat bonus after a bonded teammate goes down. */
  rally: number;
  kills: number;
  subdued: number;
  hacks: number;
}

/** Difficulty classes for each kind of check, by mission difficulty (1-5). */
export const DC = {
  stealth: (diff: number) => 15 + 4 * diff,
  hack: (diff: number) => 13 + 4 * diff,
  speed: (diff: number) => 15 + 3 * diff,
  shot: (diff: number) => 17 + 4 * diff,
  enemyAttack: (diff: number) => 6 + 3 * diff,
  enemyDamage: (diff: number) => 12 + 5 * diff,
};

export function enemiesFor(phase: PhaseTemplate, diff: number, alarm: boolean): number {
  return 1 + diff + (phase.enemies ?? 0) + (alarm ? 1 : 0);
}

export function bondKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 0 = none, 1 = Trusted, 2 = Inseparable. */
export function bondLevel(missionsTogether: number): number {
  return BOND_LEVELS.filter((n) => missionsTogether >= n).length;
}

export function bondBonusFor(agentId: string, squadIds: string[], bonds: Record<string, number> = {}): number {
  const total = squadIds.filter((id) => id !== agentId).reduce((sum, id) => sum + bondLevel(bonds[bondKey(agentId, id)] ?? 0), 0);
  return Math.min(3, total);
}

/** Phases for a contract: the template, plus a rival encounter before extraction. */
export function missionPhases(contract: Contract): PhaseTemplate[] {
  const phases = [...MISSIONS[contract.type].phases];
  if (contract.rival) phases.splice(phases.length - 1, 0, { kind: 'rival', name: `Rival operative: “${contract.rival.codename}”` });
  return phases;
}

export function rivalDefence(rival: Derived): number {
  return 12 + rival.stats.speed / 2 + rival.stats.perception / 4 + rival.stats.armor / 2;
}

/** Hits needed to put a rival down. */
export function rivalToughness(diff: number): number {
  return diff >= 3 ? 3 : 2;
}

/** Team stealth: the weakest member matters most, and big squads are easier to spot. */
export function teamStealth(ds: Derived[]): number {
  const values = ds.map((d) => d.stats.stealth - 1.5 * d.signature + d.stats.perception / 4);
  const min = Math.min(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return min * 0.6 + avg * 0.4 - 2 * Math.max(0, ds.length - 2);
}

export function teamSpeed(ds: Derived[], carried: number): number {
  const values = ds.map((d) => d.stats.speed);
  const min = Math.min(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const carriers = ds.filter((d) => d.tags.has('carry')).length;
  const perBody = carriers > 0 ? 2 : 5;
  return min * 0.6 + avg * 0.4 - carried * perBody;
}

export function bestTech(ds: Derived[]): number {
  return Math.max(...ds.map((d) => d.stats.tech + d.stats.perception / 5));
}

export function attackPenalty(d: Derived, rules: RulesOfEngagement): number {
  return rules === 'nonlethal' && !d.tags.has('nonlethal') ? NONLETHAL_PENALTY : 0;
}

export function resolveMission(input: MissionInput): MissionResult {
  const rng = createRng(input.seed);
  const { contract } = input;
  const rules = input.rules ?? 'lethal';
  const diff = contract.difficulty;
  const template = MISSIONS[contract.type];
  const log: LogLine[] = [];
  const say = (text: string, tone: LogLine['tone'] = 'info', ev?: ReplayEvent) => log.push(ev ? { text, tone, ev } : { text, tone });
  const lethal = rules === 'lethal';

  const squadIds = input.squad.map((m) => m.agent.id);
  const deriveFor = (m: { agent: Agent; drugs: Drugs }, bondBonus: number, poweredDown = false) =>
    derive(m.agent, { drugs: m.drugs, toleranceBonus: input.toleranceBonus, squadSize: input.squad.length, rules, bondBonus, poweredDown });

  const ops: Operative[] = input.squad.map((m) => {
    const bondBonus = bondBonusFor(m.agent.id, squadIds, input.bonds);
    const d = deriveFor(m, bondBonus);
    return {
      agent: m.agent, drugs: m.drugs, dosed: m.dosed, d, bondBonus, hp: m.agent.hp, energy: d.energy, powered: true,
      downed: false, stunned: false, rally: 0, kills: 0, subdued: 0, hacks: 0,
    };
  });
  const standing = () => ops.filter((o) => !o.downed && !o.stunned);
  const powerDown = (o: Operative) => {
    o.powered = false;
    o.d = deriveFor(o, o.bondBonus, true);
  };

  let alarm = false;
  let objectiveMet = false;
  let objectiveFailed = false;
  let rivalOutcome: MissionResult['rivalOutcome'];
  let rivalSubdued = false;

  say(`${template.label}: ${contract.target}, for ${contract.client}.`, 'header');
  say(`Squad: ${ops.map((o) => o.agent.name).join(', ')}. Threat level ${diff}. ${lethal ? 'Lethal force authorised.' : 'Non-lethal: nobody dies today.'}`);
  const bonded = ops.filter((o) => o.bondBonus > 0);
  if (bonded.length >= 2) say(`${listNames(bonded.map((o) => o.agent.name))} have worked together before, and it shows.`, 'good');

  // --- Phase helpers -------------------------------------------------------

  const beginPhase = (phase: PhaseTemplate) => {
    for (const o of ops) {
      o.stunned = false;
      if (o.downed) continue;
      const cost = o.d.drain * (phase.kind === 'combat' || phase.kind === 'rival' ? 2 : 1);
      if (o.powered && cost > 0) {
        if (o.energy < cost) {
          const names = o.d.active.filter((a) => a.drain > 0).map((a) => a.name.toLowerCase());
          powerDown(o);
          say(`${o.agent.name} ran out of energy. ${listNames(names, true)} shut down.`, 'bad', { kind: 'power', agent: o.agent.id });
        } else {
          o.energy -= cost;
        }
      }
      if (rng.chance(malfunctionChance(o.d, o.dosed))) {
        o.stunned = true;
        const aug = o.d.installed.length ? rng.pick(o.d.installed).name.toLowerCase() : 'an implant';
        const cause = o.dosed ? 'despite the Calyx dose' : 'with no Calyx in their system';
        say(`${o.agent.name} suffered a rejection episode ${cause}: their ${aug} seized up. Out of action this phase.`, 'bad', { kind: 'stunned', agent: o.agent.id });
      }
    }
  };

  const hurt = (t: Operative, dmg: number, by: string) => {
    t.hp -= dmg;
    const armour = topSource(t.d, 'armor');
    if (armour && t.d.stats.armor >= 6) say(`${t.agent.name}'s ${armour} absorbed most of ${by} (−${dmg} HP).`, 'info', { kind: 'hit', agent: t.agent.id });
    else say(`${t.agent.name} was hit by ${by} (−${dmg} HP).`, 'bad', { kind: 'hit', agent: t.agent.id });
    if (t.hp > 0) return;
    t.hp = 0;
    t.downed = true;
    say(`${t.agent.name} is down.`, 'bad', { kind: 'down', agent: t.agent.id });
    for (const o of standing()) {
      if (o.rally || bondLevel(input.bonds?.[bondKey(o.agent.id, t.agent.id)] ?? 0) === 0) continue;
      o.rally = 3;
      say(`${o.agent.name} won't leave ${t.agent.name} behind (+3 combat for the rest of the mission).`, 'good');
    }
  };

  const takedownLine = (o: Operative, hits: number) => {
    const src = topSource(o.d, 'combat');
    const how = src ? rng.pick([`with their ${src}`, `on the back of their ${src}`, `(${src})`]) : 'on raw skill';
    const who = hits === 1 ? 'a guard' : `${hits} guards`;
    const ev: ReplayEvent = { kind: 'takedown', agent: o.agent.id, count: hits, lethal };
    if (lethal) say(`${o.agent.name} dropped ${who} ${how}.`, 'good', ev);
    else say(rng.pick([`${o.agent.name} put ${who} to sleep ${how}.`, `${o.agent.name} subdued ${who} ${how}.`, `${o.agent.name} zip-tied ${who} ${how}.`]), 'good', ev);
  };

  const fight = (enemies: number): boolean => {
    let remaining = Math.max(1, enemies);
    say(`${remaining} ${remaining === 1 ? 'hostile' : 'hostiles'} engaged.`, 'info', { kind: 'engage', count: remaining });
    for (let round = 0; round < 4 && remaining > 0; round++) {
      const fighters = standing();
      if (!fighters.length) break;
      for (const o of fighters) {
        if (remaining <= 0) break;
        let hits = 0;
        // Fast agents get a second attempt per round.
        const tries = o.d.stats.speed >= 18 ? 2 : 1;
        const dc = DC.shot(diff) + attackPenalty(o.d, rules);
        for (let s = 0; s < tries && remaining > 0; s++) {
          if (o.d.stats.combat + o.d.stats.perception / 3 + o.rally + rng.roll() >= dc) {
            remaining--;
            hits++;
          }
        }
        if (hits) {
          if (lethal) o.kills += hits;
          else o.subdued += hits;
          takedownLine(o, hits);
        }
      }
      for (let e = 0; e < remaining; e++) {
        const targets = standing();
        if (!targets.length) break;
        // Loud agents draw fire.
        const t = rng.weighted(targets, (o) => 10 + Math.max(0, o.d.signature) * 2);
        const defence = 10 + t.d.stats.speed / 2 + t.d.stats.perception / 4;
        if (DC.enemyAttack(diff) + rng.roll() < defence) continue;
        hurt(t, Math.max(4, DC.enemyDamage(diff) - t.d.stats.armor), 'a burst');
      }
    }
    if (remaining > 0) say(`${remaining} ${remaining === 1 ? 'hostile' : 'hostiles'} still holding the position.`, 'bad');
    return remaining <= 0;
  };

  const sneak = (phase: PhaseTemplate): boolean => {
    if (alarm) {
      say('The alarm is already up. There is no sneaking now.', 'bad');
      return fight(enemiesFor({ ...phase, enemies: -1 }, diff, true));
    }
    const team = standing();
    const value = teamStealth(team.map((o) => o.d));
    if (value + rng.roll() >= DC.stealth(diff)) {
      const best = team.reduce((a, b) => (b.d.stats.stealth > a.d.stats.stealth ? b : a));
      const src = topSource(best.d, 'stealth');
      say(
        src
          ? rng.pick([
              `${best.agent.name} led the team through unseen, ${src} doing the work.`,
              `${best.agent.name} walked the squad past a patrol; their ${src} kept everyone off the cameras.`,
              `Not a single alert. ${best.agent.name}'s ${src} found the gaps.`,
            ])
          : rng.pick(['The team slipped through unseen.', 'A quiet approach. Nobody looked twice.', 'The guards were watching the wrong door.']),
        'good',
        { kind: 'sneak', agent: best.agent.id },
      );
      return true;
    }
    alarm = true;
    const worst = team.reduce((a, b) => (b.d.signature > a.d.signature ? b : a));
    const loud = loudestSource(worst.d);
    const alarmEv: ReplayEvent = { kind: 'alarm', agent: worst.agent.id };
    if (loud) say(`A patrol picked up ${worst.agent.name}: their ${loud} gave them away. Alarm raised.`, 'bad', alarmEv);
    else if (team.length > 2) say(`A patrol spotted the squad; ${team.length} agents is a lot of bodies to hide. Alarm raised.`, 'bad', alarmEv);
    else say(`A camera caught ${worst.agent.name} on a blind corner. Alarm raised.`, 'bad', alarmEv);
    fight(enemiesFor({ ...phase, enemies: -2 }, diff, false));
    return false;
  };

  const hack = (): boolean => {
    const team = standing();
    const hacker = team.reduce((a, b) => (b.d.stats.tech > a.d.stats.tech ? b : a));
    const value = hacker.d.stats.tech + hacker.d.stats.perception / 5;
    const dc = DC.hack(diff) + (alarm ? 4 : 0);
    const src = topSource(hacker.d, 'tech');
    for (let attempt = 0; attempt < 2; attempt++) {
      if (value - attempt * 3 + rng.roll() >= dc) {
        hacker.hacks++;
        say(`${hacker.agent.name} cracked it${src ? ` through their ${src}` : ' the hard way'}${attempt ? ' on a second attempt' : ''}.`, 'good', { kind: 'hack', agent: hacker.agent.id, ok: true });
        return true;
      }
      say(attempt === 0 ? `${hacker.agent.name}'s first attempt bounced off the ICE.` : `${hacker.agent.name} was locked out.`, 'bad', { kind: 'hack', agent: hacker.agent.id, ok: false });
      if (!alarm && rng.chance(0.5)) {
        alarm = true;
        say('The failed intrusion tripped a security trace. Alarm raised.', 'bad', { kind: 'alarm' });
      }
    }
    return false;
  };

  const confrontRival = (): boolean => {
    const rival = contract.rival!;
    const rd = derive(rival, {});
    const tag = `“${rival.codename}”`;
    let orders = input.rivalOrders ?? 'avoid';
    say(`${rival.name} (${tag}) of ${RIVAL_SYNDICATE} is working the same building.`, 'info', { kind: 'rival', event: 'appears' });

    if (orders === 'avoid') {
      if (teamStealth(standing().map((o) => o.d)) + rng.roll() >= DC.stealth(diff) - 2) {
        rivalOutcome = 'avoided';
        say(`The team let ${tag} pass and kept to their own job.`, 'good', { kind: 'rival', event: 'avoided' });
        return true;
      }
      say(`${tag} spotted the team. There is no way round them now.`, 'bad');
      orders = lethal ? 'eliminate' : 'capture';
    }

    const capture = orders === 'capture';
    let toughness = rivalToughness(diff);
    for (let round = 0; round < 3 && toughness > 0; round++) {
      for (const o of standing()) {
        if (toughness <= 0) break;
        const penalty = capture ? attackPenalty(o.d, 'nonlethal') : 0;
        if (o.d.stats.combat + o.d.stats.perception / 3 + o.rally + rng.roll() < rivalDefence(rd) + penalty) continue;
        toughness--;
        if (toughness > 0) {
          say(`${o.agent.name} landed a hit on ${tag}.`, 'good', { kind: 'rival', event: 'hit', agent: o.agent.id });
          continue;
        }
        if (capture) {
          o.subdued++;
          rivalSubdued = true;
          rivalOutcome = 'captured';
          say(`${o.agent.name} put ${tag} down without killing them. They will have to be carried out.`, 'good', { kind: 'rival', event: 'captured', agent: o.agent.id });
        } else {
          o.kills++;
          rivalOutcome = 'killed';
          say(`${o.agent.name} eliminated ${tag}. ${RIVAL_SYNDICATE} will notice the gap.`, 'good', { kind: 'rival', event: 'killed', agent: o.agent.id });
        }
      }
      if (toughness <= 0) break;
      const targets = standing();
      if (!targets.length) break;
      const t = rng.weighted(targets, (o) => 10 + Math.max(0, o.d.signature) * 2);
      const defence = 10 + t.d.stats.speed / 2 + t.d.stats.perception / 4;
      if (rd.stats.combat + rng.roll() >= defence) hurt(t, Math.max(4, 10 + 4 * diff - t.d.stats.armor), tag);
      else say(`${tag} missed ${t.agent.name}.`);
    }
    if (toughness > 0) {
      rivalOutcome = 'escaped';
      say(`${tag} broke contact and slipped away.`, 'bad', { kind: 'rival', event: 'escaped' });
    }
    return true;
  };

  const run = (phase: PhaseTemplate): boolean => {
    const team = standing();
    const carried = ops.filter((o) => o.downed).length + (phase.carry ?? 0) + (rivalSubdued ? 1 : 0);
    const value = teamSpeed(team.map((o) => o.d), carried);
    const dc = DC.speed(diff) + (alarm ? 4 : 0);
    if (carried) {
      const carrier = team.find((o) => o.d.tags.has('carry'));
      const load = carried === 1 ? 'one body' : `${carried} bodies`;
      say(carrier ? `${carrier.agent.name} took the weight of ${load}.` : `The team is carrying ${load} by hand.`);
    }
    if (value + rng.roll() >= dc) {
      const slowest = team.reduce((a, b) => (b.d.stats.speed < a.d.stats.speed ? b : a));
      const src = topSource(slowest.d, 'speed');
      say(src && team.length === 1 ? `${slowest.agent.name} made the exfil point, ${src} pushing hard.` : 'Clean exfil. The team made the pickup on time.', 'good', { kind: 'exfil', ok: true });
      return true;
    }
    const slowest = team.reduce((a, b) => (b.d.stats.speed < a.d.stats.speed ? b : a));
    say(`${slowest.agent.name} couldn't keep pace. Security caught up before the pickup.`, 'bad', { kind: 'exfil', ok: false });
    fight(enemiesFor({ ...phase, enemies: -1 }, diff, alarm));
    return false;
  };

  // --- Run the phases ------------------------------------------------------

  for (const [index, phase] of missionPhases(contract).entries()) {
    say(phase.name, 'header', { kind: 'phase', index, phase: phase.kind });
    beginPhase(phase);
    if (!standing().length) {
      say(ops.every((o) => o.downed) ? 'Nobody is left standing.' : 'Nobody is able to act.', 'bad');
      if (phase.objective) objectiveFailed = true;
      continue;
    }
    let ok = false;
    switch (phase.kind) {
      case 'stealth': ok = sneak(phase); break;
      case 'combat': ok = fight(enemiesFor(phase, diff, alarm)); break;
      case 'hack': ok = hack(); break;
      case 'speed': ok = run(phase); break;
      case 'rival': ok = confrontRival(); break;
    }
    if (phase.objective) {
      if (ok) objectiveMet = true;
      else objectiveFailed = true;
      say(ok ? 'Objective complete.' : 'Objective failed.', ok ? 'good' : 'bad');
    }
  }

  // --- Aftermath -----------------------------------------------------------

  say('Aftermath', 'header', { kind: 'aftermath' });
  const anyStanding = ops.some((o) => !o.downed);
  // The one who did the heavy lifting: a natural carrier if there is one, else the toughest agent standing.
  const carrying = ops.some((o) => o.downed) || rivalSubdued || template.phases.some((p) => p.carry);
  const upright = ops.filter((o) => !o.downed);
  const carrier = carrying && upright.length
    ? upright.find((o) => o.d.tags.has('carry')) ?? upright.reduce((a, b) => (b.d.stats.armor + b.d.stats.combat > a.d.stats.armor + a.d.stats.combat ? b : a))
    : undefined;

  let captive: Agent | undefined;
  if (rivalSubdued && contract.rival) {
    if (anyStanding) {
      captive = { ...structuredClone(contract.rival), hp: Math.max(20, Math.round(contract.rival.maxHp * 0.4)) };
      say(`${contract.rival.name} is in the van, sedated and restrained.`, 'good');
    } else {
      rivalOutcome = 'escaped';
      say(`With nobody left to carry them, “${contract.rival.codename}” woke up and walked away.`, 'bad');
    }
  }

  const outcomes: AgentOutcome[] = ops.map((o) => {
    const out: AgentOutcome = {
      agentId: o.agent.id, hp: o.hp, downed: o.downed, kia: false, kills: o.kills, subdued: o.subdued, hacks: o.hacks,
      carried: o === carrier, crash: 0, overdose: false,
    };
    if (o.downed) {
      if (anyStanding || rng.chance(0.4)) {
        say(anyStanding ? `${o.agent.name} was carried out alive.` : `A corporate clean-up crew recovered ${o.agent.name}, barely alive.`);
        out.hp = 10;
        if (rng.chance(0.35)) {
          const limb: Limb = o.agent.missingLimbs.includes('arms') ? 'legs' : o.agent.missingLimbs.includes('legs') ? 'arms' : rng.pick<Limb>(['arms', 'legs']);
          out.lostLimb = limb;
          say(`${o.agent.name} lost ${limb === 'arms' ? 'an arm' : 'a leg'}. Surgery can replace it.`, 'bad');
        }
      } else {
        out.kia = true;
        say(`${o.agent.name} did not come home.`, 'bad');
      }
    }
    const load = drugLoad(o.drugs);
    if (!out.kia && load > 0) {
      const filter = o.d.tags.has('filter');
      out.crash = filter ? load * 2 : load * 4;
      if (load >= 6 && !filter && rng.chance(0.3)) {
        out.overdose = true;
        out.crash += 20;
        say(`${o.agent.name} overdosed on the comedown (−${out.crash} HP).`, 'bad');
      } else {
        say(`${o.agent.name} crashed off the combat drugs (−${out.crash} HP)${filter ? ', softened by their toxin filter' : ''}.`);
      }
      out.hp = Math.max(1, out.hp - out.crash);
    }
    return out;
  });

  const kills = ops.reduce((sum, o) => sum + o.kills, 0);
  const subdued = ops.reduce((sum, o) => sum + o.subdued, 0);
  const success = objectiveMet && !objectiveFailed;
  const compromised = success && alarm && contract.type === 'infiltration';
  const payout = success ? Math.round((compromised ? contract.payout * 0.5 : contract.payout) / 50) * 50 : 0;
  const cleanBonus = success && kills === 0 ? contract.cleanBonus ?? 0 : 0;
  const rp = success ? contract.difficulty + (alarm ? 0 : 1) + (!lethal && kills === 0 ? 1 : 0) : 0;

  if (success) say(compromised ? 'Contract complete, but compromised: the client halved the fee.' : 'Contract complete.', 'good');
  else say('Contract failed. No payment.', 'bad');
  if (success && kills === 0) say(cleanBonus ? `Nobody died. The client added a ¢${cleanBonus.toLocaleString('en-GB')} bonus for discretion.` : 'Nobody died.', 'good');

  return { success, compromised, log, outcomes, payout, rp, alarm, kills, subdued, cleanBonus, rivalOutcome, captive };
}

function listNames(names: string[], capitalise = false): string {
  const cap = (s: string) => (capitalise ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  if (names.length <= 1) return cap(names[0] ?? 'Their implants');
  return cap(`${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
}
