// Optional world-building. Nothing here affects the simulation.
import { RIVAL_SYNDICATE } from './data';
import { createRng, hashSeed } from './rng';
import type { Agent, MissionType } from './types';

export interface CodexEntry {
  id: string;
  title: string;
  group: 'World' | 'Corporations' | 'Syndicates' | 'Field notes';
  body: string[];
  /** Locked entries appear once the player meets the subject in play. */
  locked?: boolean;
}

export const CODEX: CodexEntry[] = [
  {
    id: 'world',
    title: 'The Accord cities',
    group: 'World',
    body: [
      'Forty years after the Neural Accord made augmentation legal for corporate use, the old nation states are mostly letterheads. The cities are run by whoever pays for the water, the power and the police.',
      'You run a small syndicate: a handful of agents, a rented clinic and a list of clients who would rather not be seen hiring you.',
    ],
  },
  {
    id: 'augmentation',
    title: 'Augmentation',
    group: 'World',
    body: [
      'An augment is a contract between metal and nerve, and the body never stops renegotiating. Every implant adds load; past a point the immune system starts treating the agent as an intruder.',
      'Most agents describe it the same way: the first augment feels like a gift, the fifth like a debt.',
    ],
  },
  {
    id: 'calyx',
    title: 'Calyx',
    group: 'World',
    body: [
      'Calyx is the suppressant that keeps heavily augmented bodies from rejecting their hardware. It is patented, expensive and occasionally scarce.',
      'Agents call a mission without it “going raw”.',
    ],
  },
  {
    id: 'mercy',
    title: 'Standing',
    group: 'World',
    body: [
      'In a trade built on deniability, the syndicates that leave no bodies get the second phone call. Your standing rises with every clean contract and every prisoner you let walk.',
      'High standing makes captured operatives more willing to listen when you offer them a way out.',
    ],
  },
  {
    id: 'halcyon',
    title: 'Halcyon Biotech',
    group: 'Corporations',
    locked: true,
    body: ['Makers of the Calyx patent, and very interested in anyone who might break it. Halcyon pays well and remembers everything.'],
  },
  {
    id: 'orchid',
    title: 'Orchid Arms',
    group: 'Corporations',
    locked: true,
    body: ['Defence contractor with a consumer line. Their adverts show families; their shareholder reports show border wars.'],
  },
  {
    id: 'meridian',
    title: 'Meridian Grid',
    group: 'Corporations',
    locked: true,
    body: ['Owns the power lines of three cities and the politicians of two. Meridian jobs usually involve someone else’s infrastructure.'],
  },
  {
    id: 'kestrel',
    title: 'Kestrel Pharma',
    group: 'Corporations',
    locked: true,
    body: ['Halcyon’s main rival. Kestrel wants a generic Calyx on the market by any means, and nearly any price.'],
  },
  {
    id: 'vantage',
    title: 'Vantage Logistics',
    group: 'Corporations',
    locked: true,
    body: ['Moves everything that moves. Vantage clients rarely ask what is in the container, and prefer you don’t either.'],
  },
  {
    id: 'tessera',
    title: 'Tessera Holdings',
    group: 'Corporations',
    locked: true,
    body: ['A holding company holding other holding companies. Nobody you have met has seen a Tessera office.'],
  },
  {
    id: 'aldane',
    title: 'Aldane Security',
    group: 'Corporations',
    locked: true,
    body: ['Private police for hire. Aldane hires syndicates to test its own clients’ defences, then sells the clients a fix.'],
  },
  {
    id: 'black-lantern',
    title: RIVAL_SYNDICATE,
    group: 'Syndicates',
    locked: true,
    body: [
      `${RIVAL_SYNDICATE} is the syndicate you keep running into: bigger, better funded, and quick to burn its own people.`,
      'Its operatives are heavily augmented and poorly paid. More than a few would leave, if anyone offered.',
    ],
  },
  {
    id: 'capture',
    title: 'Taking prisoners',
    group: 'Field notes',
    locked: true,
    body: [
      'A subdued operative still has to be carried out. Back at the safehouse you can let them go, debrief them for what they know, or offer them a place in your syndicate. Their augments come with them.',
    ],
  },
];

