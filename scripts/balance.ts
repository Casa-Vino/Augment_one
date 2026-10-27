// Runs many seeded missions for a set of preset teams and prints success rates.
// Usage: npm run balance [-- runs]
import { createAgent } from '../src/sim/agent';
import { MISSIONS } from '../src/sim/data';
import { resolveMission } from '../src/sim/mission';
import type { Agent, Drugs, MissionType, Slot } from '../src/sim/types';

const runs = Number(process.argv[2] ?? 400);

const NONE: Drugs = { intelligence: 0, perception: 0, adrenaline: 0 };

function agent(name: string, augs: Partial<Record<Slot, string>>): Agent {
  return { ...createAgent(name, name), augments: augs };
}

const ghost = (n: string) => agent(n, { skin: 'glass-shield', legs: 'silent-stride', torso: 'energy-converter', neural: 'hack-interface', optics: 'thermal-optics', arms: 'nano-blade' });
const soldier = (n: string) => agent(n, { neural: 'reflex-booster', optics: 'smart-targeting', torso: 'dermal-plating', arms: 'recoil-dampers', legs: 'sprint-servos', skin: 'toxin-filter' });
const hacker = (n: string) => agent(n, { neural: 'hack-interface', skin: 'social-camo', legs: 'silent-stride', optics: 'thermal-optics', torso: 'cooling-loop' });
const hauler = (n: string) => agent(n, { arms: 'strength-frame', torso: 'dermal-plating', optics: 'smart-targeting', legs: 'sprint-servos', neural: 'reflex-booster' });

// Late game: researched augments plus combat drugs.
const ghostHacker = (n: string) => agent(n, { skin: 'glass-shield', legs: 'silent-stride', torso: 'energy-converter', neural: 'hack-interface', optics: 'threat-tagger', arms: 'nano-blade' });
const sentinel = (n: string) => agent(n, { neural: 'sentinel-overclock', optics: 'smart-targeting', torso: 'titan-frame', arms: 'recoil-dampers', legs: 'sprint-servos', skin: 'toxin-filter' });
const INT3: Drugs = { intelligence: 3, perception: 0, adrenaline: 0 };
const ADR2: Drugs = { intelligence: 0, perception: 1, adrenaline: 2 };

const TEAMS: Record<string, { squad: Agent[]; drugs?: Drugs }> = {
  'Unaugmented x4': { squad: ['A', 'B', 'C', 'D'].map((n) => agent(n, {})) },
  'Unaugmented x2': { squad: ['A', 'B'].map((n) => agent(n, {})) },
  'Ghost pair': { squad: [ghost('G1'), ghost('G2')] },
  'Assault x4': { squad: ['S1', 'S2', 'S3', 'S4'].map(soldier) },
  'Hacker + 2 soldiers': { squad: [hacker('H'), soldier('S1'), soldier('S2')] },
  'Haulers x3': { squad: [hauler('U1'), hauler('U2'), hauler('U3')] },
  'LATE ghost hackers x2': { squad: [ghostHacker('G1'), ghostHacker('G2')], drugs: INT3 },
  'LATE sentinels x4': { squad: ['S1', 'S2', 'S3', 'S4'].map(sentinel), drugs: ADR2 },
};

const types = Object.keys(MISSIONS) as MissionType[];
const diffs = [1, 2, 3, 5];

const header = ['Team'.padEnd(22), ...types.flatMap((t) => diffs.map((d) => `${t.slice(0, 5)}${d}`.padStart(8)))].join('');
console.log(`Success rate over ${runs} runs (KIA per run in brackets for the hardest level)\n`);
console.log(header);
for (const [name, { squad, drugs }] of Object.entries(TEAMS)) {
  const cells: string[] = [];
  for (const type of types) {
    for (const difficulty of diffs) {
      let wins = 0;
      let kia = 0;
      for (let seed = 0; seed < runs; seed++) {
        const result = resolveMission({
          contract: { id: 'x', type, difficulty, client: 'X', target: 'Y', payout: 1000 },
          squad: squad.map((a) => ({ agent: a, drugs: drugs ?? NONE, dosed: true })),
          toleranceBonus: 0,
          seed: seed * 7919 + difficulty,
        });
        if (result.success) wins++;
        kia += result.outcomes.filter((o) => o.kia).length;
      }
      const pct = `${Math.round((100 * wins) / runs)}%`;
      cells.push((difficulty === 5 ? `${pct}(${(kia / runs).toFixed(1)})` : pct).padStart(8 + (difficulty === 5 ? 3 : 0)));
    }
  }
  console.log(name.padEnd(22) + cells.join(''));
}
