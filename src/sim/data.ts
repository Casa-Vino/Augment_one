// All game content lives here as plain data, so balance changes are edits, not code.
import type { Augment, MissionType, PhaseTemplate, Slot, Stats, Synergy, Trait } from './types';

export const SLOTS: Slot[] = ['neural', 'optics', 'torso', 'arms', 'legs', 'skin'];

export const SLOT_LABELS: Record<Slot, string> = {
  neural: 'Neural',
  optics: 'Optics',
  torso: 'Torso',
  arms: 'Arms',
  legs: 'Legs',
  skin: 'Skin',
};

export const BASE_STATS: Stats = { combat: 10, stealth: 10, tech: 5, armor: 0, speed: 10, perception: 10 };
export const BASE_ENERGY = 80;
export const BASE_TOLERANCE = 10;
export const BASE_HP = 100;

export const AUGMENTS: Augment[] = [
  // Neural
  { id: 'reflex-booster', name: 'Reflex booster', slot: 'neural', tier: 1, desc: 'Wetware that shortens reaction time.', stats: { combat: 4, speed: 2 }, drain: 4, load: 3, signature: 0, cost: 1200 },
  { id: 'hack-interface', name: 'Hacking interface', slot: 'neural', tier: 1, desc: 'Direct neural link to security systems.', stats: { tech: 8 }, drain: 2, load: 2, signature: 0, cost: 1000, tags: ['hacker'] },
  { id: 'tactical-coprocessor', name: 'Tactical co-processor', slot: 'neural', tier: 2, desc: 'Runs threat models alongside the agent’s own thoughts.', stats: { perception: 4, combat: 3, tech: 4 }, drain: 3, load: 4, signature: 0, cost: 2400, research: 'neural-2', tags: ['hacker'] },
  { id: 'empathy-suite', name: 'Empathy suite', slot: 'neural', tier: 2, desc: 'Reads micro-expressions and pheromones. Talks people down, and round.', stats: { stealth: 3, tech: 3, perception: 2 }, drain: 2, load: 3, signature: 0, cost: 2000, research: 'social-2', tags: ['persuader'] },
  { id: 'sentinel-overclock', name: 'Sentinel overclock', slot: 'neural', tier: 3, desc: 'Military reflex suite. Burns energy and nerves.', stats: { combat: 9, speed: 4, perception: 2 }, drain: 8, load: 6, signature: 1, cost: 4000, research: 'neural-3' },

  // Optics
  { id: 'thermal-optics', name: 'Thermal optics', slot: 'optics', tier: 1, desc: 'Sees heat through walls and smoke.', stats: { perception: 6 }, drain: 1, load: 1, signature: 0, cost: 700 },
  { id: 'smart-targeting', name: 'Smart targeting', slot: 'optics', tier: 1, desc: 'Lead and drop compensation overlaid on the eye.', stats: { combat: 5 }, drain: 2, load: 2, signature: 0, cost: 1100, tags: ['aim'] },
  { id: 'threat-tagger', name: 'Threat tagger', slot: 'optics', tier: 2, desc: 'Marks patrols and camera cones in real time.', stats: { perception: 4, stealth: 4 }, drain: 2, load: 2, signature: 0, cost: 1800, research: 'optics-2' },

  // Torso
  { id: 'dermal-plating', name: 'Dermal plating', slot: 'torso', tier: 1, desc: 'Ceramic plates under the skin. Heavy and noisy.', stats: { armor: 7, speed: -1 }, drain: 0, load: 3, signature: 3, cost: 1200 },
  { id: 'energy-converter', name: 'Energy converter', slot: 'torso', tier: 1, desc: 'Larger biocell bank for power-hungry builds.', stats: {}, drain: 0, load: 2, signature: 0, energy: 60, cost: 900 },
  { id: 'cooling-loop', name: 'Cooling loop', slot: 'torso', tier: 1, desc: 'Dumps implant heat. Quieter on thermal scanners.', stats: {}, drain: 0, load: 1, signature: -3, cost: 800 },
  { id: 'sedative-mist', name: 'Sedative mist', slot: 'torso', tier: 2, desc: 'Vents a fast-acting sedative in close quarters.', stats: { combat: 3 }, drain: 3, load: 2, signature: 0, cost: 1600, research: 'nonlethal-2', tags: ['nonlethal'] },
  { id: 'titan-frame', name: 'Titan frame', slot: 'torso', tier: 2, desc: 'Full skeletal reinforcement. A walking tank.', stats: { armor: 13, speed: -2 }, drain: 0, load: 5, signature: 5, cost: 2600, research: 'torso-2' },

  // Arms
  { id: 'strength-frame', name: 'Strength frame', slot: 'arms', tier: 1, desc: 'Hydraulic arms. Carries a downed teammate easily.', stats: { combat: 2, armor: 2 }, drain: 0, load: 2, signature: 1, cost: 900, tags: ['carry'] },
  { id: 'recoil-dampers', name: 'Recoil dampers', slot: 'arms', tier: 1, desc: 'Gyro-stabilised forearms.', stats: { combat: 3 }, drain: 0, load: 1, signature: 0, cost: 800, tags: ['aim'] },
  { id: 'nano-blade', name: 'Nano-blade', slot: 'arms', tier: 1, desc: 'Retractable blade for silent takedowns.', stats: { combat: 4, stealth: 2 }, drain: 1, load: 2, signature: 0, cost: 1300 },
  { id: 'arc-gloves', name: 'Arc gloves', slot: 'arms', tier: 1, desc: 'Shock-padded hands. Puts people to sleep instead of in the ground.', stats: { combat: 4 }, drain: 1, load: 1, signature: 0, cost: 1000, tags: ['nonlethal'] },
  { id: 'prosthetic-arm', name: 'Basic prosthetic arm', slot: 'arms', tier: 1, desc: 'Cheap replacement for a lost arm. No bonuses.', stats: {}, drain: 0, load: 1, signature: 0, cost: 300 },

  // Legs
  { id: 'sprint-servos', name: 'Sprint servos', slot: 'legs', tier: 1, desc: 'Fast, but the motors whine.', stats: { speed: 6 }, drain: 2, load: 2, signature: 2, cost: 900 },
  { id: 'silent-stride', name: 'Silent stride', slot: 'legs', tier: 1, desc: 'Dampened footfalls.', stats: { stealth: 5 }, drain: 0, load: 1, signature: -2, cost: 1000 },
  { id: 'jump-assist', name: 'Jump assist', slot: 'legs', tier: 2, desc: 'Reaches rooftops and drops without a sound.', stats: { speed: 4, stealth: 3 }, drain: 2, load: 2, signature: 0, cost: 1700, research: 'legs-2' },
  { id: 'prosthetic-leg', name: 'Basic prosthetic leg', slot: 'legs', tier: 1, desc: 'Cheap replacement for a lost leg. No bonuses.', stats: {}, drain: 0, load: 1, signature: 0, cost: 300 },

  // Skin
  { id: 'glass-shield', name: 'Glass-shield cloak', slot: 'skin', tier: 1, desc: 'Optical camouflage. Drains power fast.', stats: { stealth: 10 }, drain: 10, load: 3, signature: -4, cost: 2200 },
  { id: 'social-camo', name: 'Social camouflage', slot: 'skin', tier: 1, desc: 'Face and posture masking for crowds.', stats: { stealth: 4, tech: 2 }, drain: 0, load: 1, signature: 0, cost: 900 },
  { id: 'toxin-filter', name: 'Toxin filter', slot: 'skin', tier: 1, desc: 'Subdermal filters. Shrugs off gas and drugs.', stats: { armor: 3 }, drain: 0, load: 1, signature: 0, cost: 600, tags: ['filter'] },
];

