// Augment art: a technical plate per augment, and an anatomical figure that shows
// whatever an agent has fitted. Everything is hand-placed SVG on a 200×200 plate
// (or the 480×660 figure), drawn in the game's black-and-gold schematic style.
import type { Agent, Slot } from '../sim/types';

const G = '#e9a23b';
const GD = '#7a5a26';
const GL = '#ffc061';
const DK = '#1c1914';
const DK2 = '#241c0e';
const CY = '#5fb3c9';
const RD = '#e2574c';
const TX = '#ece6da';
const MU = '#8a8172';

let uid = 0;

// --- Drawing helpers ---------------------------------------------------------

function gear(cx: number, cy: number, r: number, teeth: number, depth = 4): string {
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r + depth;
    const a2 = a + Math.PI / (teeth * 2);
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`, `${(cx + Math.cos(a2) * rr).toFixed(1)},${(cy + Math.sin(a2) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${DK2}" stroke="${G}" stroke-width="1.2"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.45).toFixed(1)}" fill="${DK}" stroke="${GD}"/><circle cx="${cx}" cy="${cy}" r="2" fill="${G}"/>`;
}

function hex(cx: number, cy: number, s: number): string {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(cx + Math.cos(a) * s).toFixed(1)},${(cy + Math.sin(a) * s).toFixed(1)}`;
  });
  return pts.join(' ');
}

function hexField(x0: number, y0: number, x1: number, y1: number, s: number, style: string): string {
  const out: string[] = [];
  const w = Math.sqrt(3) * s;
  for (let row = 0, y = y0; y < y1 + s; row++, y += s * 1.5) {
    for (let x = x0 + (row % 2 ? w / 2 : 0); x < x1 + w; x += w) out.push(`<polygon points="${hex(x, y, s - 0.8)}" ${style}/>`);
  }
  return out.join('');
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => `${(cx + Math.cos((a * Math.PI) / 180) * r).toFixed(1)} ${(cy + Math.sin((a * Math.PI) / 180) * r).toFixed(1)}`;
  return `M${p(a0)} A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${p(a1)}`;
}

function bolt(x: number, y: number, r = 2.2): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${DK}" stroke="${G}" stroke-width="0.9"/>`;
}

function label(x: number, y: number, text: string, anchor = 'start', color = MU): string {
  return `<text x="${x}" y="${y}" font-family="JetBrains Mono, monospace" font-size="7" letter-spacing="0.6" fill="${color}" text-anchor="${anchor}">${text}</text>`;
}

function callout(x1: number, y1: number, x2: number, y2: number, text: string, anchor = 'start'): string {
  return `<polyline points="${x1},${y1} ${x2},${y2} ${x2 + (anchor === 'start' ? 18 : -18)},${y2}" fill="none" stroke="${GD}" stroke-width="0.7"/><circle cx="${x1}" cy="${y1}" r="1.6" fill="${G}"/>${label(x2 + (anchor === 'start' ? 21 : -21), y2 + 2.5, text, anchor)}`;
}

/** A horizontal forearm and fist, the shared base for arm augments. */
function forearm(stroke = GD, fill = DK): string {
  return `<path d="M22 88 C40 84 110 82 140 86 L142 126 C110 130 40 130 22 124 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
    <path d="M140 84 C156 80 172 84 178 94 L180 118 C176 128 156 132 142 128 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
    <path d="M150 96 H176 M150 106 H178 M150 116 H176" stroke="${stroke}" stroke-width="0.8"/>`;
}

/** A vertical leg, the shared base for leg augments. */
function leg(stroke = GD, fill = DK): string {
  return `<path d="M82 14 H118 L114 92 H86 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
    <path d="M86 108 H114 L110 170 H90 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
    <path d="M88 172 H112 L130 186 H86 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`;
}

// --- Plates --------------------------------------------------------------------

type Art = (id: string) => string;

