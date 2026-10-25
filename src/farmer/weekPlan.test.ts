import { describe, expect, it } from 'vitest';
import { parseWeatherResponse } from '../data/openMeteo';
import { addDays } from '../engine/dates';
import type { PilotField } from './pilot';
import { buildWeek } from './weekPlan';

const manifest = { season_start_mmdd: '03-01', kcb_max: { maize: 1.15, alfalfa: 1.15 } };

/** 7 past + 16 forecast days of dry, hot weather with a midday sun around `today`. */
function weather(today: string, et0 = 8) {
  const time = Array.from({ length: 23 }, (_, i) => addDays(today, i - 7));
  return parseWeatherResponse(
    {
      daily: { time, et0_fao_evapotranspiration: time.map(() => et0), precipitation_sum: time.map((_, i) => (i === 10 ? 12 : 0)) },
      hourly: {
        time: time.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`)),
        global_tilted_irradiance: time.flatMap(() => Array.from({ length: 24 }, (_, h) => (h >= 9 && h <= 17 ? 900 : 0))),
      },
    },
    'global_tilted_irradiance',
  );
}

// Maize present from day 60 (30 Apr) to day 200 (17 Sep) of the season.
const field = {
  field_id: 'F00001',
  class: 'maize',
  area_ha: 10,
  lat: 37.7,
  lon: 33.55,
  cal_start: 60,
  cal_mid_start: 100,
  cal_mid_end: 160,
  cal_end: 200,
  kcb_peak: 1.1,
} as PilotField;

describe('buildWeek', () => {
  it('plans 7 days from today in the middle of the season', () => {
    const view = buildWeek(field, manifest, weather('2026-07-10'), '2026-07-10');
    expect(view?.kind).toBe('plan');
    if (view?.kind !== 'plan') return;
    expect(view.days.map((d) => d.date)).toEqual(Array.from({ length: 7 }, (_, i) => addDays('2026-07-10', i)));
    expect(view.days[0].label).toBe('Bugün');
    expect(view.days[1].label).toBe('Yarın');
    expect(view.days[3].rainMm).toBeGreaterThan(0);
    // Hot and dry from a full root zone: a round comes up within the week, on sunny hours
    expect(view.next).not.toBeNull();
    expect(view.next!.windows.length).toBeGreaterThan(0);
    expect(view.solarShare).toBeGreaterThan(0);
  });

  it('says off season after the crop calendar ends', () => {
    expect(buildWeek(field, manifest, weather('2026-11-20'), '2026-11-20')).toEqual({ kind: 'off_season' });
  });

  it('gives null for crops the engine cannot plan', () => {
    expect(buildWeek({ ...field, class: 'alfalfa' }, manifest, weather('2026-07-10'), '2026-07-10')).toBeNull();
  });
});
