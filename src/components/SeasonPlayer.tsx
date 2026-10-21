import { AnimatePresence, motion } from 'framer-motion';
import { CloudRain, Droplet, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dayName } from '../ai/explain';
import type { SeasonAnalysis } from '../engine/plan';
import { seasonFrames, type SeasonFrame } from '../engine/visuals';
import { fmt } from './ui';

const STEP_MS = 110;
const WATER = '#1d77f2';
const SOIL = '#8c6f4d';
const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** Root-zone store: fill = 1 − Dr/TAW, dashed line at the irrigation threshold. */
function SoilTank({ frame, rawFill }: { frame: SeasonFrame; rawFill: number }) {
  const W = 150;
  const H = 210;
  const top = 34;
  const inner = H - top - 8;
  const level = top + inner * (1 - frame.fill);
  const rawY = top + inner * (1 - rawFill);

  return (
    <figure className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-40" role="img" aria-label={`Toprak su deposu %${fmt(frame.fill * 100)} dolu`}>
        <defs>
          <linearGradient id="soilWater" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#4797fb" />
            <stop offset="1" stopColor={WATER} />
          </linearGradient>
          <clipPath id="tankClip">
            <rect x={20} y={top} width={W - 40} height={inner} rx={14} />
          </clipPath>
        </defs>
        {/* soil body */}
        <rect x={20} y={top} width={W - 40} height={inner} rx={14} fill="#d2bea2" />
        <g clipPath="url(#tankClip)">
          <motion.rect
            x={20}
            width={W - 40}
            fill="url(#soilWater)"
            initial={false}
            animate={{ y: level, height: top + inner - level }}
            transition={{ duration: 0.12, ease: 'linear' }}
          />
        </g>
        <rect x={20} y={top} width={W - 40} height={inner} rx={14} fill="none" stroke="#5a432c" strokeWidth={3} />
        {/* irrigation threshold */}
        <line x1={14} x2={W - 14} y1={rawY} y2={rawY} stroke="#dc2626" strokeWidth={2} strokeDasharray="6 4" />
        <text x={26} y={rawY - 6} fontSize={11} fontWeight={600} fill="#dc2626" stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
          sulama eşiği
        </text>
        {/* events */}
        <AnimatePresence>
          {frame.rain && (
            <motion.g key={`rain-${frame.date}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <foreignObject x={W / 2 - 16} y={0} width={32} height={32}>
                <CloudRain size={30} color="#4797fb" />
              </foreignObject>
            </motion.g>
          )}
          {frame.irrigated && (
            <motion.g
              key={`drop-${frame.date}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: [0, 1, 1, 0], y: [-10, 0, 40, 70] }}
              transition={{ duration: 0.9, ease: 'easeIn' }}
            >
              <foreignObject x={W / 2 - 14} y={2} width={28} height={28}>
                <Droplet size={26} color={WATER} fill={WATER} />
              </foreignObject>
            </motion.g>
          )}
        </AnimatePresence>
      </svg>
      <figcaption className="text-center text-sm text-soil-700">
        <span className="block text-2xl font-bold text-soil-900">%{fmt(frame.fill * 100)}</span>
        toprakta kullanılabilir su
      </figcaption>
    </figure>
  );
}

/** Well cross-section; the blue column is the water pumped so far. */
function WellColumn({ label, valueM3, maxM3, highlight }: { label: string; valueM3: number; maxM3: number; highlight?: boolean }) {
  const W = 120;
  const H = 210;
  const ground = 30;
  const shaftX = W / 2 - 18;
  const shaftW = 36;
  const depth = H - ground - 14;
  const h = maxM3 > 0 ? depth * Math.min(1, valueM3 / maxM3) : 0;

  return (
    <figure className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-40" role="img" aria-label={`${label}: ${fmt(valueM3)} metreküp`}>
        {/* strata */}
        <rect x={0} y={ground} width={W} height={H - ground} fill="#e5d8c5" />
        <rect x={0} y={ground + 50} width={W} height={60} fill="#d2bea2" />
        <rect x={0} y={ground + 110} width={W} height={H} fill="#b0946f" />
        <rect x={0} y={H - 14} width={W} height={14} fill="#7dbaff" opacity={0.6} />
        <line x1={0} x2={W} y1={ground} y2={ground} stroke="#5a432c" strokeWidth={2} />
        {/* pump head */}
        <rect x={W / 2 - 14} y={ground - 16} width={28} height={16} rx={3} fill="#46331f" />
        {/* shaft */}
        <rect x={shaftX} y={ground} width={shaftW} height={depth} fill="#faf6f0" stroke="#46331f" strokeWidth={2} />
        <motion.rect
          x={shaftX + 3}
          width={shaftW - 6}
          fill={highlight ? WATER : '#4797fb'}
          opacity={highlight ? 1 : 0.75}
          initial={false}
          animate={{ y: ground + depth - h, height: h }}
          transition={{ duration: 0.12, ease: 'linear' }}
        />
      </svg>
      <figcaption className="text-center text-sm text-soil-700">
        <span className={`block text-xl font-bold ${highlight ? 'text-water-600' : 'text-soil-900'}`}>{fmt(valueM3)} m³</span>
        {label}
      </figcaption>
    </figure>
  );
}

