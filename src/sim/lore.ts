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
