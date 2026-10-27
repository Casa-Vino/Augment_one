// Resolves a mission phase by phase from a seed, and writes the debrief as it goes.
// The same contract, squad and seed always produce the same result.
import { derive, drugLoad, loudestSource, malfunctionChance, topSource, type Derived } from './agent';
import { MISSIONS } from './data';
import { createRng } from './rng';
import type { Agent, AgentOutcome, Contract, Drugs, Limb, LogLine, MissionResult, PhaseTemplate } from './types';

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
}

interface Operative {
  agent: Agent;
  drugs: Drugs;
  dosed: boolean;
  d: Derived;
  hp: number;
  energy: number;
  powered: boolean;
  downed: boolean;
  stunned: boolean;
  kills: number;
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

export function resolveMission(input: MissionInput): MissionResult {
  const rng = createRng(input.seed);
  const { contract } = input;
  const diff = contract.difficulty;
  const template = MISSIONS[contract.type];
  const log: LogLine[] = [];
  const say = (text: string, tone: LogLine['tone'] = 'info') => log.push({ text, tone });

  const ops: Operative[] = input.squad.map((m) => {
    const d = derive(m.agent, { drugs: m.drugs, toleranceBonus: input.toleranceBonus });
    return { agent: m.agent, drugs: m.drugs, dosed: m.dosed, d, hp: m.agent.hp, energy: d.energy, powered: true, downed: false, stunned: false, kills: 0 };
  });
  const standing = () => ops.filter((o) => !o.downed && !o.stunned);
  const powerDown = (o: Operative) => {
    o.powered = false;
    o.d = derive(o.agent, { drugs: o.drugs, toleranceBonus: input.toleranceBonus, poweredDown: true });
  };

  let alarm = false;
  let objectiveMet = false;
  let objectiveFailed = false;

  say(`${template.label}: ${contract.target}, for ${contract.client}.`, 'header');
  say(`Squad: ${ops.map((o) => o.agent.name).join(', ')}. Threat level ${diff}.`);

  // --- Phase helpers -------------------------------------------------------

  const beginPhase = (phase: PhaseTemplate) => {
    for (const o of ops) {
      o.stunned = false;
      if (o.downed) continue;
      const cost = o.d.drain * (phase.kind === 'combat' ? 2 : 1);
      if (o.powered && cost > 0) {
        if (o.energy < cost) {
          const names = o.d.active.filter((a) => a.drain > 0).map((a) => a.name.toLowerCase());
          powerDown(o);
          say(`${o.agent.name} ran out of energy. ${listNames(names)} shut down.`, 'bad');
        } else {
          o.energy -= cost;
        }
      }
      if (rng.chance(malfunctionChance(o.d, o.dosed))) {
        o.stunned = true;
        const aug = o.d.installed.length ? rng.pick(o.d.installed).name.toLowerCase() : 'an implant';
        const cause = o.dosed ? 'despite the suppressant dose' : 'with no suppressant in their system';
        say(`${o.agent.name} suffered a rejection episode ${cause}: their ${aug} seized up. Out of action this phase.`, 'bad');
      }
    }
  };

  const fight = (enemies: number): boolean => {
    let remaining = enemies;
    say(`${enemies} ${enemies === 1 ? 'hostile' : 'hostiles'} engaged.`);
    for (let round = 0; round < 4 && remaining > 0; round++) {
      const shooters = standing();
      if (!shooters.length) break;
      for (const o of shooters) {
        if (remaining <= 0) break;
        let hits = 0;
        // Fast agents get a second shot per round.
        const shots = o.d.stats.speed >= 18 ? 2 : 1;
        for (let s = 0; s < shots && remaining > 0; s++) {
          if (o.d.stats.combat + o.d.stats.perception / 3 + rng.roll() >= DC.shot(diff)) {
            remaining--;
            hits++;
          }
        }
        if (hits) {
          o.kills += hits;
          const src = topSource(o.d, 'combat');
          const how = src ? rng.pick([`with their ${src}`, `on the back of their ${src}`, `(${src})`]) : 'on raw skill';
          say(`${o.agent.name} dropped ${hits === 1 ? 'a guard' : `${hits} guards`} ${how}.`, 'good');
        }
      }
      for (let e = 0; e < remaining; e++) {
        const targets = standing();
        if (!targets.length) break;
        // Loud agents draw fire.
        const t = rng.weighted(targets, (o) => 10 + Math.max(0, o.d.signature) * 2);
        const defence = 10 + t.d.stats.speed / 2 + t.d.stats.perception / 4;
        if (DC.enemyAttack(diff) + rng.roll() < defence) continue;
        const raw = DC.enemyDamage(diff);
        const dmg = Math.max(4, raw - t.d.stats.armor);
        t.hp -= dmg;
        const armour = topSource(t.d, 'armor');
        if (armour && t.d.stats.armor >= 6) say(`${t.agent.name}'s ${armour} absorbed most of a burst (−${dmg} HP).`, 'info');
        else say(`${t.agent.name} was hit (−${dmg} HP).`, 'bad');
        if (t.hp <= 0) {
          t.hp = 0;
          t.downed = true;
          say(`${t.agent.name} is down.`, 'bad');
        }
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
    const ds = team.map((o) => o.d);
    const value = teamStealth(ds);
    const dc = DC.stealth(diff);
    if (value + rng.roll() >= dc) {
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
      );
      return true;
    }
    alarm = true;
    const worst = team.reduce((a, b) => (b.d.signature > a.d.signature ? b : a));
    const loud = loudestSource(worst.d);
    if (loud) say(`A patrol picked up ${worst.agent.name}: their ${loud} gave them away. Alarm raised.`, 'bad');
    else if (team.length > 2) say(`A patrol spotted the squad; ${team.length} agents is a lot of bodies to hide. Alarm raised.`, 'bad');
    else say(`A camera caught ${worst.agent.name} on a blind corner. Alarm raised.`, 'bad');
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
        say(`${hacker.agent.name} cracked it${src ? ` through their ${src}` : ' the hard way'}${attempt ? ' on a second attempt' : ''}.`, 'good');
        return true;
      }
      say(attempt === 0 ? `${hacker.agent.name}'s first attempt bounced off the ICE.` : `${hacker.agent.name} was locked out.`, 'bad');
      if (!alarm && rng.chance(0.5)) {
        alarm = true;
        say('The failed intrusion tripped a security trace. Alarm raised.', 'bad');
      }
    }
    return false;
  };

