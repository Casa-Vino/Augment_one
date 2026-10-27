// Planning-screen estimates. These mirror the checks in mission.ts so the player
// can see how a build changes their chances before committing.
import { derive, type Derived } from '../sim/agent';
import {
  attackPenalty, bestTech, DC, enemiesFor, missionPhases, rivalDefence, rivalToughness, teamSpeed, teamStealth,
} from '../sim/mission';
import type { Contract, PhaseKind, RivalOrders, RulesOfEngagement } from '../sim/types';

/** Probability that 2d10 + value >= dc. */
export function passChance(value: number, dc: number): number {
  const need = Math.ceil(dc - value);
  let hits = 0;
  for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) if (a + b >= need) hits++;
  return hits / 100;
}

export interface PhaseEstimate {
  name: string;
  kind: PhaseKind;
  objective: boolean;
  chance: number;
  note: string;
}

export function estimatePhases(contract: Contract, team: Derived[], rules: RulesOfEngagement, rivalOrders: RivalOrders): PhaseEstimate[] {
  const diff = contract.difficulty;
  return missionPhases(contract).map((phase): PhaseEstimate => {
    const base = { name: phase.name, kind: phase.kind, objective: !!phase.objective };
    if (!team.length) return { ...base, chance: 0, note: 'No squad selected' };
    switch (phase.kind) {
      case 'stealth':
        return {
          ...base,
          chance: passChance(teamStealth(team), DC.stealth(diff)),
          note: team.length > 2 ? `Stealth check. ${team.length} agents are harder to hide.` : 'Stealth check, weakest agent counts most.',
        };
      case 'hack': {
        const one = passChance(bestTech(team), DC.hack(diff));
        const two = passChance(bestTech(team) - 3, DC.hack(diff));
        return { ...base, chance: 1 - (1 - one) * (1 - two), note: 'Best hacker, two attempts. Failures may raise the alarm.' };
      }
      case 'combat': {
        const perRound = team.reduce(
          (sum, d) => sum + passChance(d.stats.combat + d.stats.perception / 3, DC.shot(diff) + attackPenalty(d, rules)) * (d.stats.speed >= 18 ? 2 : 1),
          0,
        );
        const enemies = enemiesFor(phase, diff, false);
        const verb = rules === 'lethal' ? 'takedowns' : 'subdued';
        return { ...base, chance: Math.min(0.99, (perRound * 4) / enemies / 1.6), note: `${enemies}+ hostiles. Squad manages about ${perRound.toFixed(1)} ${verb} a round.` };
      }
      case 'speed':
        return {
          ...base,
          chance: passChance(teamSpeed(team, phase.carry ?? 0), DC.speed(diff)),
          note: phase.carry ? 'Speed check while carrying the defector.' : 'Speed check, slowest agent counts most. Captives and downed agents slow the team.',
        };
      case 'rival': {
        const rival = derive(contract.rival!, {});
        if (rivalOrders === 'avoid') {
          return { ...base, chance: passChance(teamStealth(team), DC.stealth(diff) - 2), note: 'Slip past them. If spotted, the team has to fight.' };
        }
        const pen = (d: Derived) => (rivalOrders === 'capture' ? attackPenalty(d, 'nonlethal') : 0);
        const perRound = team.reduce((sum, d) => sum + passChance(d.stats.combat + d.stats.perception / 3, rivalDefence(rival) + pen(d)), 0);
        const need = rivalToughness(diff);
        return {
          ...base,
          chance: Math.min(0.99, (perRound * 3) / need / 1.4),
          note: rivalOrders === 'capture' ? `Needs ${need} clean hits in three rounds, then carrying them out.` : `Needs ${need} hits in three rounds.`,
        };
      }
    }
  });
}

/** Phase index at which an agent's powered augments would run dry, or null. */
export function powerRunsOutAt(contract: Contract, d: Derived): number | null {
  let energy = d.energy;
  const phases = missionPhases(contract);
  for (let i = 0; i < phases.length; i++) {
    const cost = d.drain * (phases[i].kind === 'combat' || phases[i].kind === 'rival' ? 2 : 1);
    if (cost > energy) return i;
    energy -= cost;
  }
  return null;
}
