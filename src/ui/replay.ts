// After-action replay: a night-time isometric reconstruction of a mission, drawn on a
// canvas from the replay events attached to the debrief log. Watch-only.
import { missionPhases } from '../sim/mission';
import { createRng, hashSeed } from '../sim/rng';
import type { Contract, LogLine, PhaseKind, ReplayEvent } from '../sim/types';

const W = 720;
const H = 405;
const GRID = 12;
const TW = 24; // half tile width
const TH = 12; // half tile height
const OX = W / 2;
const OY = 78;

const C = {
  ground: '#0f0e0b',
  grid: '#1c1913',
  left: '#1a1712',
  right: '#12100c',
  top: '#262017',
  edge: '#332c20',
  gold: '#e9a23b',
  enemy: '#d0564a',
  patrol: '#9c9282',
  rival: '#c08af0',
  cyan: '#5fb3c9',
  red: '#e2574c',
  text: '#ece6da',
  muted: '#a39a88',
};

type ActorKind = 'agent' | 'enemy' | 'patrol' | 'rival' | 'target';

interface Actor {
  id: string;
  kind: ActorKind;
  x: number;
  y: number;
  tx: number;
  ty: number;
  down: boolean;
  gone: boolean;
  flash: number;
  alpha: number;
}

interface Effect {
  kind: 'tracer' | 'z' | 'x' | 'ring' | 'beam';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  color: string;
  born: number;
  life: number;
}

interface Building {
  gx: number;
  gy: number;
  h: number;
  lit: number[];
}

export interface ReplayController {
  play(): void;
  pause(): void;
  toggle(): boolean;
  restart(): void;
  toEnd(): void;
  setSpeed(speed: number): void;
  destroy(): void;
  readonly playing: boolean;
}

const iso = (x: number, y: number) => ({ sx: OX + (x - y) * TW, sy: OY + (x + y) * TH });