  const run = (phase: PhaseTemplate): boolean => {
    const team = standing();
    const carried = ops.filter((o) => o.downed).length + (phase.carry ?? 0);
    const value = teamSpeed(team.map((o) => o.d), carried);
    const dc = DC.speed(diff) + (alarm ? 4 : 0);
    if (carried) {
      const carrier = team.find((o) => o.d.tags.has('carry'));
      say(carrier ? `${carrier.agent.name}'s strength frame took the weight of ${carried === 1 ? 'one body' : `${carried} bodies`}.` : `The team is carrying ${carried === 1 ? 'one body' : `${carried} bodies`} by hand.`);
    }
    if (value + rng.roll() >= dc) {
      const slowest = team.reduce((a, b) => (b.d.stats.speed < a.d.stats.speed ? b : a));
      const src = topSource(slowest.d, 'speed');
      say(src && team.length === 1 ? `${slowest.agent.name} made the exfil point, ${src} pushing hard.` : 'Clean exfil. The team made the pickup on time.', 'good');
      return true;
    }
    const slowest = team.reduce((a, b) => (b.d.stats.speed < a.d.stats.speed ? b : a));
    say(`${slowest.agent.name} couldn't keep pace. Security caught up before the pickup.`, 'bad');
    fight(enemiesFor({ ...phase, enemies: -1 }, diff, alarm));
    return false;
  };

  // --- Run the phases ------------------------------------------------------

  for (const phase of template.phases) {
    say(phase.name, 'header');
    beginPhase(phase);
    if (!standing().length) {
      say(ops.every((o) => o.downed) ? 'Nobody is left standing.' : 'Nobody is able to act.', 'bad');
      if (phase.objective) objectiveFailed = true;
      continue;
    }
    let ok: boolean;
    switch (phase.kind) {
      case 'stealth':
        ok = sneak(phase);
        break;
      case 'combat':
        ok = fight(enemiesFor(phase, diff, alarm));
        break;
      case 'hack':
        ok = hack();
        break;
      case 'speed':
        ok = run(phase);
        break;
    }
    if (phase.objective) {
      if (ok) objectiveMet = true;
      else objectiveFailed = true;
      say(ok ? 'Objective complete.' : 'Objective failed.', ok ? 'good' : 'bad');
    }
  }

  // --- Aftermath -----------------------------------------------------------

  say('Aftermath', 'header');
  const anyStanding = ops.some((o) => !o.downed);
  const outcomes: AgentOutcome[] = ops.map((o) => {
    const out: AgentOutcome = { agentId: o.agent.id, hp: o.hp, downed: o.downed, kia: false, kills: o.kills, crash: 0, overdose: false };
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

  const success = objectiveMet && !objectiveFailed;
  const compromised = success && alarm && contract.type === 'infiltration';
  const payout = success ? Math.round((compromised ? contract.payout * 0.5 : contract.payout) / 50) * 50 : 0;
  const rp = success ? contract.difficulty + (alarm ? 0 : 1) : 0;

  if (success) say(compromised ? 'Contract complete, but compromised: the client halved the fee.' : 'Contract complete.', 'good');
  else say('Contract failed. No payment.', 'bad');

  return { success, compromised, log, outcomes, payout, rp };
}

function listNames(names: string[]): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (names.length <= 1) return cap(names[0] ?? 'Their implants');
  return cap(`${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
}

