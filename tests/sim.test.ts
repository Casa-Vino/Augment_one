import { describe, expect, it } from 'vitest';
import { createAgent, derive, malfunctionChance } from '../src/sim/agent';
import { calyxStops, deploy, installAugment, migrate, newCampaign, offerPlace, placeSleeper, recallSleeper, rest, runCalyx, startResearch } from '../src/sim/campaign';
import { resolveMission } from '../src/sim/mission';
import { createRng } from '../src/sim/rng';
import type { Agent, Contract } from '../src/sim/types';

const NONE = { intelligence: 0, perception: 0, adrenaline: 0 };
const contract: Contract = { id: 'c', type: 'infiltration', difficulty: 2, client: 'X', target: 'Y', payout: 2000 };

function withAugs(augments: Agent['augments']): Agent {
  return { ...createAgent('a', 'Test'), augments };
}

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });
});

describe('derive', () => {
  it('adds augment stats, load, drain and signature', () => {
    const d = derive(withAugs({ skin: 'glass-shield', torso: 'dermal-plating' }));
    expect(d.stats.stealth).toBe(20);
    expect(d.stats.armor).toBe(7);
    expect(d.load).toBe(6);
    expect(d.drain).toBe(10);
    expect(d.signature).toBe(-1);
  });

  it('applies synergies only when both parts are powered', () => {
    const agent = withAugs({ optics: 'smart-targeting', arms: 'recoil-dampers' });
    expect(derive(agent).synergies.map((s) => s.id)).toContain('locked-aim');
    expect(derive(agent, { poweredDown: true }).synergies).toHaveLength(0);
  });

  it('penalises a missing limb until it is replaced', () => {
    const agent = { ...withAugs({}), missingLimbs: ['legs' as const] };
    expect(derive(agent).stats.speed).toBe(3);
    expect(derive({ ...agent, augments: { legs: 'prosthetic-leg' } }).stats.speed).toBe(10);
  });

  it('raises malfunction risk over tolerance, reduced by a dose', () => {
    const d = derive(withAugs({ neural: 'reflex-booster', torso: 'dermal-plating', skin: 'glass-shield', arms: 'nano-blade', legs: 'sprint-servos' }));
    expect(d.load).toBe(13);
    expect(malfunctionChance(d, false)).toBeCloseTo(0.24);
    expect(malfunctionChance(d, true)).toBeCloseTo(0.045);
  });
});

describe('resolveMission', () => {
  const squad = [withAugs({ skin: 'glass-shield', neural: 'hack-interface' }), { ...withAugs({ legs: 'silent-stride' }), id: 'b', name: 'Other' }];
  const input = (seed: number) => ({ contract, squad: squad.map((agent) => ({ agent, drugs: NONE, dosed: false })), toleranceBonus: 0, seed });

  it('gives the same result for the same seed', () => {
    expect(resolveMission(input(7))).toEqual(resolveMission(input(7)));
  });

  it('pays only on success and reports every agent', () => {
    for (let seed = 0; seed < 50; seed++) {
      const r = resolveMission(input(seed));
      expect(r.outcomes).toHaveLength(2);
      expect(r.payout > 0).toBe(r.success);
      expect(r.log.length).toBeGreaterThan(3);
    }
  });
});

