export type Slot = 'neural' | 'optics' | 'torso' | 'arms' | 'legs' | 'skin';
export type Stat = 'combat' | 'stealth' | 'tech' | 'armor' | 'speed' | 'perception';
export type Stats = Record<Stat, number>;
export type Limb = 'arms' | 'legs';

export interface Augment {
  id: string;
  name: string;
  slot: Slot;
  tier: 1 | 2 | 3;
  desc: string;
  stats: Partial<Stats>;
  /** Energy spent per mission phase while powered (0 = passive, never shuts down). */
  drain: number;
  /** Rejection load added to the agent's body. */
  load: number;
  /** Noise, heat and visibility. Negative values make the agent quieter. */
  signature: number;
  /** Extra energy capacity. */
  energy?: number;
  cost: number;
  /** Research project id that unlocks this augment. Absent = available from the start. */
  research?: string;
  tags?: string[];
}

export interface Synergy {
  id: string;
  name: string;
  ids: string[];
  stats: Partial<Stats>;
  desc: string;
}

export interface Drugs {
  intelligence: number;
  perception: number;
  adrenaline: number;
}

export interface AgentRecord {
  /** Missions finished without an alarm. */
  quietMissions: number;
  hacks: number;
  subdued: number;
  carries: number;
  overTolerance: number;
  timesDowned: number;
}

export interface Agent {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  augments: Partial<Record<Slot, string>>;
  missingLimbs: Limb[];
  missions: number;
  kills: number;
  history: string[];
  status: 'active' | 'kia';
  /** Trait ids: one personality from the start, plus perks and quirks earned in the field. */
  traits: string[];
  record: AgentRecord;
  origin: 'founder' | 'recruit' | 'captive';
  /** Codename, for rival operatives. */
  codename?: string;
}

export interface Trait {
  id: string;
  name: string;
  kind: 'personality' | 'perk' | 'quirk';
  desc: string;
  /** How a perk or quirk is earned, shown in the codex and on the agent screen. */
  how?: string;
  stats?: Partial<Stats>;
  /** Extra stats in squads of one or two. */
  smallSquad?: Partial<Stats>;
  /** Extra stats in squads of three or four. */
  bigSquad?: Partial<Stats>;
  /** Extra stats when the mission is non-lethal. */
  nonLethal?: Partial<Stats>;
  tolerance?: number;
  maxHp?: number;
  tags?: string[];
}

export type RulesOfEngagement = 'lethal' | 'nonlethal';
export type RivalOrders = 'avoid' | 'capture' | 'eliminate';

export type MissionType = 'infiltration' | 'assassination' | 'heist' | 'extraction';
export type PhaseKind = 'stealth' | 'combat' | 'hack' | 'speed' | 'rival';

export interface PhaseTemplate {
  kind: PhaseKind;
  name: string;
  objective?: boolean;
  /** Extra enemies on top of the difficulty-based count (combat phases). */
  enemies?: number;
  /** Extra bodies to carry (extraction phases), e.g. a rescued VIP. */
  carry?: number;
}

export interface Contract {
  id: string;
  type: MissionType;
  difficulty: number;
  client: string;
  target: string;
  payout: number;
  /** A rival syndicate operative is working the same site. */
  rival?: Agent;
  /** The client pays this bonus if nobody is killed. */
  cleanBonus?: number;
}

export interface LogLine {
  text: string;
  tone: 'header' | 'good' | 'bad' | 'info';
}

export interface AgentOutcome {
  agentId: string;
  hp: number;
  downed: boolean;
  kia: boolean;
  lostLimb?: Limb;
  kills: number;
  subdued: number;
  hacks: number;
  /** Was standing at extraction while carrying a downed teammate, VIP or captive. */
  carried: boolean;
  crash: number;
  overdose: boolean;
}

export interface MissionResult {
  success: boolean;
  compromised: boolean;
  log: LogLine[];
  outcomes: AgentOutcome[];
  payout: number;
  rp: number;
  alarm: boolean;
  kills: number;
  subdued: number;
  /** Paid on top of the fee because nobody died. */
  cleanBonus: number;
  rivalOutcome?: 'avoided' | 'captured' | 'killed' | 'escaped';
  /** The rival operative, if the team brought them home. */
  captive?: Agent;
}
