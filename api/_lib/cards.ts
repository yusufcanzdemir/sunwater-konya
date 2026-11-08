// Picture cards for the Telegram bot: the daily plan and the season comparison.
// Text is turned into shapes with a bundled font (satori), so the server needs no system fonts;
// sharp then makes a PNG. Any failure returns null and the bot falls back to plain text.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Node = { type: string; props: Record<string, unknown> & { style?: Record<string, unknown>; children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): Node => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children.length ? children : undefined },
});

const C = {
  bg: '#f7f6f2',
  card: '#ffffff',
  ink: '#1c1917',
  muted: '#78716c',
  line: '#e7e5e4',
  green: '#064e3b',
  blue: '#0284c7',
  blueSoft: '#e0f2fe',
  amber: '#b45309',
  amberSoft: '#fef3c7',
  red: '#be123c',
  grey: '#a8a29e',
  okGreen: '#10b981',
};

/** Next to this file; on Vercel also under the project root (vercel.json "includeFiles"). */
function readFont(name: string): Buffer {
  try {
    return readFileSync(new URL(`./fonts/${name}`, import.meta.url));
  } catch {
    return readFileSync(join(process.cwd(), 'api', '_lib', 'fonts', name));
  }
}

let fonts: { name: string; data: Buffer; weight: 400 | 700; style: 'normal' }[] | null = null;
function loadFonts() {
  fonts ??= ([
    ['Regular', 400],
    ['Bold', 700],
  ] as const).map(([file, weight]) => ({
    name: 'Noto Sans',
    data: readFont(`NotoSans-${file}.ttf`),
    weight,
    style: 'normal' as const,
  }));
  return fonts;
}

async function render(node: Node, width: number, height: number): Promise<Blob | null> {
  try {
    const { default: satori } = await import('satori');
    const svg = await satori(node as never, { width, height, fonts: loadFonts() });
    const { default: sharp } = await import('sharp');
    const png = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
    return new Blob([new Uint8Array(png)], { type: 'image/png' });
  } catch {
    return null;
  }
}

const img = (jpg: Buffer, size: number, radius: number): Node => ({
  type: 'img',
  props: { src: `data:image/jpeg;base64,${jpg.toString('base64')}`, width: size, height: size, style: { borderRadius: radius } },
});

// --- Daily plan ----------------------------------------------------------------------------

export interface PlanCardDay {
  /** "Pzt" */
  label: string;
  /** Pumping hours that day, 0 for none. */
  hours: number;
  rain: boolean;
  today: boolean;
}

export interface PlanCardData {
  /** "F03053 · Şeker pancarı · 34 dekar" */
  title: string;
  /** "Bugün" / "Yarın" / "Çarşamba", or "Bu hafta" when there is no pumping. */
  when: string;
  /** "22:00–03:00" or "Sulama yok". */
  headline: string;
  /** "5 saat pompa" or a short reason. */
  detail: string;
  /** Rain / heat note shown as a coloured strip. */
  warning: { kind: 'rain' | 'heat'; text: string } | null;
  days: PlanCardDay[];
  /** Field photo with the outline drawn (JPEG). */
  photo: Buffer | null;
  /** Word under a rainy day (the bot speaks Turkish; the product page also shows an English card). */
  rainWord?: string;
  /** Hour unit in the day boxes ("sa"). */
  hourUnit?: string;
}

const fmtHours = (n: number, unit = 'sa') => `${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${unit}`;

