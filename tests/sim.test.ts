import { describe, expect, it } from 'vitest';
import { createAgent, derive, malfunctionChance } from '../src/sim/agent';
import { deploy, installAugment, newCampaign, rest, startResearch } from '../src/sim/campaign';
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