describe('campaign', () => {
  it('charges for augments and refuses locked ones', () => {
    const s = newCampaign(1);
    const id = s.roster[0].id;
    const bought = installAugment(s, id, 'thermal-optics');
    expect(bought.ok && bought.state.money).toBe(s.money - 700);
    expect(installAugment(s, id, 'titan-frame')).toEqual({ ok: false, error: 'Not researched yet.' });
  });

  it('unlocks research with points', () => {
    const s = { ...newCampaign(1), rp: 3 };
    const r = startResearch(s, 'torso-2');
    expect(r.ok && r.state.research).toEqual(['torso-2']);
    expect(r.ok && installAugment({ ...r.state, money: 9999 }, s.roster[0].id, 'titan-frame').ok).toBe(true);
  });

  it('advances a turn on deploy and never mutates the old state', () => {
    const s = newCampaign(3);
    const before = JSON.stringify(s);
    const r = deploy(s, s.contracts[0].id, [{ agentId: s.roster[0].id, drugs: NONE, dosed: false }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(s)).toBe(before);
    expect(r.state.turn).toBe(2);
    expect(r.state.history).toHaveLength(1);
    expect(r.state.contracts[0].id).toMatch(/^t2/);
  });

  it('rest heals and charges upkeep', () => {
    const s = newCampaign(4);
    s.roster[0].hp = 20;
    const r = rest(s);
    expect(r.ok && r.state.roster[0].hp).toBe(80);
    expect(r.ok && r.state.money).toBe(s.money - 4 * 150);
  });
});

describe('v2: team, orders and captives', () => {
  const combat: Contract = { id: 'k', type: 'assassination', difficulty: 1, client: 'X', target: 'Y', payout: 2000 };

  it('non-lethal missions never kill anyone', () => {
    const squad = ['a', 'b', 'c'].map((id) => ({ agent: { ...withAugs({ arms: 'arc-gloves' }), id }, drugs: NONE, dosed: false }));
    for (let seed = 0; seed < 40; seed++) {
      const r = resolveMission({ contract: combat, squad, toleranceBonus: 0, seed, rules: 'nonlethal' });
      expect(r.kills).toBe(0);
    }
  });

  it('applies personality traits by squad size', () => {
    const wolf = { ...withAugs({}), traits: ['lone-wolf'] };
    expect(derive(wolf, { squadSize: 1 }).stats.stealth).toBe(12);
    expect(derive(wolf, { squadSize: 4 }).stats.stealth).toBe(9);
  });

  it('forms bonds and awards traits after missions', () => {
    let s = newCampaign(11);
    const pair = s.roster.slice(0, 2).map((a) => ({ agentId: a.id, drugs: NONE, dosed: false }));
    for (let i = 0; i < 2; i++) {
      const r = deploy(s, s.contracts[0].id, pair);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const alive = pair.filter((p) => s.roster.find((a) => a.id === p.agentId)!.status === 'active');
    if (alive.length === 2) expect(s.bonds[`${pair[0].agentId}|${pair[1].agentId}`]).toBe(2);
    expect(s.history.every((h) => Array.isArray(h.events))).toBe(true);
  });

  it('turns a captive into an agent who keeps their augments', () => {
    const s = newCampaign(5);
    const prisoner = { ...withAugs({ skin: 'glass-shield' }), id: 'r9', name: 'Ilse Varga', codename: 'Wren', origin: 'captive' as const };
    s.captives.push({ agent: prisoner, since: 1 });
    s.standing = 10;
    const { outcome, accepted } = offerPlace(s, 'r9');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    if (accepted) {
      const joined = outcome.state.roster.at(-1)!;
      expect(joined.name).toBe('Ilse Varga');
      expect(joined.augments.skin).toBe('glass-shield');
    } else {
      expect(offerPlace(outcome.state, 'r9').outcome.ok).toBe(false);
    }
  });

  it('migrates a v1 save', () => {
    const v1 = { ...newCampaign(2), version: 1 } as Record<string, unknown>;
    for (const key of ['standing', 'bonds', 'captives', 'codex', 'settings']) delete v1[key];
    (v1.roster as Agent[]).forEach((a) => { delete (a as Partial<Agent>).traits; delete (a as Partial<Agent>).record; });
    const s = migrate(v1)!;
    expect(s.version).toBe(3);
    expect(s.contracts.every((c) => c.regionId)).toBe(true);
    expect(s.roster.every((a) => a.traits.length === 1)).toBe(true);
    expect(s.captives).toEqual([]);
  });
});

describe('v3: the city map', () => {
  it('offers four contracts in four different districts', () => {
    const s = newCampaign(21);
    expect(new Set(s.contracts.map((c) => c.regionId)).size).toBe(4);
  });

  it('a successful contract raises influence in its district', () => {
    const s = newCampaign(8);
    const c = s.contracts[0];
    const r = deploy(s, c.id, s.roster.map((a) => ({ agentId: a.id, drugs: NONE, dosed: false })));
    if (!r.ok) throw new Error(r.error);
    const last = r.state.history.at(-1)!;
    expect(r.state.influence[c.regionId!]).toBe(last.result.success ? 20 + 5 * c.difficulty + (last.result.kills === 0 ? 10 : 0) : 0);
  });

  it('sleepers leave the roster, report each turn, and can be recalled', () => {
    let s = newCampaign(3);
    const id = s.roster[0].id;
    const placed = placeSleeper(s, id, 'docks');
    if (!placed.ok) throw new Error(placed.error);
    s = placed.state;
    expect(s.roster[0].status).toBe('sleeper');
    const r = rest(s);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.news.some((n) => n.includes(s.roster[0].name))).toBe(true);
    if (r.state.roster[0].status === 'sleeper') {
      const back = recallSleeper(r.state, id);
      expect(back.ok && back.state.roster[0].status).toBe('active');
    }
  });

  it('the Calyx run is fixed per turn and pays only if nobody is caught', () => {
    const s = newCampaign(4);
    const id = s.roster[0].id;
    expect(calyxStops(s, id)).toEqual(calyxStops(s, id));
    const stops = calyxStops(s, id);
    const r = runCalyx(s, id, 3);
    if (!r.ok) throw new Error(r.error);
    const caught = stops.slice(0, 3).some((x) => x.caught);
    expect(r.state.money - s.money).toBe(caught ? 0 : stops.slice(0, 3).reduce((a, x) => a + x.reward, 0));
    expect(runCalyx(r.state, id, 1).ok).toBe(false);
  });
});