const ART: Record<string, Art> = {
  'reflex-booster': () => {
    const verts = Array.from({ length: 8 }, (_, i) => {
      const y = 22 + i * 20;
      return `<rect x="86" y="${y}" width="28" height="14" rx="4" fill="${DK}" stroke="${GD}" stroke-width="1.1"/><rect x="92" y="${y + 15}" width="16" height="4" fill="${CY}" opacity="0.5"/>
        <path d="M86 ${y + 7} C62 ${y + 2} 44 ${y + 16} 18 ${y + 8} M114 ${y + 7} C138 ${y + 2} 156 ${y + 16} 182 ${y + 8}" fill="none" stroke="${GD}" stroke-width="0.6"/>`;
    }).join('');
    return `${verts}
      <rect x="76" y="58" width="48" height="36" rx="3" fill="${DK2}" stroke="${G}" stroke-width="1.6"/>
      <path d="M84 66 H116 M84 72 H108 M84 78 H116 M84 84 H100" stroke="${GD}" stroke-width="0.8"/>
      <circle cx="114" cy="86" r="2.4" fill="${GL}"/><circle cx="106" cy="86" r="2.4" fill="${G}"/>
      <polyline points="124,70 142,62 136,74 160,64" fill="none" stroke="${G}" stroke-width="1.4"/>
      <polyline points="76,82 58,90 64,78 40,88" fill="none" stroke="${G}" stroke-width="1.4"/>
      ${callout(124, 60, 126, 36, 'C3 SLEEVE')}`;
  },

  'hack-interface': () => {
    const bits = Array.from({ length: 18 }, (_, i) => `<rect x="${150 + (i % 6) * 7}" y="${150 + Math.floor(i / 6) * 7}" width="5" height="5" fill="${CY}" opacity="${0.25 + ((i * 37) % 10) / 14}"/>`).join('');
    return `<path d="M58 160 C36 128 36 72 66 46 C92 22 140 28 156 58 C166 78 162 98 152 108 L156 128 L142 132 L140 158" fill="${DK}" stroke="${GD}" stroke-width="1.5"/>
      <path d="M70 70 C84 56 108 54 124 64" fill="none" stroke="${GD}" stroke-width="0.7" stroke-dasharray="2 3"/>
      <circle cx="118" cy="84" r="12" fill="${DK2}" stroke="${G}" stroke-width="2"/>
      <circle cx="118" cy="84" r="5" fill="${CY}"/>
      <path d="M118 72 V64 M130 84 H138 M118 96 V102" stroke="${G}" stroke-width="1"/>
      <path d="M128 90 C156 104 166 138 186 146" fill="none" stroke="${G}" stroke-width="5"/>
      <path d="M128 90 C156 104 166 138 186 146" fill="none" stroke="${DK}" stroke-width="2.5"/>
      <path d="M128 90 C156 104 166 138 186 146" fill="none" stroke="${CY}" stroke-width="0.8" stroke-dasharray="3 3"/>
      ${bits}
      ${callout(108, 76, 70, 30, 'TEMPORAL PORT')}`;
  },

  'tactical-coprocessor': () => {
    const pins = Array.from({ length: 9 }, (_, i) => {
      const p = 64 + i * 9;
      return `<rect x="${p}" y="50" width="4" height="10" fill="${GD}"/><rect x="${p}" y="140" width="4" height="10" fill="${GD}"/><rect x="50" y="${p}" width="10" height="4" fill="${GD}"/><rect x="140" y="${p}" width="10" height="4" fill="${GD}"/>`;
    }).join('');
    return `${pins}<rect x="58" y="58" width="84" height="84" rx="5" fill="${DK2}" stroke="${G}" stroke-width="2"/>
      <path d="M66 70 H82 V82 M134 70 H118 V82 M66 130 H82 V118 M134 130 H118 V118 M100 66 V80 M100 134 V120 M66 100 H80 M134 100 H120" fill="none" stroke="${GD}" stroke-width="1"/>
      <rect x="80" y="80" width="40" height="40" fill="${DK}" stroke="${G}" stroke-width="1.2"/>
      <circle cx="100" cy="100" r="9" fill="${CY}" opacity="0.85"/><circle cx="100" cy="100" r="14" fill="none" stroke="${CY}" stroke-width="0.8" stroke-dasharray="2 2"/>
      ${label(100, 175, 'TCP-7 · 14 THREAD', 'middle', G)}
      ${callout(120, 80, 118, 32, 'THREAT CORE')}`;
  },

  'sentinel-overclock': (id) => `
      <clipPath id="brain-${id}"><path d="M100 30 C62 26 38 56 48 90 C54 118 84 128 100 120 C116 128 146 118 152 90 C162 56 138 26 100 30 Z"/></clipPath>
      <path d="M100 30 C62 26 38 56 48 90 C54 118 84 128 100 120 C116 128 146 118 152 90 C162 56 138 26 100 30 Z" fill="${DK}" stroke="${GD}" stroke-width="1.5"/>
      <g clip-path="url(#brain-${id})">${hexField(40, 26, 160, 128, 7, `fill="none" stroke="${RD}" stroke-width="0.7" opacity="0.8"`)}</g>
      <path d="M100 32 V120 M70 50 C80 64 76 80 64 92 M130 50 C120 64 124 80 136 92" fill="none" stroke="${GD}" stroke-width="1"/>
      <path d="${arc(100, 182, 36, 180, 360)}" fill="none" stroke="${GD}" stroke-width="4"/>
      <path d="${arc(100, 182, 36, 305, 360)}" fill="none" stroke="${RD}" stroke-width="4"/>
      <line x1="100" y1="182" x2="126" y2="158" stroke="${TX}" stroke-width="1.5"/><circle cx="100" cy="182" r="3" fill="${TX}"/>
      ${label(100, 196, 'CLOCK 340%', 'middle', RD)}
      ${callout(140, 60, 122, 22, 'NEURAL LACE')}`,

  'empathy-suite': () => {
    const rings = [16, 28, 40].map((r, i) => `<path d="${arc(132, 96, r, -55, 55)}" fill="none" stroke="${CY}" stroke-width="1.2" opacity="${1 - i * 0.28}"/>`).join('');
    const motes = [[160, 60], [172, 82], [166, 118], [178, 132], [154, 140], [184, 100]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="${CY}" opacity="0.7"/>`).join('');
    return `<path d="M62 36 C92 26 122 42 126 68 L134 88 L126 92 L128 106 C126 114 118 116 114 118 L116 136 C106 146 86 150 62 154" fill="${DK}" stroke="${GD}" stroke-width="1.5"/>
      <path d="M62 36 C40 60 38 120 62 154" fill="${DK}" stroke="${GD}" stroke-width="1.5"/>
      <circle cx="100" cy="72" r="6" fill="${DK2}" stroke="${G}" stroke-width="1.4"/><circle cx="100" cy="72" r="2" fill="${CY}"/>
      <path d="M100 72 C88 80 78 92 76 106 M100 72 C92 60 80 54 70 56" fill="none" stroke="${G}" stroke-width="0.8"/>
      ${rings}${motes}
      ${callout(100, 66, 70, 24, 'LIMBIC READER')}
      ${label(100, 184, 'MICRO-EXPRESSION 0.04s', 'middle', CY)}`;
  },

  'thermal-optics': () => {
    const ticks = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return `<line x1="${(100 + Math.cos(a) * 40).toFixed(1)}" y1="${(100 + Math.sin(a) * 40).toFixed(1)}" x2="${(100 + Math.cos(a) * (i % 3 ? 43 : 46)).toFixed(1)}" y2="${(100 + Math.sin(a) * (i % 3 ? 43 : 46)).toFixed(1)}" stroke="${GD}" stroke-width="0.8"/>`;
    }).join('');
    return `<path d="M24 100 C64 54 136 54 176 100 C136 146 64 146 24 100 Z" fill="${DK}" stroke="${GD}" stroke-width="1.5"/>
      <circle cx="100" cy="100" r="34" fill="#2a100c"/><circle cx="100" cy="100" r="27" fill="#6b2416"/><circle cx="100" cy="100" r="19" fill="${RD}"/><circle cx="100" cy="100" r="11" fill="${G}"/><circle cx="100" cy="100" r="4" fill="${GL}"/>
      <circle cx="100" cy="100" r="36" fill="none" stroke="${G}" stroke-width="1.5"/>${ticks}
      <line x1="40" y1="88" x2="160" y2="88" stroke="${G}" stroke-width="0.8" opacity="0.7"/>
      ${label(30, 40, '31.4°C', 'start', RD)}${label(170, 40, 'IR 8–14µm', 'end', G)}
      ${callout(118, 124, 76, 168, 'MICROBOLOMETER')}`;
  },

  'smart-targeting': () => `
      <path d="M24 100 C64 54 136 54 176 100 C136 146 64 146 24 100 Z" fill="${DK}" stroke="${GD}" stroke-width="1.5"/>
      <circle cx="100" cy="100" r="30" fill="${DK2}" stroke="${G}" stroke-width="1.4"/>
      <circle cx="100" cy="100" r="20" fill="none" stroke="${G}" stroke-width="1"/>
      <path d="M100 66 V88 M100 112 V134 M66 100 H88 M112 100 H134" stroke="${G}" stroke-width="1.2"/>
      <circle cx="100" cy="100" r="2.5" fill="${RD}"/>
      <path d="M100 100 Q150 44 192 30" fill="none" stroke="${G}" stroke-width="1" stroke-dasharray="3 3"/>
      ${label(150, 56, '312 M', 'start', G)}${label(150, 66, 'DROP −0.4', 'start', MU)}${label(150, 76, 'WIND 3 L', 'start', MU)}
      ${callout(80, 124, 50, 168, 'BALLISTIC SOLVER')}`,

  'threat-tagger': () => {
    const target = (x: number, y: number, c: string) => `<circle cx="${x}" cy="${y - 10}" r="3" fill="${MU}"/><rect x="${x - 3}" y="${y - 6}" width="6" height="12" fill="${MU}"/>
      <path d="M${x - 9} ${y - 18} h5 M${x - 9} ${y - 18} v5 M${x + 9} ${y - 18} h-5 M${x + 9} ${y - 18} v5 M${x - 9} ${y + 8} h5 M${x - 9} ${y + 8} v-5 M${x + 9} ${y + 8} h-5 M${x + 9} ${y + 8} v-5" stroke="${c}" stroke-width="1"/>
      <polygon points="${x - 4},${y - 26} ${x + 4},${y - 26} ${x},${y - 20}" fill="${c}"/>`;
    return `<path d="M14 100 C40 70 92 70 118 100 C92 130 40 130 14 100 Z" fill="${DK}" stroke="${GD}" stroke-width="1.5"/>
      <circle cx="66" cy="100" r="17" fill="${DK2}" stroke="${CY}" stroke-width="1.4"/><circle cx="66" cy="100" r="6" fill="${CY}"/>
      <path d="M84 96 L150 60 M84 100 L168 104 M84 104 L146 146" stroke="${CY}" stroke-width="0.7" stroke-dasharray="2 3"/>
      ${target(156, 64, RD)}${target(174, 106, CY)}${target(150, 150, RD)}
      ${label(20, 40, '3 CONTACTS · 2 HOSTILE', 'start', G)}`;
  },

  'dermal-plating': (id) => `
      <clipPath id="torso-${id}"><path d="M56 28 L144 28 L154 60 L138 172 L62 172 L46 60 Z"/></clipPath>
      <path d="M56 28 L144 28 L154 60 L138 172 L62 172 L46 60 Z" fill="${DK}" stroke="${GD}" stroke-width="1.5"/>
      <g clip-path="url(#torso-${id})">${hexField(40, 26, 160, 176, 9, `fill="${DK2}" stroke="${G}" stroke-width="0.9"`)}</g>
      <polygon points="${hex(172, 62, 9)}" fill="${DK2}" stroke="${G}" stroke-width="1.2"/><polygon points="${hex(180, 90, 9)}" fill="${DK2}" stroke="${G}" stroke-width="1.2"/>
      <path d="M150 66 L162 64 M154 88 L170 90" stroke="${GD}" stroke-width="0.8" stroke-dasharray="2 2"/>
      ${label(100, 190, 'CERAMIC-ARAMID · 4MM', 'middle', G)}`,

  'energy-converter': () => {
    const cell = (x: number, charge: number) => `<rect x="${x}" y="46" width="32" height="104" rx="7" fill="${DK}" stroke="${GD}" stroke-width="1.4"/>
      <ellipse cx="${x + 16}" cy="46" rx="16" ry="5" fill="${DK2}" stroke="${G}" stroke-width="1.2"/>
      <rect x="${x + 10}" y="36" width="12" height="6" fill="${G}"/>
      ${Array.from({ length: 8 }, (_, i) => `<rect x="${x + 6}" y="${138 - i * 11}" width="20" height="7" fill="${i < charge ? G : DK2}" opacity="${i < charge ? 0.9 : 1}"/>`).join('')}`;
    return `${cell(30, 8)}${cell(84, 6)}${cell(138, 3)}
      <path d="M46 156 V166 H154 V156 M100 156 V166" fill="none" stroke="${G}" stroke-width="2"/>
      <polyline points="100,166 100,178 94,178 106,190 100,184" fill="none" stroke="${GL}" stroke-width="1.4"/>
      ${label(100, 24, 'BIOCELL ARRAY · +60', 'middle', G)}`;
  },

  'cooling-loop': () => {
    const fins = Array.from({ length: 11 }, (_, i) => `<line x1="${60 + i * 8}" y1="62" x2="${60 + i * 8}" y2="138" stroke="${GD}" stroke-width="3"/>`).join('');
    const arrows = [[100, 40, 0], [180, 100, 90], [100, 160, 180], [20, 100, 270]].map(([x, y, r]) => `<polygon points="-4,-3 4,0 -4,3" fill="${CY}" transform="translate(${x} ${y}) rotate(${r})"/>`).join('');
    return `<rect x="54" y="58" width="92" height="84" fill="${DK}" stroke="${G}" stroke-width="1.2"/>${fins}
      <rect x="20" y="40" width="160" height="120" rx="18" fill="none" stroke="${CY}" stroke-width="5"/>
      <rect x="20" y="40" width="160" height="120" rx="18" fill="none" stroke="${DK}" stroke-width="2"/>
      ${arrows}
      ${label(100, 186, 'COOLANT −18°C · SIG −3', 'middle', CY)}`;
  },

  'titan-frame': () => {
    const ribs = Array.from({ length: 6 }, (_, i) => {
      const y = 52 + i * 20;
      return `<path d="M100 ${y} C76 ${y - 6} 56 ${y + 4} 52 ${y + 22} M100 ${y} C124 ${y - 6} 144 ${y + 4} 148 ${y + 22}" fill="none" stroke="${G}" stroke-width="5"/>
        <path d="M100 ${y} C76 ${y - 6} 56 ${y + 4} 52 ${y + 22} M100 ${y} C124 ${y - 6} 144 ${y + 4} 148 ${y + 22}" fill="none" stroke="${DK2}" stroke-width="2"/>${bolt(52, y + 22)}${bolt(148, y + 22)}`;
    }).join('');
    return `<rect x="30" y="30" width="140" height="14" rx="3" fill="${DK2}" stroke="${G}" stroke-width="1.6"/>${bolt(40, 37)}${bolt(160, 37)}${bolt(100, 37)}
      <rect x="94" y="44" width="12" height="138" fill="${DK2}" stroke="${G}" stroke-width="1.4"/>
      ${Array.from({ length: 8 }, (_, i) => `<line x1="94" y1="${54 + i * 16}" x2="106" y2="${54 + i * 16}" stroke="${GD}"/>`).join('')}
      ${ribs}
      ${label(100, 196, 'ARMOUR +13 · LOAD 5', 'middle', G)}`;
  },

  'sedative-mist': () => {
    const mist = Array.from({ length: 34 }, (_, i) => {
      const x = 120 + ((i * 47) % 70);
      const y = 40 + ((i * 29) % 110);
      return `<circle cx="${x}" cy="${y}" r="${1 + (i % 4)}" fill="${CY}" opacity="${0.15 + (i % 5) / 9}"/>`;
    }).join('');
    return `<path d="M30 30 L110 30 L118 60 L104 172 L44 172 L22 60 Z" fill="${DK}" stroke="${GD}" stroke-width="1.5"/>
      <path d="M84 66 L112 58 M84 82 L114 74 M84 98 L114 90" stroke="${G}" stroke-width="3"/>
      <rect x="40" y="96" width="26" height="54" rx="5" fill="${DK2}" stroke="${G}" stroke-width="1.3"/><rect x="47" y="90" width="12" height="7" fill="${G}"/>
      ${label(53, 128, 'SDT', 'middle', CY)}
      ${mist}
      <polygon points="${hex(160, 172, 9)}" fill="none" stroke="${CY}" stroke-width="1"/><circle cx="160" cy="163" r="2" fill="${CY}"/><circle cx="168" cy="176" r="2" fill="${CY}"/><circle cx="152" cy="176" r="2" fill="${CY}"/>`;
  },

  'strength-frame': () => `${forearm()}
      <rect x="38" y="66" width="60" height="12" rx="2" fill="${DK2}" stroke="${G}" stroke-width="1.3"/><rect x="98" y="70" width="40" height="4" fill="${TX}"/>
      <rect x="38" y="134" width="60" height="12" rx="2" fill="${DK2}" stroke="${G}" stroke-width="1.3"/><rect x="98" y="138" width="40" height="4" fill="${TX}"/>
      ${bolt(38, 72, 3)}${bolt(138, 72, 3)}${bolt(38, 140, 3)}${bolt(138, 140, 3)}
      ${gear(24, 106, 15, 10)}
      ${label(100, 176, 'HYDRAULIC 2.4 kN', 'middle', G)}${callout(70, 66, 60, 40, 'LIFT PISTON')}`,

  'recoil-dampers': () => `${forearm()}
      <ellipse cx="140" cy="106" rx="8" ry="30" fill="none" stroke="${G}" stroke-width="1.6"/>
      <ellipse cx="140" cy="106" rx="8" ry="30" fill="none" stroke="${G}" stroke-width="1.2" transform="rotate(60 140 106)"/>
      <ellipse cx="140" cy="106" rx="8" ry="30" fill="none" stroke="${CY}" stroke-width="1.2" transform="rotate(-60 140 106)"/>
      <circle cx="140" cy="106" r="4" fill="${GL}"/>
      <path d="${arc(140, 106, 42, -40, 40)}" fill="none" stroke="${GD}" stroke-width="0.8" stroke-dasharray="3 3"/>
      ${label(100, 176, 'GYRO 18,000 RPM', 'middle', G)}`,

  'nano-blade': () => `${forearm()}
      <path d="M50 104 L150 102" stroke="${GD}" stroke-width="1" stroke-dasharray="4 3"/>
      <polygon points="142,100 196,92 150,114" fill="#d8d0c0" stroke="${G}" stroke-width="1"/>
      <line x1="148" y1="101" x2="192" y2="94" stroke="${TX}" stroke-width="0.6"/>
      <path d="M176 84 l6 -6 M186 88 l8 -4" stroke="${GL}" stroke-width="1"/>
      ${label(100, 176, 'MONO-EDGE · 0.3 nm', 'middle', G)}${callout(90, 103, 70, 40, 'SHEATH')}`,

  'arc-gloves': () => {
    const fingers = [64, 80, 96, 112].map((x, i) => `<rect x="${x}" y="${58 - (i === 1 || i === 2 ? 8 : 0)}" width="13" height="${62 + (i === 1 || i === 2 ? 8 : 0)}" rx="6" fill="${DK}" stroke="${GD}" stroke-width="1.3"/><circle cx="${x + 6.5}" cy="${62 - (i === 1 || i === 2 ? 8 : 0)}" r="3.5" fill="${CY}"/>`).join('');
    return `${fingers}
      <path d="M60 114 L128 114 L132 168 L64 168 Z" fill="${DK}" stroke="${GD}" stroke-width="1.4"/>
      <path d="M62 134 L36 110 L44 102 L72 124 Z" fill="${DK}" stroke="${GD}" stroke-width="1.3"/>
      <circle cx="96" cy="140" r="12" fill="${DK2}" stroke="${CY}" stroke-width="1.4"/><circle cx="96" cy="140" r="4" fill="${CY}"/>
      <polyline points="70,50 78,42 82,48 92,38" fill="none" stroke="${CY}" stroke-width="1.3"/>
      <polyline points="104,42 112,34 116,44 124,36" fill="none" stroke="${CY}" stroke-width="1.3"/>
      <polyline points="40,98 30,90 36,86 24,78" fill="none" stroke="${CY}" stroke-width="1.3"/>
      ${label(100, 188, 'NON-LETHAL · 9 kV', 'middle', CY)}`;
  },

  'prosthetic-arm': () => `${forearm(MU, '#151412')}
      <path d="M60 86 V128 M100 84 V130" stroke="${MU}" stroke-width="0.8" stroke-dasharray="3 2"/>
      ${bolt(60, 106)}${bolt(100, 106)}
      ${label(100, 176, 'MEDICAL GRADE · NO ENHANCEMENT', 'middle', MU)}`,

  'sprint-servos': () => `${leg()}
      ${gear(100, 100, 15, 12)}
      <rect x="118" y="112" width="10" height="42" rx="2" fill="${DK2}" stroke="${G}" stroke-width="1.2"/><rect x="121" y="152" width="4" height="16" fill="${TX}"/>
      ${bolt(123, 112)}${bolt(123, 170)}
      <path d="M40 60 H70 M30 80 H66 M44 100 H72 M34 120 H70" stroke="${GD}" stroke-width="1" stroke-dasharray="6 3"/>
      ${callout(115, 100, 126, 70, 'KNEE SERVO')}
      ${label(150, 190, 'SIG +2', 'middle', RD)}`,

  'silent-stride': () => `
      <path d="M30 120 C40 70 70 50 100 60 L112 112 C140 112 168 118 176 132 L176 146 L30 146 Z" fill="${DK}" stroke="${GD}" stroke-width="1.5"/>
      ${Array.from({ length: 7 }, (_, i) => `<rect x="${34 + i * 20}" y="148" width="16" height="9" rx="4" fill="${CY}" opacity="0.75"/>`).join('')}
      <path d="${arc(100, 178, 18, 200, 340)} ${arc(100, 178, 28, 200, 340)}" fill="none" stroke="${MU}" stroke-width="1"/>
      <line x1="72" y1="190" x2="128" y2="160" stroke="${RD}" stroke-width="2"/>
      ${label(100, 40, 'FOOTFALL −28 dB', 'middle', CY)}`,

  'jump-assist': () => `${leg()}
      <polyline points="116,112 128,118 116,124 128,130 116,136 128,142 116,148 128,154 116,160" fill="none" stroke="${G}" stroke-width="2"/>
      ${bolt(116, 112)}${bolt(116, 160)}
      <path d="M150 140 V60 M140 72 L150 58 L160 72 M168 150 V90 M160 100 L168 88 L176 100" fill="none" stroke="${GD}" stroke-width="1.2"/>
      <line x1="20" y1="190" x2="180" y2="190" stroke="${GD}" stroke-width="1"/>
      ${label(40, 40, 'DROP 6 M · SILENT', 'start', G)}`,

  'prosthetic-leg': () => `${leg(MU, '#151412')}
      <path d="M84 50 H116 M88 140 H112" stroke="${MU}" stroke-width="0.8" stroke-dasharray="3 2"/>
      <circle cx="100" cy="100" r="8" fill="#151412" stroke="${MU}"/>
      ${label(100, 198, 'MEDICAL GRADE · NO ENHANCEMENT', 'middle', MU)}`,

  'glass-shield': () => {
    const facets = [
      '100,40 128,52 112,70', '112,70 128,52 140,80', '100,84 112,70 140,80', '100,84 140,80 132,112', '100,120 132,112 140,150',
      '100,120 140,150 104,160', '104,160 140,150 128,184', '132,112 156,128 140,150', '140,80 160,100 132,112', '104,160 128,184 104,188',
    ].map((p, i) => `<polygon points="${p}" fill="${i % 3 ? CY : G}" fill-opacity="${0.06 + (i % 4) * 0.06}" stroke="${i % 2 ? CY : G}" stroke-width="0.7" stroke-opacity="0.8"/>`).join('');
    return `<circle cx="100" cy="46" r="16" fill="${DK}" stroke="${GD}" stroke-width="1.3"/>
      <path d="M100 64 C78 66 64 74 60 96 L56 150 L72 152 L76 110 L80 188 L100 188 Z" fill="${DK}" stroke="${GD}" stroke-width="1.3"/>
      ${facets}
      <path d="M150 40 L176 60 M156 30 L186 52" stroke="${CY}" stroke-width="0.8" opacity="0.7"/>
      ${label(30, 192, 'REFRACTION 98.6%', 'start', CY)}`;
  },

  'social-camo': () => {
    const face = (dx: number, c: string, o: number) => `<g transform="translate(${dx} 0)" opacity="${o}"><ellipse cx="100" cy="96" rx="42" ry="56" fill="none" stroke="${c}" stroke-width="1.4"/>
      <path d="M82 84 h10 M108 84 h10 M100 92 v18 l-6 4 M86 128 C94 134 106 134 114 128" fill="none" stroke="${c}" stroke-width="1.2"/></g>`;
    const pix = Array.from({ length: 16 }, (_, i) => `<rect x="${92 + (i % 4) * 8}" y="${70 + Math.floor(i / 4) * 8}" width="7" height="7" fill="${CY}" opacity="${((i * 13) % 7) / 14}"/>`).join('');
    return `${face(-8, G, 0.9)}${face(10, CY, 0.7)}${pix}
      ${label(100, 186, 'IDENTITY: UNRESOLVED', 'middle', CY)}`;
  },

  'toxin-filter': () => {
    const lattice = Array.from({ length: 14 }, (_, i) => `<line x1="${10 + i * 14}" y1="96" x2="${24 + i * 14}" y2="112" stroke="${G}" stroke-width="1"/><line x1="${24 + i * 14}" y1="96" x2="${10 + i * 14}" y2="112" stroke="${G}" stroke-width="1"/>`).join('');
    const bad = [[30, 60], [58, 74], [86, 52], [120, 70], [150, 58], [176, 80], [44, 86], [136, 88]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="${RD}"/>`).join('');
    const good = [[40, 140], [90, 150], [150, 136], [120, 160]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="${CY}"/>`).join('');
    return `<rect x="0" y="92" width="200" height="24" fill="${DK2}"/>${lattice}
      <rect x="0" y="116" width="200" height="60" fill="${DK}" stroke="${GD}" stroke-width="0.5"/>
      <rect x="0" y="82" width="200" height="10" fill="#2a2418"/>
      ${bad}${good}
      ${label(10, 30, 'EPIDERMAL MESH', 'start', G)}${label(190, 190, 'FILTRATION 99.2%', 'end', CY)}`;
  },
};

export interface AugmentPlateOptions {
  size?: number;
  name?: string;
}

/** A schematic plate for one augment. */
export function augmentPlate(augId: string, model: string, opts: AugmentPlateOptions = {}): string {
  const id = `p${uid++}`;
  const art = ART[augId]?.(id) ?? '';
  const size = opts.size ?? 200;
  const grid = Array.from({ length: 9 }, (_, i) => `<line x1="${20 + i * 20}" y1="0" x2="${20 + i * 20}" y2="200"/><line x1="0" y1="${20 + i * 20}" x2="200" y2="${20 + i * 20}"/>`).join('');
  return `<svg class="plate" viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="${opts.name ?? augId}">
    <rect width="200" height="200" fill="#0d0c09"/>
    <g stroke="#19160f" stroke-width="1">${grid}</g>
    ${art}
    <path d="M4 16 V4 H16 M184 4 H196 V16 M196 184 V196 H184 M16 196 H4 V184" fill="none" stroke="${G}" stroke-width="1.5"/>
    ${label(196, 12, model, 'end', GD)}
  </svg>`;
}

// --- The body ------------------------------------------------------------------

type LimbStyle = 'natural' | 'aug' | 'prosthetic' | 'missing';

function limb(x1: number, y1: number, x2: number, y2: number, w: number, style: LimbStyle): string {
  if (style === 'missing') {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${MU}" stroke-width="${w}" stroke-linecap="round" stroke-opacity="0.18"/>
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${RD}" stroke-width="1" stroke-dasharray="4 5"/>`;
  }
  const outer = style === 'aug' ? G : style === 'prosthetic' ? MU : '#5a4520';
  const inner = style === 'aug' ? DK2 : style === 'prosthetic' ? '#181715' : DK;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outer}" stroke-width="${w}" stroke-linecap="round"/>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${inner}" stroke-width="${w - (style === 'natural' ? 4 : 6)}" stroke-linecap="round"/>
    ${style === 'aug' ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${G}" stroke-width="1.3"/>` : ''}
    ${style === 'prosthetic' ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${MU}" stroke-width="0.8" stroke-dasharray="6 4"/>` : ''}`;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Side {
  shoulder: [number, number];
  elbow: [number, number];
  wrist: [number, number];
  hip: [number, number];
  knee: [number, number];
  ankle: [number, number];
  out: number;
}

const SIDES: Side[] = [
  { shoulder: [184, 154], elbow: [150, 262], wrist: [136, 372], hip: [220, 366], knee: [212, 490], ankle: [208, 610], out: -1 },
  { shoulder: [296, 154], elbow: [330, 262], wrist: [344, 372], hip: [260, 366], knee: [268, 490], ankle: [272, 610], out: 1 },
];

function armDetail(aug: string | undefined, s: Side): string {
  const [ex, ey] = s.elbow;
  const [wx, wy] = s.wrist;
  const hx = wx + s.out * 2;
  const hy = wy + 22;
  switch (aug) {
    case 'strength-frame': {
      const o = s.out * 15;
      return `<line x1="${ex + o}" y1="${ey + 6}" x2="${lerp(ex, wx, 0.65) + o}" y2="${lerp(ey, wy, 0.65)}" stroke="${G}" stroke-width="6"/>
        <line x1="${lerp(ex, wx, 0.65) + o}" y1="${lerp(ey, wy, 0.65)}" x2="${wx + o * 0.8}" y2="${wy - 6}" stroke="${TX}" stroke-width="2"/>
        ${gear(ex, ey, 9, 9, 3)}`;
    }
    case 'recoil-dampers':
      return `<ellipse cx="${wx}" cy="${wy - 6}" rx="6" ry="17" fill="none" stroke="${G}" stroke-width="1.4"/><ellipse cx="${wx}" cy="${wy - 6}" rx="6" ry="17" fill="none" stroke="${CY}" stroke-width="1.1" transform="rotate(60 ${wx} ${wy - 6})"/><circle cx="${wx}" cy="${wy - 6}" r="3" fill="${GL}"/>`;
    case 'nano-blade':
      return `<polygon points="${wx - 4},${wy - 6} ${wx + s.out * 18},${wy + 52} ${wx + 6},${wy - 2}" fill="#d8d0c0" stroke="${G}" stroke-width="1"/>`;
    case 'arc-gloves':
      return `<circle cx="${hx}" cy="${hy}" r="16" fill="${CY}" opacity="0.18"/><circle cx="${hx}" cy="${hy}" r="5" fill="${CY}"/>
        <polyline points="${hx - 10},${hy + 16} ${hx - 4},${hy + 26} ${hx + 2},${hy + 20} ${hx + 8},${hy + 32}" fill="none" stroke="${CY}" stroke-width="1.4"/>`;
    default:
      return '';
  }
}

function legDetail(aug: string | undefined, s: Side): string {
  const [kx, ky] = s.knee;
  const [ax, ay] = s.ankle;
  switch (aug) {
    case 'sprint-servos':
      return `${gear(kx, ky, 11, 10, 3)}<rect x="${kx - s.out * 2 - (s.out < 0 ? 22 : -14)}" y="${ky + 26}" width="8" height="54" rx="2" fill="${DK2}" stroke="${G}"/>`;
    case 'silent-stride':
      return Array.from({ length: 3 }, (_, i) => `<rect x="${ax - 18 + i * 13}" y="${ay + 24}" width="11" height="6" rx="3" fill="${CY}" opacity="0.8"/>`).join('');
    case 'jump-assist': {
      const x = kx + s.out * 20;
      return `<polyline points="${Array.from({ length: 9 }, (_, i) => `${x + (i % 2 ? 7 : -7) * s.out},${ky + 14 + i * 11}`).join(' ')}" fill="none" stroke="${G}" stroke-width="2"/>`;
    }
    default:
      return '';
  }
}

function limbStyle(aug: string | undefined, missing: boolean, natural: LimbStyle = 'natural'): LimbStyle {
  if (!aug) return missing ? 'missing' : natural;
  if (aug.startsWith('prosthetic')) return 'prosthetic';
  if (aug === 'arc-gloves' || aug === 'silent-stride') return natural;
  return 'aug';
}

export interface FigureOptions {
  highlight?: Slot;
  width?: number;
}

/** The agent as an anatomical plate, every fitted augment drawn on the body. */
export function bodyFigure(agent: Agent, opts: FigureOptions = {}): string {
  const id = `f${uid++}`;
  const a = agent.augments;
  const armStyle = limbStyle(a.arms, agent.missingLimbs.includes('arms'));
  const legStyle = limbStyle(a.legs, agent.missingLimbs.includes('legs'));
  const lowerLeg = a.legs === 'silent-stride' ? 'aug' : legStyle;
  const ring = (slot: Slot, x: number, y: number, r: number) =>
    opts.highlight === slot ? `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${G}" stroke-width="2" stroke-dasharray="5 4"/>` : '';
  const torsoPath = 'M180 142 L300 142 L290 300 L272 334 L208 334 L190 300 Z';

  const legs = SIDES.map((s) => `${limb(s.hip[0], s.hip[1], s.knee[0], s.knee[1], 32, legStyle)}${limb(s.knee[0], s.knee[1], s.ankle[0], s.ankle[1], 26, lowerLeg)}
    ${legStyle === 'missing' ? '' : `<ellipse cx="${s.ankle[0] - 6 * -s.out}" cy="${s.ankle[1] + 18}" rx="22" ry="8" fill="${legStyle === 'aug' ? DK2 : DK}" stroke="${legStyle === 'aug' ? G : '#5a4520'}" stroke-width="2"/>`}
    ${legStyle === 'aug' ? `<circle cx="${s.knee[0]}" cy="${s.knee[1]}" r="7" fill="#0b0a08" stroke="${G}" stroke-width="2"/>` : ''}
    ${legDetail(a.legs, s)}`).join('');

  const arms = SIDES.map((s) => `${limb(s.shoulder[0], s.shoulder[1], s.elbow[0], s.elbow[1], 28, armStyle)}${limb(s.elbow[0], s.elbow[1], s.wrist[0], s.wrist[1], 24, armStyle)}
    ${armStyle === 'missing' ? '' : `<circle cx="${s.wrist[0] + s.out * 2}" cy="${s.wrist[1] + 20}" r="14" fill="${armStyle === 'aug' ? DK2 : DK}" stroke="${armStyle === 'aug' ? G : armStyle === 'prosthetic' ? MU : '#5a4520'}" stroke-width="2"/>`}
    ${armStyle === 'aug' ? `<circle cx="${s.shoulder[0]}" cy="${s.shoulder[1]}" r="9" fill="#0b0a08" stroke="${G}" stroke-width="2"/><circle cx="${s.elbow[0]}" cy="${s.elbow[1]}" r="7" fill="#0b0a08" stroke="${G}" stroke-width="2"/>` : ''}
    ${armDetail(a.arms, s)}`).join('');

  let torso = '';
  switch (a.torso) {
    case 'dermal-plating':
      torso = `<g clip-path="url(#t-${id})">${hexField(176, 140, 304, 336, 11, `fill="${DK2}" stroke="${G}" stroke-width="1"`)}</g>`;
      break;
    case 'titan-frame':
      torso = `<rect x="168" y="140" width="144" height="12" rx="3" fill="${DK2}" stroke="${G}" stroke-width="1.6"/>
        <rect x="235" y="150" width="10" height="180" fill="${DK2}" stroke="${G}"/>
        ${Array.from({ length: 5 }, (_, i) => {
          const y = 180 + i * 28;
          return `<path d="M240 ${y} C214 ${y - 6} 196 ${y + 4} 194 ${y + 20} M240 ${y} C266 ${y - 6} 284 ${y + 4} 286 ${y + 20}" fill="none" stroke="${G}" stroke-width="4"/>`;
        }).join('')}`;
      break;
    case 'energy-converter':
      torso = [204, 232, 260].map((x, i) => `<rect x="${x}" y="200" width="18" height="60" rx="4" fill="${DK2}" stroke="${G}" stroke-width="1.3"/><rect x="${x + 4}" y="${206 + i * 12}" width="10" height="${48 - i * 12}" fill="${G}" opacity="0.8"/>`).join('');
      break;
    case 'cooling-loop':
      torso = `<rect x="198" y="186" width="84" height="110" rx="16" fill="none" stroke="${CY}" stroke-width="4"/><rect x="198" y="186" width="84" height="110" rx="16" fill="none" stroke="${DK}" stroke-width="1.5"/>
        ${Array.from({ length: 6 }, (_, i) => `<line x1="${214 + i * 10}" y1="206" x2="${214 + i * 10}" y2="276" stroke="${GD}" stroke-width="2"/>`).join('')}`;
      break;
    case 'sedative-mist':
      torso = `<path d="M206 214 L236 206 M206 232 L236 224 M244 206 L274 214 M244 224 L274 232" stroke="${G}" stroke-width="3"/>
        ${Array.from({ length: 16 }, (_, i) => `<circle cx="${190 + ((i * 37) % 110)}" cy="${150 + ((i * 23) % 70)}" r="${1 + (i % 3)}" fill="${CY}" opacity="0.4"/>`).join('')}`;
      break;
  }

  let neural = '';
  switch (a.neural) {
    case 'reflex-booster':
      neural = `<line x1="240" y1="118" x2="240" y2="146" stroke="${G}" stroke-width="3"/><polyline points="226,126 236,120 232,132 246,124" fill="none" stroke="${GL}" stroke-width="1.4"/>`;
      break;
    case 'hack-interface':
      neural = `<circle cx="214" cy="80" r="7" fill="${DK2}" stroke="${G}" stroke-width="2"/><circle cx="214" cy="80" r="3" fill="${CY}"/>
        <path d="M208 86 C190 104 186 130 194 150" fill="none" stroke="${G}" stroke-width="3"/><path d="M208 86 C190 104 186 130 194 150" fill="none" stroke="${CY}" stroke-width="0.8" stroke-dasharray="3 3"/>`;
      break;
    case 'tactical-coprocessor':
      neural = `<rect x="256" y="58" width="22" height="22" rx="2" fill="${DK2}" stroke="${G}" stroke-width="1.6"/><circle cx="267" cy="69" r="4" fill="${CY}"/>
        <path d="M256 64 h-4 M256 74 h-4 M278 64 h4 M278 74 h4" stroke="${GD}"/>`;
      break;
    case 'sentinel-overclock':
      neural = `<circle cx="240" cy="82" r="56" fill="none" stroke="${RD}" stroke-width="1.4" stroke-dasharray="2 4"/>
        <clipPath id="h-${id}"><ellipse cx="240" cy="82" rx="30" ry="38"/></clipPath>
        <g clip-path="url(#h-${id})">${hexField(206, 40, 274, 122, 6, `fill="none" stroke="${RD}" stroke-width="0.8" opacity="0.8"`)}</g>`;
      break;
    case 'empathy-suite':
      neural = [18, 30, 42].map((r, i) => `<path d="${arc(260, 86, r, -50, 50)}" fill="none" stroke="${CY}" stroke-width="1.3" opacity="${1 - i * 0.28}"/>`).join('');
      break;
  }

  let optics = '';
  switch (a.optics) {
    case 'thermal-optics':
      optics = `<path d="M224 72 L258 72 L262 86 L220 86 Z" fill="${RD}" fill-opacity="0.75" stroke="${G}" stroke-width="1.3"/>`;
      break;
    case 'smart-targeting':
      optics = `<path d="M224 72 L258 72 L262 86 L220 86 Z" fill="${DK2}" stroke="${G}" stroke-width="1.3"/><circle cx="251" cy="79" r="9" fill="none" stroke="${G}"/><path d="M251 66 v6 M251 86 v6 M238 79 h6 M258 79 h6" stroke="${G}"/><circle cx="251" cy="79" r="2" fill="${RD}"/>`;
      break;
    case 'threat-tagger':
      optics = `<path d="M224 72 L258 72 L262 86 L220 86 Z" fill="${DK2}" stroke="${CY}" stroke-width="1.3"/><polygon points="292,46 304,46 298,56" fill="${CY}"/><path d="M262 76 L292 54" stroke="${CY}" stroke-width="0.8" stroke-dasharray="2 2"/>`;
      break;
  }

  let skin = '';
  switch (a.skin) {
    case 'glass-shield':
      skin = `<g opacity="0.85">${[
        '240,140 300,150 262,200', '180,150 240,140 216,206', '216,206 262,200 240,260', '190,300 216,206 240,260', '240,260 262,200 290,300',
        '208,334 240,260 272,334', '150,262 184,154 168,230', '330,262 296,154 312,230', '212,490 220,366 196,430', '268,490 260,366 284,430',
        '240,44 270,70 240,120', '240,44 210,70 240,120',
      ].map((p, i) => `<polygon points="${p}" fill="${i % 2 ? CY : G}" fill-opacity="${0.08 + (i % 3) * 0.05}" stroke="${CY}" stroke-width="0.8" stroke-opacity="0.7"/>`).join('')}</g>`;
      break;
    case 'social-camo':
      skin = `<ellipse cx="248" cy="82" rx="30" ry="38" fill="none" stroke="${CY}" stroke-width="1.4" opacity="0.7"/>
        ${Array.from({ length: 9 }, (_, i) => `<rect x="${228 + (i % 3) * 9}" y="${90 + Math.floor(i / 3) * 9}" width="8" height="8" fill="${CY}" opacity="${((i * 13) % 7) / 12}"/>`).join('')}`;
      break;
    case 'toxin-filter':
      skin = `<g clip-path="url(#t-${id})">${Array.from({ length: 14 }, (_, i) => `<line x1="${170 + i * 12}" y1="140" x2="${130 + i * 12}" y2="340" stroke="${G}" stroke-width="0.6" opacity="0.5"/>`).join('')}</g>`;
      break;
  }

  const missingLabels = `${armStyle === 'missing' ? `<text x="96" y="300" font-family="JetBrains Mono, monospace" font-size="12" fill="${RD}">ARMS MISSING</text>` : ''}
    ${legStyle === 'missing' ? `<text x="282" y="560" font-family="JetBrains Mono, monospace" font-size="12" fill="${RD}">LEGS MISSING</text>` : ''}`;

  return `<svg class="body-figure" viewBox="0 0 480 660" ${opts.width ? `width="${opts.width}"` : ''} role="img" aria-label="${agent.name}'s body and fitted augments">
    <defs><clipPath id="t-${id}"><path d="${torsoPath}"/></clipPath></defs>
    <circle cx="240" cy="340" r="232" fill="none" stroke="#3a3222" stroke-width="1"/>
    <rect x="40" y="110" width="400" height="460" fill="none" stroke="#2b261d" stroke-width="1"/>
    <circle cx="240" cy="340" r="200" fill="none" stroke="#2b261d" stroke-width="1" stroke-dasharray="2 6"/>
    <line x1="240" y1="20" x2="240" y2="650" stroke="#2b261d" stroke-width="1" stroke-dasharray="4 8"/>
    ${legs}
    <path d="M208 334 L272 334 L282 368 L198 368 Z" fill="${DK}" stroke="#5a4520" stroke-width="2"/>
    <path d="${torsoPath}" fill="${DK}" stroke="${a.torso ? G : '#5a4520'}" stroke-width="2"/>
    ${torso}
    <path d="M240 178 L256 196 L240 214 L224 196 Z" fill="${a.torso === 'energy-converter' ? GL : '#3a3222'}"/>
    ${arms}
    <rect x="228" y="116" width="24" height="28" fill="${DK}" stroke="#5a4520" stroke-width="2"/>
    <ellipse cx="240" cy="82" rx="30" ry="38" fill="${DK}" stroke="${a.neural ? G : '#5a4520'}" stroke-width="2"/>
    ${a.optics ? '' : `<path d="M226 76 h10 M246 76 h10" stroke="#5a4520" stroke-width="2"/>`}
    ${optics}${neural}${skin}
    ${missingLabels}
    ${ring('neural', 240, 82, 64)}${ring('optics', 241, 79, 28)}${ring('torso', 240, 238, 104)}${ring('arms', 330, 262, 40)}${ring('legs', 268, 490, 46)}${ring('skin', 143, 318, 34)}
  </svg>`;
}