export const AUGMENT_BY_ID = new Map(AUGMENTS.map((a) => [a.id, a]));

export const SYNERGIES: Synergy[] = [
  { id: 'locked-aim', name: 'Locked aim', ids: ['smart-targeting', 'recoil-dampers'], stats: { combat: 4 }, desc: 'Targeting overlay drives the stabilisers directly.' },
  { id: 'network-sight', name: 'Network sight', ids: ['threat-tagger', 'hack-interface'], stats: { tech: 3, perception: 2 }, desc: 'Sees the security network as well as the guards.' },
  { id: 'ghost-takedown', name: 'Ghost takedown', ids: ['silent-stride', 'nano-blade'], stats: { stealth: 3, combat: 1 }, desc: 'In, cut, out, unheard.' },
  { id: 'cold-runner', name: 'Cold runner', ids: ['sprint-servos', 'cooling-loop'], stats: { stealth: 2 }, desc: 'The cooling loop silences the servo whine.' },
  { id: 'pressure-points', name: 'Pressure points', ids: ['smart-targeting', 'arc-gloves'], stats: { combat: 3 }, desc: 'The targeting overlay shows nerve clusters, not centre mass.' },
  { id: 'quiet-hands', name: 'Quiet hands', ids: ['arc-gloves', 'silent-stride'], stats: { stealth: 2, combat: 1 }, desc: 'Approach unheard, end it without a shot.' },
  { id: 'bulk-breaks-cloak', name: 'Bulk breaks the cloak', ids: ['titan-frame', 'glass-shield'], stats: { stealth: -8 }, desc: 'The cloak cannot wrap a frame that large.' },
];

