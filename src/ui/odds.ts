// Planning-screen estimates. These mirror the checks in mission.ts so the player
// can see how a build changes their chances before committing.
import type { Derived } from '../sim/agent';
import { MISSIONS } from '../sim/data';
import { bestTech, DC, enemiesFor, teamSpeed, teamStealth } from '../sim/mission';
import type { Contract, PhaseKind } from '../sim/types';

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

export function estimatePhases(contract: Contract, team: Derived[]): PhaseEstimate[] {
  const diff = contract.difficulty;
  return MISSIONS[contract.type].phases.map((phase) => {
    const objective = !!phase.objective;
    if (!team.length) return { name: phase.name, kind: phase.kind, objective, chance: 0, note: 'No squad selected' };
    switch (phase.kind) {
      case 'stealth': {
        const chance = passChance(teamStealth(team), DC.stealth(diff));
        return { name: phase.name, kind: phase.kind, objective, chance, note: team.length > 2 ? `Stealth check. ${team.length} agents are harder to hide.` : 'Stealth check, weakest agent counts most.' };
      }
      case 'hack': {
        const one = passChance(bestTech(team), DC.hack(diff));
        const two = passChance(bestTech(team) - 3, DC.hack(diff));
        return { name: phase.name, kind: phase.kind, objective, chance: 1 - (1 - one) * (1 - two), note: 'Best hacker, two attempts. Failures may raise the alarm.' };
      }
      case 'combat': {
        const shot = team.reduce((sum, d) => sum + passChance(d.stats.combat + d.stats.perception / 3, DC.shot(diff)) * (d.stats.speed >= 18 ? 2 : 1), 0);
        const enemies = enemiesFor(phase, diff, false);
        // Rough: kills expected within four rounds against the enemy count.
        const chance = Math.min(0.99, (shot * 4) / enemies / 1.6);
        return { name: phase.name, kind: phase.kind, objective, chance, note: `${enemies}+ hostiles. Squad lands about ${shot.toFixed(1)} kills a round.` };
      }
      case 'speed': {
        const chance = passChance(teamSpeed(team, phase.carry ?? 0), DC.speed(diff));
        return { name: phase.name, kind: phase.kind, objective, chance, note: phase.carry ? 'Speed check while carrying the defector.' : 'Speed check, slowest agent counts most.' };
      }
    }
  });
}

/** Phase index at which an agent's powered augments would run dry, or null. */
export function powerRunsOutAt(contract: Contract, d: Derived): number | null {
  let energy = d.energy;
  const phases = MISSIONS[contract.type].phases;
  for (let i = 0; i < phases.length; i++) {
    const cost = d.drain * (phases[i].kind === 'combat' ? 2 : 1);
    if (cost > energy) return i;
    energy -= cost;
  }
  return null;
}