export function mountReplay(
  canvas: HTMLCanvasElement,
  contract: Contract,
  log: LogLine[],
  squadIds: string[],
  onStep: (index: number) => void,
  startAt = 0,
): ReplayController {
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // --- The site: path of waypoints, buildings around it, seeded by the contract ---
  const rng = createRng(hashSeed('site', contract.id));
  const phases = missionPhases(contract);
  const start = { x: 1.5, y: 10.5 };
  const end = { x: 10.5, y: 1.5 };
  const waypoints = phases.map((_, i) => {
    const t = (i + 1) / phases.length;
    const bend = Math.sin(t * Math.PI) * 2.2;
    return { x: start.x + (end.x - start.x) * t + bend + rng.int(-5, 5) / 10, y: start.y + (end.y - start.y) * t + bend + rng.int(-5, 5) / 10 };
  });
  const route = [start, ...waypoints];
  const nearRoute = (gx: number, gy: number) =>
    route.some((p, i) => {
      const q = route[i + 1] ?? p;
      for (let s = 0; s <= 10; s++) {
        const px = p.x + ((q.x - p.x) * s) / 10;
        const py = p.y + ((q.y - p.y) * s) / 10;
        if (Math.abs(px - (gx + 0.5)) < 1.6 && Math.abs(py - (gy + 0.5)) < 1.6) return true;
      }
      return false;
    });
  const buildings: Building[] = [];
  for (let gx = 0; gx < GRID; gx++) {
    for (let gy = 0; gy < GRID; gy++) {
      if (nearRoute(gx, gy) || !rng.chance(0.34)) continue;
      // Low buildings in the foreground, towers at the back.
      const back = 1 - (gx + gy) / (2 * GRID);
      buildings.push({ gx, gy, h: Math.round(rng.int(12, 30) + back * rng.int(10, 60)), lit: Array.from({ length: 6 }, () => (rng.chance(0.35) ? 1 : 0)) });
    }
  }
  const objectiveIndex = phases.findIndex((p) => p.objective);
  const terminalPhase = phases.findIndex((p) => p.kind === 'hack');
  const terminal = terminalPhase >= 0 ? { x: waypoints[terminalPhase].x + 0.9, y: waypoints[terminalPhase].y - 0.6 } : null;
  let terminalState: 'idle' | 'ok' | 'fail' = 'idle';
  const van = { x: end.x + 0.8, y: end.y - 0.3, leaving: -1 };

  // --- Actors ---
  const formation = [
    [0, 0],
    [0.55, 0.35],
    [-0.35, 0.55],
    [0.45, -0.45],
  ];
  const actors: Actor[] = squadIds.map((id, i) => ({
    id, kind: 'agent', x: start.x + formation[i % 4][0], y: start.y + formation[i % 4][1], tx: start.x + formation[i % 4][0], ty: start.y + formation[i % 4][1],
    down: false, gone: false, flash: 0, alpha: 1,
  }));
  if (contract.type === 'assassination' && objectiveIndex >= 0) {
    const w = waypoints[objectiveIndex];
    actors.push({ id: 'target', kind: 'target', x: w.x + 1.2, y: w.y - 1, tx: w.x + 1.2, ty: w.y - 1, down: false, gone: false, flash: 0, alpha: 1 });
  }
  let enemySeq = 0;
  const effects: Effect[] = [];
  let alarm = false;
  let sneaking = false;
  let ended = false;
  let phaseKind: PhaseKind | null = null;
  let phaseIndex = -1;
  let currentWaypoint = start;

  const agent = (id?: string) => actors.find((a) => a.kind === 'agent' && a.id === id);
  const living = (kind: ActorKind) => actors.filter((a) => a.kind === kind && !a.down && !a.gone);

  function spawn(kind: ActorKind, n: number, radius: number) {
    for (let i = 0; i < n; i++) {
      const angle = (i / Math.max(1, n)) * Math.PI * 2 + rng.next();
      const x = currentWaypoint.x + Math.cos(angle) * (radius + 1);
      const y = currentWaypoint.y + Math.sin(angle) * (radius + 1);
      actors.push({
        id: `${kind}${enemySeq++}`, kind, x, y, tx: currentWaypoint.x + Math.cos(angle) * radius, ty: currentWaypoint.y + Math.sin(angle) * radius,
        down: false, gone: false, flash: 0, alpha: 1,
      });
    }
  }

  function nearest(from: Actor, kind: ActorKind) {
    return living(kind).sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
  }

  function apply(ev: ReplayEvent, now: number) {
    switch (ev.kind) {
      case 'phase': {
        currentWaypoint = waypoints[ev.index] ?? currentWaypoint;
        phaseKind = ev.phase;
        phaseIndex = ev.index;
        sneaking = false;
        actors.filter((a) => a.kind === 'patrol').forEach((a) => (a.gone = true));
        let slot = 0;
        for (const a of actors.filter((x) => x.kind === 'agent' && !x.gone)) {
          const [fx, fy] = formation[slot++ % 4];
          a.tx = currentWaypoint.x + fx;
          a.ty = currentWaypoint.y + fy;
        }
        // A captive comes along with the team.
        actors.filter((a) => a.kind === 'rival' && a.down).forEach((a) => ((a.tx = currentWaypoint.x - 0.6), (a.ty = currentWaypoint.y + 0.8)));
        if (ev.phase === 'stealth' && !alarm) spawn('patrol', 2, 2.2);
        break;
      }
      case 'engage':
        actors.filter((a) => a.kind === 'patrol').forEach((a) => (a.gone = true));
        spawn('enemy', Math.min(9, ev.count), 2);
        break;
      case 'takedown': {
        const by = agent(ev.agent);
        if (!by) break;
        for (let i = 0; i < ev.count; i++) {
          const e = nearest(by, 'enemy');
          if (!e) break;
          effects.push({ kind: 'tracer', x: by.x, y: by.y, x2: e.x, y2: e.y, color: ev.lethal ? C.gold : C.cyan, born: now + i * 120, life: 260 });
          if (ev.lethal) {
            e.gone = true;
            effects.push({ kind: 'x', x: e.x, y: e.y, color: C.red, born: now + i * 120, life: 900 });
          } else {
            e.down = true;
            effects.push({ kind: 'z', x: e.x, y: e.y, color: C.cyan, born: now + i * 120, life: 1100 });
          }
        }
        // The last guard falls: in an assassination, so does the target.
        const target = actors.find((a) => a.kind === 'target' && !a.down && !a.gone);
        if (target && phaseIndex === objectiveIndex && !living('enemy').length) {
          effects.push({ kind: 'tracer', x: by.x, y: by.y, x2: target.x, y2: target.y, color: ev.lethal ? C.gold : C.cyan, born: now + 300, life: 260 });
          if (ev.lethal) {
            target.gone = true;
            effects.push({ kind: 'x', x: target.x, y: target.y, color: C.red, born: now + 300, life: 1200 });
          } else {
            target.down = true;
            effects.push({ kind: 'z', x: target.x, y: target.y, color: C.cyan, born: now + 300, life: 1400 });
          }
        }
        break;
      }
      case 'hit': {
        const t = agent(ev.agent);
        if (!t) break;
        t.flash = now;
        const from = nearest(t, 'enemy') ?? nearest(t, 'rival');
        if (from) effects.push({ kind: 'tracer', x: from.x, y: from.y, x2: t.x, y2: t.y, color: C.red, born: now, life: 260 });
        break;
      }
      case 'down': {
        const t = agent(ev.agent);
        if (t) t.down = true;
        break;
      }
      case 'stunned':
      case 'power': {
        const t = agent(ev.agent);
        if (t) effects.push({ kind: 'ring', x: t.x, y: t.y, color: ev.kind === 'stunned' ? C.cyan : C.gold, born: now, life: 900 });
        break;
      }
      case 'sneak':
        sneaking = true;
        break;
      case 'alarm': {
        alarm = true;
        const t = agent(ev.agent);
        if (t) effects.push({ kind: 'ring', x: t.x, y: t.y, color: C.red, born: now, life: 1000 });
        break;
      }
      case 'hack': {
        const t = agent(ev.agent);
        if (t && terminal) effects.push({ kind: 'beam', x: t.x, y: t.y, x2: terminal.x, y2: terminal.y, color: ev.ok ? C.cyan : C.red, born: now, life: 800 });
        terminalState = ev.ok ? 'ok' : 'fail';
        break;
      }
      case 'rival': {
        const r = actors.find((a) => a.kind === 'rival');
        if (ev.event === 'appears') {
          actors.push({
            id: 'rival', kind: 'rival', x: currentWaypoint.x + 2.6, y: currentWaypoint.y - 1.8, tx: currentWaypoint.x + 1.5, ty: currentWaypoint.y - 1,
            down: false, gone: false, flash: 0, alpha: 1,
          });
        } else if (r && ev.event === 'hit') {
          const by = agent(ev.agent);
          r.flash = now;
          if (by) effects.push({ kind: 'tracer', x: by.x, y: by.y, x2: r.x, y2: r.y, color: C.gold, born: now, life: 260 });
        } else if (r && ev.event === 'captured') {
          r.down = true;
          effects.push({ kind: 'z', x: r.x, y: r.y, color: C.cyan, born: now, life: 1200 });
        } else if (r && ev.event === 'killed') {
          r.gone = true;
          effects.push({ kind: 'x', x: r.x, y: r.y, color: C.red, born: now, life: 900 });
        } else if (r && (ev.event === 'escaped' || ev.event === 'avoided')) {
          r.tx = r.x + 6;
          r.ty = r.y - 6;
        }
        break;
      }
      case 'exfil':
        if (ev.ok) van.leaving = now + 900;
        break;
      case 'aftermath':
        ended = true;
        break;
    }
  }

  // --- Timeline ---
  let step = -1;
  let stepStart = 0;
  let clock = 0;
  let speed = 1;
  let playing = false;
  let last = performance.now();
  let raf = 0;

  const durationOf = (line: LogLine) => (line.ev?.kind === 'phase' ? 1500 : line.tone === 'header' ? 900 : 950) / speed;

  function advance() {
    step++;
    stepStart = clock;
    if (step >= log.length) {
      playing = false;
      return;
    }
    const ev = log[step].ev;
    if (ev) apply(ev, clock);
    onStep(step);
  }

  function reset() {
    // Rebuild from scratch: simplest way to rewind deterministically.
    actors.splice(squadIds.length + (contract.type === 'assassination' && objectiveIndex >= 0 ? 1 : 0));
    actors.forEach((a, i) => {
      const [fx, fy] = formation[i % 4];
      if (a.kind === 'agent') Object.assign(a, { x: start.x + fx, y: start.y + fy, tx: start.x + fx, ty: start.y + fy });
      Object.assign(a, { down: false, gone: false, flash: 0, alpha: 1 });
    });
    effects.length = 0;
    alarm = sneaking = ended = false;
    phaseKind = null;
    phaseIndex = -1;
    terminalState = 'idle';
    van.leaving = -1;
    currentWaypoint = start;
    step = -1;
    clock = 0;
  }

  function jumpTo(target: number) {
    reset();
    while (step < Math.min(target, log.length - 1)) {
      advance();
      clock += 2000;
    }
    for (const a of actors) {
      a.x = a.tx;
      a.y = a.ty;
    }
    effects.length = 0;
    stepStart = clock;
  }

  // --- Drawing ---
  /** True when a standing figure is hidden behind this building on screen. */
  function hidesSomeone(b: Building) {
    const a0 = iso(b.gx, b.gy), a1 = iso(b.gx + 1, b.gy), a2 = iso(b.gx + 1, b.gy + 1), a3 = iso(b.gx, b.gy + 1);
    const left = a3.sx, right = a1.sx, bottom = a2.sy, topY = a0.sy - b.h;
    return actors.some((a) => {
      if (a.gone || a.x + a.y >= b.gx + b.gy + 1.5) return false;
      const q = iso(a.x, a.y);
      return q.sx > left - 6 && q.sx < right + 6 && q.sy - 26 < bottom && q.sy > topY;
    });
  }

  function box(gx: number, gy: number, h: number, lit: number[], alarmNow: boolean, pulse: number) {
    const p = iso(gx, gy);
    const top = [iso(gx, gy), iso(gx + 1, gy), iso(gx + 1, gy + 1), iso(gx, gy + 1)].map((q) => ({ x: q.sx, y: q.sy - h }));
    const b = [iso(gx + 1, gy), iso(gx + 1, gy + 1), iso(gx, gy + 1)].map((q) => ({ x: q.sx, y: q.sy }));
    ctx.fillStyle = C.left;
    ctx.beginPath();
    ctx.moveTo(top[3].x, top[3].y);
    ctx.lineTo(top[2].x, top[2].y);
    ctx.lineTo(b[1].x, b[1].y);
    ctx.lineTo(b[2].x, b[2].y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.right;
    ctx.beginPath();
    ctx.moveTo(top[2].x, top[2].y);
    ctx.lineTo(top[1].x, top[1].y);
    ctx.lineTo(b[0].x, b[0].y);
    ctx.lineTo(b[1].x, b[1].y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.top;
    ctx.strokeStyle = C.edge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    top.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Windows on the left face.
    ctx.fillStyle = alarmNow ? `rgba(226,87,76,${0.45 + 0.4 * pulse})` : 'rgba(233,162,59,0.7)';
    lit.forEach((on, i) => {
      if (!on) return;
      const row = Math.floor(i / 2);
      const col = i % 2;
      const wy = p.sy + 2 * TH - h + 10 + row * 14;
      if (wy > p.sy + 2 * TH - 6) return;
      const wx = p.sx - TW + 6 + col * 10;
      ctx.fillRect(wx, wy - col * 5 + row * 0, 4, 3);
    });
  }

  function figure(a: Actor, now: number) {
    const { sx, sy } = iso(a.x, a.y);
    const color = a.kind === 'agent' ? C.gold : a.kind === 'enemy' ? C.enemy : a.kind === 'rival' ? C.rival : a.kind === 'target' ? C.text : C.patrol;
    const flashing = a.flash && now - a.flash < 350;
    ctx.globalAlpha = a.kind === 'agent' && sneaking ? 0.55 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (a.down) {
      ctx.fillStyle = a.kind === 'agent' ? '#8a6a35' : '#6b625a';
      ctx.fillRect(sx - 11, sy - 4, 20, 7);
      ctx.beginPath();
      ctx.arc(sx + 12, sy - 1, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = flashing ? '#ffffff' : color;
      ctx.fillRect(sx - 4, sy - 20, 8, 17);
      ctx.fillRect(sx - 4, sy - 4, 3, 4);
      ctx.fillRect(sx + 1, sy - 4, 3, 4);
      ctx.beginPath();
      ctx.arc(sx, sy - 24, 4.2, 0, Math.PI * 2);
      ctx.fill();
      if (a.kind === 'agent') {
        // A thin halo so the squad reads at a glance.
        ctx.strokeStyle = 'rgba(233,162,59,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(sx, sy, 11, 5.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (a.kind === 'patrol') {
        // Torch cone: white while unaware, red once the alarm is up.
        ctx.fillStyle = alarm ? 'rgba(226,87,76,0.16)' : 'rgba(236,230,218,0.08)';
        ctx.beginPath();
        ctx.moveTo(sx, sy - 10);
        const dir = Math.atan2(currentWaypoint.y - a.y, currentWaypoint.x - a.x) + Math.sin(now / 900 + a.x) * 0.6;
        const tip = iso(a.x + Math.cos(dir - 0.4) * 2.2, a.y + Math.sin(dir - 0.4) * 2.2);
        const tip2 = iso(a.x + Math.cos(dir + 0.4) * 2.2, a.y + Math.sin(dir + 0.4) * 2.2);
        ctx.lineTo(tip.sx, tip.sy);
        ctx.lineTo(tip2.sx, tip2.sy);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawEffects(now: number) {
    for (const e of effects) {
      const age = now - e.born;
      if (age < 0 || age > e.life) continue;
      const k = 1 - age / e.life;
      const p = iso(e.x, e.y);
      ctx.globalAlpha = k;
      ctx.strokeStyle = e.color;
      ctx.fillStyle = e.color;
      if (e.kind === 'tracer' || e.kind === 'beam') {
        const q = iso(e.x2!, e.y2!);
        ctx.lineWidth = e.kind === 'beam' ? 2 : 1.5;
        ctx.setLineDash(e.kind === 'beam' ? [4, 4] : []);
        ctx.beginPath();
        ctx.moveTo(p.sx, p.sy - 12);
        ctx.lineTo(q.sx, q.sy - 12);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (e.kind === 'ring') {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(p.sx, p.sy, 8 + (1 - k) * 16, 4 + (1 - k) * 8, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.kind === 'x') {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.sx - 5, p.sy - 20);
        ctx.lineTo(p.sx + 5, p.sy - 10);
        ctx.moveTo(p.sx + 5, p.sy - 20);
        ctx.lineTo(p.sx - 5, p.sy - 10);
        ctx.stroke();
      } else if (e.kind === 'z') {
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillText('z', p.sx + 6, p.sy - 14 - (1 - k) * 14);
        ctx.fillText('z', p.sx + 12, p.sy - 22 - (1 - k) * 14);
      }
      ctx.globalAlpha = 1;
    }
  }

  function draw(now: number) {
    const pulse = (Math.sin(now / 180) + 1) / 2;
    ctx.fillStyle = '#080706';
    ctx.fillRect(0, 0, W, H);

    // Ground grid.
    for (let gx = 0; gx < GRID; gx++) {
      for (let gy = 0; gy < GRID; gy++) {
        const a = iso(gx, gy), b = iso(gx + 1, gy), c = iso(gx + 1, gy + 1), d = iso(gx, gy + 1);
        ctx.fillStyle = C.ground;
        ctx.strokeStyle = C.grid;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.lineTo(c.sx, c.sy);
        ctx.lineTo(d.sx, d.sy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // Street lamps: warm pools of light along the route.
    for (const w of route) {
      const q = iso(w.x, w.y);
      const glow = ctx.createRadialGradient(q.sx, q.sy, 2, q.sx, q.sy, 70);
      glow.addColorStop(0, alarm ? 'rgba(226,87,76,0.20)' : 'rgba(233,162,59,0.20)');
      glow.addColorStop(1, 'rgba(233,162,59,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(q.sx, q.sy, 70, 35, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Route: dashed line from insertion to extraction, objective ringed.
    ctx.strokeStyle = 'rgba(233,162,59,0.35)';
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    route.forEach((p, i) => {
      const q = iso(p.x, p.y);
      if (i) ctx.lineTo(q.sx, q.sy);
      else ctx.moveTo(q.sx, q.sy);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    waypoints.forEach((w, i) => {
      const q = iso(w.x, w.y);
      ctx.strokeStyle = i === objectiveIndex ? C.gold : 'rgba(233,162,59,0.3)';
      ctx.beginPath();
      ctx.ellipse(q.sx, q.sy, 14, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Depth-sorted scene: buildings, terminal, van and actors.
    type Drawable = { depth: number; draw: () => void };
    const scene: Drawable[] = buildings.map((b) => ({
      depth: b.gx + b.gy + 1,
      draw: () => {
        ctx.globalAlpha = hidesSomeone(b) ? 0.28 : 1;
        box(b.gx, b.gy, b.h, b.lit, alarm, pulse);
        ctx.globalAlpha = 1;
      },
    }));
    if (terminal) {
      scene.push({
        depth: terminal.x + terminal.y,
        draw: () => {
          const q = iso(terminal.x, terminal.y);
          ctx.fillStyle = '#1c1914';
          ctx.fillRect(q.sx - 5, q.sy - 16, 10, 16);
          ctx.fillStyle = terminalState === 'ok' ? '#7cc68a' : terminalState === 'fail' ? C.red : C.cyan;
          ctx.fillRect(q.sx - 3, q.sy - 14, 6, 5);
        },
      });
    }
    const vanOffset = van.leaving > 0 && clock > van.leaving ? Math.min(6, (clock - van.leaving) / 300) : 0;
    scene.push({
      depth: van.x + van.y,
      draw: () => {
        const q = iso(van.x + vanOffset, van.y - vanOffset);
        ctx.fillStyle = '#2a2418';
        ctx.fillRect(q.sx - 14, q.sy - 14, 28, 12);
        ctx.fillStyle = C.gold;
        ctx.fillRect(q.sx + 8, q.sy - 12, 4, 3);
      },
    });
    for (const a of actors) {
      if (a.gone) continue;
      if (a.kind === 'agent' && vanOffset > 0 && !a.down) continue;
      scene.push({ depth: a.x + a.y + 0.01, draw: () => figure(a, clock) });
    }
    scene.sort((p, q) => p.depth - q.depth).forEach((d) => d.draw());
    drawEffects(clock);

    // Footage treatment: alarm wash, scanlines, timestamp.
    if (alarm) {
      ctx.fillStyle = `rgba(226,87,76,${0.05 + 0.05 * pulse})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = C.muted;
    ctx.fillText('AFTER-ACTION RECONSTRUCTION', 16, 24);
    ctx.fillStyle = playing && Math.floor(now / 500) % 2 ? C.red : '#5a2420';
    ctx.beginPath();
    ctx.arc(16 + 214, 20, 4, 0, Math.PI * 2);
    ctx.fill();
    const secs = Math.floor(clock / 1000);
    ctx.fillStyle = C.muted;
    ctx.fillText(`T+${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`, W - 86, 24);
    if (phaseKind) {
      ctx.fillStyle = alarm ? C.red : C.gold;
      ctx.fillText(alarm ? 'ALARM' : phaseKind.toUpperCase(), 16, H - 16);
    }
    if (ended) {
      ctx.fillStyle = 'rgba(8,7,6,0.55)';
      ctx.fillRect(0, H / 2 - 22, W, 44);
      ctx.fillStyle = C.text;
      ctx.font = '700 18px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('END OF RECONSTRUCTION', W / 2, H / 2 + 6);
      ctx.textAlign = 'left';
    }
  }

  function frame(now: number) {
    const dt = Math.min(64, now - last);
    last = now;
    if (playing) {
      clock += dt;
      if (step < log.length && clock - stepStart >= durationOf(log[Math.max(0, step)])) advance();
    }
    const ease = Math.min(1, (dt / 1000) * 2.6 * speed);
    for (const a of actors) {
      a.x += (a.tx - a.x) * ease;
      a.y += (a.ty - a.y) * ease;
    }
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  if (startAt > 0) jumpTo(startAt);
  raf = requestAnimationFrame(frame);

  return {
    play() {
      if (step >= log.length - 1) jumpTo(-1);
      playing = true;
      if (step < 0) advance();
    },
    pause() {
      playing = false;
    },
    toggle() {
      if (playing) this.pause();
      else this.play();
      return playing;
    },
    restart() {
      jumpTo(-1);
      playing = true;
      advance();
    },
    toEnd() {
      playing = false;
      jumpTo(log.length - 1);
      onStep(log.length - 1);
    },
    setSpeed(s: number) {
      speed = s;
    },
    destroy() {
      cancelAnimationFrame(raf);
    },
    get playing() {
      return playing;
    },
  };
}