export interface ResearchProject {
  id: string;
  name: string;
  cost: number;
  desc: string;
  requires?: string;
  toleranceBonus?: number;
}

export const RESEARCH: ResearchProject[] = [
  { id: 'optics-2', name: 'Threat analysis optics', cost: 2, desc: 'Unlocks the threat tagger.' },
  { id: 'legs-2', name: 'Kinetic legs', cost: 2, desc: 'Unlocks jump assist.' },
  { id: 'neural-2', name: 'Tactical co-processing', cost: 3, desc: 'Unlocks the tactical co-processor.' },
  { id: 'torso-2', name: 'Titan chassis', cost: 3, desc: 'Unlocks the titan frame.' },
  { id: 'gene-therapy', name: 'Rejection gene therapy', cost: 4, desc: '+3 rejection tolerance for every agent.', toleranceBonus: 3 },
  { id: 'neural-3', name: 'Sentinel programme', cost: 5, desc: 'Unlocks the sentinel overclock.', requires: 'neural-2' },
  { id: 'nonlethal-2', name: 'Pacification research', cost: 2, desc: 'Unlocks sedative mist.' },
  { id: 'social-2', name: 'Social enhancement', cost: 3, desc: 'Unlocks the empathy suite. Helps persuade captives.' },
];

export interface MissionTemplate {
  label: string;
  blurb: string;
  payoutMult: number;
  phases: PhaseTemplate[];
}

export const MISSIONS: Record<MissionType, MissionTemplate> = {
  infiltration: {
    label: 'Infiltration',
    blurb: 'Get in unseen, plant a network tap, get out. An alarm halves the fee.',
    payoutMult: 1,
    phases: [
      { kind: 'stealth', name: 'Insertion' },
      { kind: 'stealth', name: 'Approach' },
      { kind: 'hack', name: 'Plant the tap', objective: true },
      { kind: 'speed', name: 'Extraction' },
    ],
  },
  assassination: {
    label: 'Assassination',
    blurb: 'Reach the target and eliminate them and their guards.',
    payoutMult: 1.15,
    phases: [
      { kind: 'stealth', name: 'Insertion' },
      { kind: 'combat', name: 'Eliminate the target', objective: true, enemies: 2 },
      { kind: 'speed', name: 'Extraction' },
    ],
  },
  heist: {
    label: 'Data heist',
    blurb: 'Two layers of ICE, then hold out while the data copies. Hard on power.',
    payoutMult: 1.3,
    phases: [
      { kind: 'stealth', name: 'Insertion' },
      { kind: 'hack', name: 'Bypass the ICE' },
      { kind: 'hack', name: 'Copy the data core', objective: true },
      { kind: 'combat', name: 'Security response', enemies: 0 },
      { kind: 'speed', name: 'Extraction' },
    ],
  },
  extraction: {
    label: 'VIP extraction',
    blurb: 'Breach, hold the room, carry a sedated defector out.',
    payoutMult: 1.2,
    phases: [
      { kind: 'combat', name: 'Breach', enemies: 0 },
      { kind: 'combat', name: 'Hold the room', objective: true, enemies: 1 },
      { kind: 'speed', name: 'Carry the defector out', carry: 1 },
    ],
  },
};

export const CLIENTS = ['Halcyon Biotech', 'Orchid Arms', 'Meridian Grid', 'Kestrel Pharma', 'Vantage Logistics', 'Tessera Holdings', 'Aldane Security'];
export const TARGET_SITES = ['a dockside warehouse', 'a research arcology', 'an orbital uplink station', 'a private clinic', 'a corporate tower', 'a transit hub', 'an underground server farm'];

export const AGENT_NAMES = [
  'Kowalski', 'Adeyemi', 'Vasquez', 'Lindqvist', 'Okafor', 'Tanaka', 'Moreau', 'Novak', 'Reyes', 'Haddad',
  'Brandt', 'Ivanova', 'Mensah', 'Calloway', 'Sato', 'Ferreira', 'Kerrigan', 'Dubois', 'Petrov', 'Nakamura',
];

