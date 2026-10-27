import { AUGMENT_BY_ID, BASE_ENERGY, BASE_HP, BASE_STATS, BASE_TOLERANCE, SLOTS, SYNERGIES } from './data';
import type { Agent, Augment, Drugs, Limb, Stat, Stats, Synergy } from './types';

export const NO_DRUGS: Drugs = { intelligence: 0, perception: 0, adrenaline: 0 };

const LIMB_PENALTIES: Record<Limb, Partial<Stats>> = {
  arms: { combat: -6, tech: -3 },
  legs: { speed: -7, stealth: -4 },
};

export interface DeriveOptions {
  drugs?: Drugs;
  /** True once the agent's energy has run out: powered augments stop working. */
  poweredDown?: boolean;
  toleranceBonus?: number;
}

export interface Derived {
  stats: Stats;
  energy: number;
  /** Energy spent per phase by powered augments. Combat phases cost double. */
  drain: number;
  load: number;
  tolerance: number;
  signature: number;
  tags: Set<string>;
  installed: Augment[];
  active: Augment[];
  synergies: Synergy[];
}

export function createAgent(id: string, name: string): Agent {
  return { id, name, hp: BASE_HP, maxHp: BASE_HP, augments: {}, missingLimbs: [], missions: 0, kills: 0, history: [], status: 'active' };
}

export function installedAugments(agent: Agent): Augment[] {
  return SLOTS.map((slot) => agent.augments[slot])
    .filter((id): id is string => !!id)
    .map((id) => AUGMENT_BY_ID.get(id)!)
    .filter(Boolean);
}

function addStats(target: Stats, delta: Partial<Stats>, scale = 1) {
  for (const key of Object.keys(delta) as Stat[]) target[key] += (delta[key] ?? 0) * scale;
}

export function derive(agent: Agent, opts: DeriveOptions = {}): Derived {
  const stats: Stats = { ...BASE_STATS };
  const installed = installedAugments(agent);
  const active: Augment[] = [];
  const tags = new Set<string>();
  let energy = BASE_ENERGY;
  let drain = 0;
  let load = 0;
  let signature = 0;

  for (const aug of installed) {
    load += aug.load;
    energy += aug.energy ?? 0;
    if (opts.poweredDown && aug.drain > 0) continue;
    active.push(aug);
    drain += aug.drain;
    signature += aug.signature;
    addStats(stats, aug.stats);
    aug.tags?.forEach((t) => tags.add(t));
  }

  const activeIds = new Set(active.map((a) => a.id));
  const synergies = SYNERGIES.filter((s) => s.ids.every((id) => activeIds.has(id)));
  for (const s of synergies) addStats(stats, s.stats);

  for (const limb of agent.missingLimbs) {
    if (!agent.augments[limb]) addStats(stats, LIMB_PENALTIES[limb]);
  }

  const drugs = opts.drugs ?? NO_DRUGS;
  stats.tech += drugs.intelligence * 2;
  stats.perception += drugs.perception * 2;
  stats.combat += drugs.perception + drugs.adrenaline * 2;
  stats.speed += drugs.adrenaline * 2;
  // Adrenaline makes agents reckless and loud.
  signature += drugs.adrenaline;

  for (const key of Object.keys(stats) as Stat[]) stats[key] = Math.max(0, stats[key]);

  return {
    stats,
    energy,
    drain,
    load,
    tolerance: BASE_TOLERANCE + (opts.toleranceBonus ?? 0),
    signature,
    tags,
    installed,
    active,
    synergies,
  };
}

/** Chance per phase that an over-tolerance agent suffers a rejection episode. */
export function malfunctionChance(d: Derived, dosed: boolean): number {
  const over = d.load - d.tolerance;
  if (over <= 0) return 0;
  return Math.min(0.6, over * (dosed ? 0.015 : 0.08));
}

export function needsDose(d: Derived): boolean {
  return d.load > d.tolerance;
}

/** The augment or synergy contributing most to a stat, for debrief attribution. */
export function topSource(d: Derived, stat: Stat): string | null {
  let best: { name: string; value: number } | null = null;
  for (const src of [...d.active, ...d.synergies]) {
    const value = src.stats[stat] ?? 0;
    if (value > 0 && (!best || value > best.value)) best = { name: src.name, value };
  }
  return best ? best.name.toLowerCase() : null;
}

/** The noisiest powered augment, blamed when the team is spotted. */
export function loudestSource(d: Derived): string | null {
  const loud = d.active.filter((a) => a.signature > 0).sort((a, b) => b.signature - a.signature)[0];
  return loud ? loud.name.toLowerCase() : null;
}

export function drugLoad(drugs: Drugs): number {
  return drugs.intelligence + drugs.perception + drugs.adrenaline;
}