export const CLIENT_CODEX: Record<string, string> = {
  'Halcyon Biotech': 'halcyon',
  'Orchid Arms': 'orchid',
  'Meridian Grid': 'meridian',
  'Kestrel Pharma': 'kestrel',
  'Vantage Logistics': 'vantage',
  'Tessera Holdings': 'tessera',
  'Aldane Security': 'aldane',
};

const CITIES = ['Neue Halle', 'Port Ostrava', 'the Saint-Laurent arcology', 'Kowloon Reach', 'the Lagos Spire', 'Valparaíso Low', 'New Dunmore'];
const JOBS = ['a paramedic', 'a structural engineer', 'a corporate courier', 'a dock crane operator', 'a stage magician', 'a junior auditor', 'a search-and-rescue diver', 'a security consultant', 'a translator', 'a line cook'];
const REASONS = [
  'Took the first augment to pay off a family debt.',
  'Was augmented after an industrial accident and never went back.',
  'Joined for the money; stayed for the people.',
  'Wants to see the inside of the towers they used to clean.',
  'Owes you a favour and is working it off.',
  'Has a sister in Halcyon’s clinical trials and wants answers.',
  'Believes the syndicates are the only honest players left.',
  'Was fired by Orchid Arms the day before their pension vested.',
];

export function agentBio(agent: Agent): string {
  if (agent.origin === 'captive') {
    return `Former ${RIVAL_SYNDICATE} operative${agent.codename ? ` “${agent.codename}”` : ''}. Changed sides after you brought them in alive.`;
  }
  const rng = createRng(hashSeed('bio', agent.id, agent.name));
  return `From ${rng.pick(CITIES)}. Former ${rng.pick(JOBS)}. ${rng.pick(REASONS)}`;
}

const BRIEFINGS: Record<MissionType, string[]> = {
  infiltration: [
    '“We need ears inside {target}. Nobody can know we were there. Nobody.”',
    '“Plant the tap and walk away. If you trip an alarm, we’ll pretend we never met.”',
  ],
  assassination: [
    '“The person at {target} has become a liability. You understand.” The file is very thin.',
    '“Remove them. How you do it is your business. Whether they wake up is… also your business.”',
  ],
  heist: [
    '“Everything worth knowing about {target} sits in one data core. Copy it. Don’t be subtle on the way out if you don’t have to be.”',
    '“Two layers of ICE. Our last team got through one.”',
  ],
  extraction: [
    '“Our defector is waiting at {target}. They are sedated, they are heavy, and they are worth more than your whole team.”',
    '“Bring them home. The people holding them will not let go politely.”',
  ],
};

export function briefingLine(type: MissionType, target: string, seed: number): string {
  return createRng(seed).pick(BRIEFINGS[type]).replace('{target}', target);
}

export function rivalLine(rival: Agent): string {
  return `Intercepts mention a ${RIVAL_SYNDICATE} operative on the same site: ${rival.name}, codename “${rival.codename}”.`;
}

export interface AugmentLore {
  maker: string;
  model: string;
  line: string;
}