export const PRICES = {
  recruit: 1200,
  dose: 250,
  upkeepPerAgent: 150,
  holdingPerCaptive: 100,
};

export const HEAL_PER_TURN = 30;
export const MAX_ROSTER = 8;
export const MAX_SQUAD = 4;
export const CAMPAIGN_LENGTH = 10;

/** Without a non-lethal augment or trait, subduing someone is harder than shooting them. */
export const NONLETHAL_PENALTY = 3;
export const CLEAN_BONUS_RATE = 0.3;
export const MAX_CAPTIVES = 3;
/** Missions together before a pair becomes Trusted, then Inseparable. */
export const BOND_LEVELS = [2, 5];

export const TRAITS: Trait[] = [
  // Personalities: every agent starts with one.
  { id: 'lone-wolf', name: 'Lone wolf', kind: 'personality', desc: 'Sharper alone or in a pair (+2 stealth, +2 combat); less so in a crowd (−1 stealth).', smallSquad: { stealth: 2, combat: 2 }, bigSquad: { stealth: -1 } },
  { id: 'team-player', name: 'Team player', kind: 'personality', desc: 'At their best in a full squad (+2 combat, +1 perception in squads of 3+).', bigSquad: { combat: 2, perception: 1 } },
  { id: 'idealist', name: 'Idealist', kind: 'personality', desc: 'Believes nobody has to die. +3 combat on non-lethal missions.', nonLethal: { combat: 3 } },
  { id: 'cautious', name: 'Cautious', kind: 'personality', desc: 'Checks every corner twice. +2 armour, +1 perception, −1 speed.', stats: { armor: 2, perception: 1, speed: -1 } },
  { id: 'tinkerer', name: 'Tinkerer', kind: 'personality', desc: 'Always opening things up. +2 tech, +1 rejection tolerance.', stats: { tech: 2 }, tolerance: 1 },
  { id: 'chatterbox', name: 'Chatterbox', kind: 'personality', desc: 'Keeps morale up and talks through problems (+2 tech, +1 perception), but not quietly (−2 stealth in squads of 3+).', stats: { tech: 2, perception: 1 }, bigSquad: { stealth: -2 } },

  // Perks: earned in the field.
  { id: 'ghost', name: 'Ghost', kind: 'perk', desc: '+3 stealth.', how: 'Three missions without raising an alarm.', stats: { stealth: 3 } },
  { id: 'steady-hands', name: 'Steady hands', kind: 'perk', desc: '+3 tech.', how: 'Cracked three systems.', stats: { tech: 3 } },
  { id: 'pack-mule', name: 'Pack mule', kind: 'perk', desc: 'Carries bodies as well as a strength frame does.', how: 'Carried someone out of a mission.', tags: ['carry'] },
  { id: 'survivor', name: 'Survivor', kind: 'perk', desc: '+15 max HP.', how: 'Went down on a mission and came back.', maxHp: 15 },
  { id: 'peacekeeper', name: 'Peacekeeper', kind: 'perk', desc: 'Subdues people without the non-lethal penalty.', how: 'Subdued ten people.', tags: ['nonlethal'] },
  { id: 'iron-will', name: 'Iron will', kind: 'perk', desc: '+2 rejection tolerance.', how: 'Finished three missions over tolerance.', tolerance: 2 },

  // Quirks: mild, and they fade.
  { id: 'jumpy', name: 'Jumpy', kind: 'quirk', desc: '−2 stealth, −1 perception. Fades after a mission without going down.', how: 'Went down on a mission.', stats: { stealth: -2, perception: -1 } },
];

export const TRAIT_BY_ID = new Map(TRAITS.map((t) => [t.id, t]));
export const PERSONALITIES = TRAITS.filter((t) => t.kind === 'personality').map((t) => t.id);

export const RIVAL_SYNDICATE = 'Black Lantern';
export const RIVAL_CODENAMES = ['Wren', 'Ashfall', 'Moth', 'Lattice', 'Cinder', 'Halberd', 'Quill', 'Saltire', 'Vesper', 'Kestrel', 'Rook', 'Tallow'];
export const RIVAL_NAMES = ['Ilse Varga', 'Tomas Reid', 'Ana Bloom', 'Joon Park', 'Dara Quist', 'Felix Ortega', 'Mira Coll', 'Sasha Lind', 'Remy Okoro', 'Noor Saleh', 'Pia Hart', 'Elias Vane'];