export function SeasonPlayer({ analysis }: { analysis: SeasonAnalysis }) {
  const { frames, rawFill } = useMemo(() => seasonFrames(analysis), [analysis]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = frames.length - 1;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setIndex((i) => {
        if (i >= last) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, last]);

  // A new analysis (other field / assumptions) restarts at the end of the season.
  useEffect(() => {
    setIndex(last);
    setPlaying(false);
  }, [analysis, last]);

  const chartData = useMemo(
    () =>
      frames.map((f) => ({
        date: f.date,
        model: f.modelM3,
        baseline: f.baselineM3,
        gap: [Math.min(f.modelM3, f.baselineM3), Math.max(f.modelM3, f.baselineM3)],
      })),
    [frames],
  );

  if (frames.length === 0) return null;
  const frame = frames[Math.min(index, last)];
  const maxM3 = Math.max(frames[last].baselineM3, frames[last].modelM3);

  const toggle = () => {
    if (!playing && index >= last) setIndex(0);
    setPlaying((p) => !p);
  };

  return (
    <div className="space-y-4 rounded-xl border border-soil-200 bg-cream p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Durdur' : 'Sezonu oynat'}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-wheat-700 text-white shadow hover:bg-wheat-800"
        >
          {playing ? <Pause size={22} /> : index >= last ? <RotateCcw size={22} /> : <Play size={22} className="ml-0.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-semibold text-soil-900">{dayName(frame.date)}</span>
            <span className="text-sm text-soil-600">
              Gün {index + 1} / {frames.length}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={last}
            value={index}
            aria-label="Sezon günü"
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
            className="w-full accent-wheat-700"
          />
        </div>
      </div>

      <div className="flex min-h-6 flex-wrap gap-3 text-sm">
        {frame.rain && (
          <span className="inline-flex items-center gap-1 rounded-full bg-water-50 px-2.5 py-0.5 text-water-700">
            <CloudRain size={16} /> Yağmur {fmt(frame.precipitationMm, 1)} mm
          </span>
        )}
        {frame.irrigated && (
          <span className="inline-flex items-center gap-1 rounded-full bg-water-100 px-2.5 py-0.5 text-water-700">
            <Droplet size={16} /> Sulama turu başladı: {fmt(frame.netIrrigationMm)} mm
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 items-end justify-items-center gap-2 sm:gap-6">
        <SoilTank frame={frame} rawFill={rawFill} />
        <WellColumn label="Alışkanlıkla" valueM3={frame.baselineM3} maxM3={maxM3} />
        <WellColumn label="Asistanla" valueM3={frame.modelM3} maxM3={maxM3} highlight />
      </div>

      <div>
        <h4 className="mb-1 text-sm font-semibold text-soil-700">Sezon boyunca kuyudan çekilen toplam su (m³)</h4>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5d8c5" />
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} fontSize={12} />
            <YAxis fontSize={12} tickFormatter={(v: number) => fmt(v)} width={70} />
            <Tooltip
              labelFormatter={(l) => shortDate(String(l))}
              formatter={(v, name) => (name === 'Fark' ? null : `${fmt(Number(v))} m³`)}
            />
            <Legend />
            <Area dataKey="gap" name="Fark" fill={WATER} fillOpacity={0.12} stroke="none" legendType="none" isAnimationActive={false} />
            <Line dataKey="baseline" name="Alışkanlıkla" stroke={SOIL} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="model" name="Asistanla" stroke={WATER} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <ReferenceLine x={frame.date} stroke="#46331f" strokeWidth={1.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