/** Who makes each augment, its model number and a line of catalogue copy. */
export const AUGMENT_LORE: Record<string, AugmentLore> = {
  'reflex-booster': { maker: 'Orchid Arms', model: 'OA-C3 “Quickstep”', line: 'A synaptic sleeve on the cervical spine that fires motor commands before the brain finishes deciding.' },
  'hack-interface': { maker: 'Meridian Grid', model: 'MG-TP4 Temporal Port', line: 'A temporal-lobe port that lets the wearer talk to locks, cameras and doors the way they talk to people: badly, at first.' },
  'tactical-coprocessor': { maker: 'Aldane Security', model: 'AS-TCP7', line: 'Fourteen threads running threat models in parallel. Users report dreaming in probability trees.' },
  'sentinel-overclock': { maker: 'Orchid Arms', model: 'OA-S1 Sentinel', line: 'Military neural lace, clocked well past the safety margin. Not licensed for civilian sale. Not that anyone asks.' },
  'empathy-suite': { maker: 'Tessera Holdings', model: 'TH-E2 Confidant', line: 'Reads micro-expressions and pheromones in four hundredths of a second. Negotiators love it. Spouses do not.' },
  'thermal-optics': { maker: 'Aldane Security', model: 'AS-IR9 Heatsight', line: 'A microbolometer behind the cornea. Sees body heat through drywall and smoke.' },
  'smart-targeting': { maker: 'Orchid Arms', model: 'OA-BX2 Ballistic Eye', line: 'Range, drop and windage, solved and painted on the retina before the trigger finger moves.' },
  'threat-tagger': { maker: 'Aldane Security', model: 'AS-TT3 Overwatch', line: 'Tags every face in view as friend, foe or unknown, and remembers the unknowns.' },
  'dermal-plating': { maker: 'Vantage Logistics', model: 'VL-DP4 Carapace', line: 'Ceramic-aramid plates grown under the skin. Stops a pistol round. Sets off every metal detector in the city.' },
  'energy-converter': { maker: 'Meridian Grid', model: 'MG-BC60 Reservoir', line: 'Three biocells that turn glucose into the current your other augments are always hungry for.' },
  'cooling-loop': { maker: 'Halcyon Biotech', model: 'HB-CL1 Stillwater', line: 'A subcutaneous coolant loop that dumps implant heat and keeps the wearer cold on thermal cameras.' },
  'titan-frame': { maker: 'Vantage Logistics', model: 'VL-T9 Titan', line: 'Full skeletal reinforcement, originally designed for dock workers. The dock workers unionised against it.' },
  'sedative-mist': { maker: 'Kestrel Pharma', model: 'KP-SD4 Lullaby', line: 'Chest vents release a fast sedative in close quarters. The wearer is immune. Usually.' },
  'strength-frame': { maker: 'Vantage Logistics', model: 'VL-H24 Longshore', line: 'Hydraulic pistons along both forearms. Lifts a car door, or a wounded friend, without strain.' },
  'recoil-dampers': { maker: 'Orchid Arms', model: 'OA-G18 Steadyhand', line: 'Wrist gyroscopes spinning at eighteen thousand rpm. The arm stays still when the world does not.' },
  'nano-blade': { maker: 'Black market', model: 'Unbranded mono-edge', line: 'A retractable blade with a single-molecule edge. Nobody admits to making these.' },
  'arc-gloves': { maker: 'Kestrel Pharma', model: 'KP-A9 Soft Touch', line: 'Nine kilovolts at the fingertips, tuned to knock people out instead of down. Sold as “crowd care”.' },
  'prosthetic-arm': { maker: 'Halcyon Biotech', model: 'HB-M1 Standard', line: 'A medical-grade replacement arm. It works. That is all it does.' },
  'sprint-servos': { maker: 'Orchid Arms', model: 'OA-K6 Stride', line: 'Knee servos and calf pistons for bursts of speed. The motors whine, loudly enough to matter.' },
  'silent-stride': { maker: 'Tessera Holdings', model: 'TH-F1 Hush', line: 'Gel pads and active damping in the soles. Footfalls drop to almost nothing.' },
  'jump-assist': { maker: 'Vantage Logistics', model: 'VL-J3 Updraft', line: 'Coiled calf springs that store and release energy: rooftops up, six-metre drops down, both in silence.' },
  'prosthetic-leg': { maker: 'Halcyon Biotech', model: 'HB-M2 Standard', line: 'A medical-grade replacement leg. Reliable, unremarkable, paid for by insurance, if you have any.' },
  'glass-shield': { maker: 'Black market', model: 'Glass-shield, gen 3', line: 'A skin of light-bending cells that turns the wearer into a ripple. Drinks power like a thirsty child.' },
  'social-camo': { maker: 'Tessera Holdings', model: 'TH-SC5 Everyman', line: 'Shifts facial geometry and posture just enough that cameras and people fail to make a match.' },
  'toxin-filter': { maker: 'Kestrel Pharma', model: 'KP-TF2 Breathe', line: 'An epidermal mesh and lung filters that shrug off gas, smoke and most of what is in a combat drug.' },
};