export function planCard(d: PlanCardData): Promise<Blob | null> {
  const W = 800;
  const H = 470;
  const top = h(
    'div',
    { gap: 28, alignItems: 'center' },
    d.photo ? img(d.photo, 210, 24) : h('div', { width: 0, height: 210 }),
    h(
      'div',
      { flexDirection: 'column', flex: 1 },
      h('div', { fontSize: 20, color: C.muted }, d.title),
      h('div', { fontSize: 30, color: C.ink, marginTop: 18, fontWeight: 700 }, d.when),
      h('div', { fontSize: 56, color: d.headline === 'Sulama yok' ? C.green : C.blue, fontWeight: 700, lineHeight: 1.1 }, d.headline),
      h('div', { fontSize: 24, color: C.ink, marginTop: 6 }, d.detail),
      d.warning
        ? h(
            'div',
            {
              marginTop: 14,
              padding: '8px 14px',
              borderRadius: 14,
              fontSize: 20,
              fontWeight: 700,
              alignSelf: 'flex-start',
              background: d.warning.kind === 'rain' ? C.blueSoft : C.amberSoft,
              color: d.warning.kind === 'rain' ? '#075985' : C.amber,
            },
            d.warning.text,
          )
        : h('div', {}),
    ),
  );

  const week = h(
    'div',
    { gap: 10, marginTop: 26 },
    ...d.days.map((day) =>
      h(
        'div',
        {
          flex: 1,
          height: 112,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 18,
          background: day.hours > 0 ? C.blue : C.card,
          color: day.hours > 0 ? '#ffffff' : C.grey,
          border: day.today ? `4px solid ${C.ink}` : `2px solid ${day.hours > 0 ? C.blue : C.line}`,
        },
        h('div', { fontSize: 20, fontWeight: 700, color: day.hours > 0 ? '#ffffff' : C.muted }, day.label),
        h('div', { fontSize: 24, fontWeight: 700, marginTop: 6 }, day.hours > 0 ? fmtHours(day.hours, d.hourUnit) : '–'),
        h('div', { fontSize: 15, marginTop: 4, color: day.hours > 0 ? '#e0f2fe' : '#0369a1' }, day.rain ? (d.rainWord ?? 'yağmur') : ' '),
      ),
    ),
  );

  return render(h('div', { width: '100%', height: '100%', padding: 32, flexDirection: 'column', background: C.bg, fontFamily: 'Noto Sans' }, h('div', { width: W - 64, flexDirection: 'column' }, top, week)), W, H);
}

// --- Season comparison ---------------------------------------------------------------------

export interface UsageCardData {
  /** "F03053 · Şeker pancarı · 2025 sezonu" */
  title: string;
  /** "Benzer tarlalardan %15 fazla" */
  verdict: string;
  verdictTone: 'over' | 'ok';
  bars: { label: string; m3: number; tone: 'me' | 'peer' | 'ref' }[];
  photo: Buffer | null;
  /** Line above the big number. */
  subtitle?: string;
}

export function usageCard(d: UsageCardData): Promise<Blob | null> {
  const W = 800;
  const H = 430;
  const max = Math.max(...d.bars.map((b) => b.m3), 1);
  const color = { me: C.blue, peer: C.grey, ref: C.okGreen };
  const fmt = (n: number) => `${Math.round(n).toLocaleString('tr-TR')} m³`;

  const left = d.photo ? img(d.photo, 170, 22) : null;

  const head = h(
    'div',
    { gap: 24, alignItems: 'center' },
    ...(left ? [left] : []),
    h(
      'div',
      { flexDirection: 'column', flex: 1 },
      h('div', { fontSize: 20, color: C.muted }, d.title),
      h('div', { fontSize: 22, color: C.ink, marginTop: 10 }, d.subtitle ?? 'Bu sezon çektiğin yeraltı suyu'),
      h('div', { fontSize: 52, fontWeight: 700, color: C.ink, lineHeight: 1.1 }, fmt(d.bars[0]?.m3 ?? 0)),
      h('div', { fontSize: 24, fontWeight: 700, marginTop: 4, color: d.verdictTone === 'over' ? C.red : C.green }, d.verdict),
    ),
  );

  const bars = h(
    'div',
    { flexDirection: 'column', gap: 14, marginTop: 26 },
    ...d.bars.map((b) =>
      h(
        'div',
        { flexDirection: 'column' },
        h(
          'div',
          { justifyContent: 'space-between', fontSize: 19, color: b.tone === 'me' ? C.ink : C.muted, fontWeight: b.tone === 'me' ? 700 : 400 },
          h('div', {}, b.label),
          h('div', {}, fmt(b.m3)),
        ),
        h(
          'div',
          { height: 16, borderRadius: 8, background: C.line, marginTop: 6 },
          h('div', { width: `${Math.max(2, (b.m3 / max) * 100)}%`, height: 16, borderRadius: 8, background: color[b.tone] }),
        ),
      ),
    ),
  );

  return render(h('div', { width: '100%', height: '100%', padding: 32, flexDirection: 'column', background: C.bg, fontFamily: 'Noto Sans' }, h('div', { width: W - 64, flexDirection: 'column' }, head, bars)), W, H);
}
