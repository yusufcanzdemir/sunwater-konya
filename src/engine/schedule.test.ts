import { describe, expect, it } from 'vitest';
import type { HourlyPv } from './pv';
import { dailyPumping, formatWindow, pumpingWindows, scheduleIrrigations } from './schedule';

/** Bell-shaped PV day peaking at 13:00 (label), zero at night. */
function pvDay(date: string, peakKw = 40): HourlyPv[] {
  return Array.from({ length: 24 }, (_, h) => ({
    time: `${date}T${String(h).padStart(2, '0')}:00`,
    pvKw: h >= 7 && h <= 19 ? peakKw * Math.max(0, 1 - Math.abs(h - 13) / 7) : 0,
  }));
}

describe('scheduleIrrigations', () => {
  const pv = [...pvDay('2025-07-01'), ...pvDay('2025-07-02'), ...pvDay('2025-07-03'), ...pvDay('2025-07-04')];

  it('places pump hours on the highest PV hours', () => {
    // 300 m³ at 60 m³/h = 5 h
    const oneDay = pvDay('2025-07-01');
    const r = scheduleIrrigations({ events: [{ date: '2025-07-01', volumeM3: 300 }], pv: oneDay, pumpKw: 30, flowM3h: 60 });
    const times = r.irrigations[0].hours.map((h) => h.time.slice(11));
    expect(times).toEqual(['11:00', '12:00', '13:00', '14:00', '15:00']);

    const chosen = Math.min(...r.irrigations[0].hours.map((h) => h.pvKw));
    const notChosen = pv
      .filter((h) => h.time.startsWith('2025-07-01') && !times.includes(h.time.slice(11)))
      .map((h) => h.pvKw);
    expect(Math.max(...notChosen)).toBeLessThanOrEqual(chosen);
  });

  it('splits each hour into solar (min of pump and PV) and grid', () => {
    const r = scheduleIrrigations({ events: [{ date: '2025-07-01', volumeM3: 60 }], pv, pumpKw: 30, flowM3h: 60 });
    const [h] = r.irrigations[0].hours;
    expect(h.time).toBe('2025-07-01T13:00');
    expect(h.solarKwh).toBeCloseTo(30);
    expect(h.gridKwh).toBeCloseTo(0);

    const big = scheduleIrrigations({ events: [{ date: '2025-07-01', volumeM3: 60 }], pv, pumpKw: 50, flowM3h: 60 });
    expect(big.irrigations[0].solarKwh).toBeCloseTo(40);
    expect(big.irrigations[0].gridKwh).toBeCloseTo(10);
  });

  it('handles a partial last hour', () => {
    const r = scheduleIrrigations({ events: [{ date: '2025-07-01', volumeM3: 150 }], pv, pumpKw: 30, flowM3h: 60 });
    expect(r.irrigations[0].hoursScheduled).toBeCloseTo(2.5);
    expect(r.irrigations[0].hours.map((h) => h.fraction).sort()).toEqual([0.5, 1, 1]);
  });

  it('rotation: spreads a round over the window, using sunny hours of every day before any night hour', () => {
    // 30 h; 4 days × 13 sunny hours = 52 sunny hours available
    const r = scheduleIrrigations({ events: [{ date: '2025-07-01', volumeM3: 1800 }], pv, pumpKw: 30, flowM3h: 60 });
    const irr = r.irrigations[0];
    expect(irr.windowEnd).toBe('2025-07-04');
    expect(irr.unscheduledHours).toBeCloseTo(0);
    expect(irr.pumpingDays).toBe(4);
    expect(irr.hours.every((h) => h.pvKw > 0)).toBe(true);
  });

  it('rotation: a round ends the day before the next round', () => {
    // 50 h but only 07-01 and 07-02 (48 h) before the next round on 07-03
    const r = scheduleIrrigations({
      events: [
        { date: '2025-07-01', volumeM3: 3000 },
        { date: '2025-07-03', volumeM3: 60 },
      ],
      pv,
      pumpKw: 30,
      flowM3h: 60,
    });
    const [first, second] = r.irrigations;
    expect(first.windowEnd).toBe('2025-07-02');
    // the 07-03T00:00 label is the 23:00–24:00 slot of 07-02, so it still belongs to the first round
    expect(first.hours.every((h) => h.time <= '2025-07-03T00:00')).toBe(true);
    expect(first.unscheduledHours).toBeCloseTo(2);
    expect(second.hours[0].time).toBe('2025-07-03T13:00');
    expect(r.totals.unscheduledHours).toBeCloseTo(2);
  });

  it('a round day owns the slots that start on it (00:00 label belongs to the day before)', () => {
    const r = scheduleIrrigations({
      events: [{ date: '2025-07-02', volumeM3: 24 * 60 }],
      pv,
      pumpKw: 30,
      flowM3h: 60,
      maxRotationDays: 1,
    });
    const times = r.irrigations[0].hours.map((h) => h.time);
    expect(times).not.toContain('2025-07-02T00:00');
    expect(times).toContain('2025-07-03T00:00');
    expect(r.irrigations[0].unscheduledHours).toBeCloseTo(0);
  });

  it('rotation: the round length is capped', () => {
    const r = scheduleIrrigations({
      events: [{ date: '2025-07-01', volumeM3: 1800 }],
      pv,
      pumpKw: 30,
      flowM3h: 60,
      maxRotationDays: 1,
    });
    expect(r.irrigations[0].windowEnd).toBe('2025-07-01');
    expect(r.irrigations[0].unscheduledHours).toBeCloseTo(6);
  });

  it('counts PV not used by the pump as surplus', () => {
    const day = pvDay('2025-07-01');
    const totalPv = day.reduce((s, h) => s + h.pvKw, 0);
    const none = scheduleIrrigations({ events: [], pv: day, pumpKw: 30, flowM3h: 60 });
    expect(none.totals.surplusPvKwh).toBeCloseTo(totalPv);

    const one = scheduleIrrigations({ events: [{ date: '2025-07-01', volumeM3: 60 }], pv: day, pumpKw: 30, flowM3h: 60 });
    expect(one.totals.surplusPvKwh).toBeCloseTo(totalPv - 30);
  });
});

describe('dailyPumping / formatWindow', () => {
  const fullDay = (date: string, next: string) =>
    [...Array.from({ length: 23 }, (_, h) => `${date}T${String(h + 1).padStart(2, '0')}:00`), `${next}T00:00`].map(
      (time) => ({ time, fraction: 1, pvKw: 0, pumpKwh: 0, solarKwh: 0, gridKwh: 0 }),
    );

  it('puts the 00:00 label on the previous day and writes a full day as 00:00–24:00', () => {
    const days = dailyPumping(fullDay('2026-10-25', '2026-10-26'));
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-10-25');
    expect(days[0].hours).toBe(24);
    expect(formatWindow(days[0].windows[0], days[0].date)).toBe('00:00–24:00');
  });

  it('formats partial windows and windows crossing midnight', () => {
    expect(formatWindow({ start: '2026-07-01T10:00', end: '2026-07-01T15:30', hours: 5.5 }, '2026-07-01')).toBe('10:00–15:30');
    expect(formatWindow({ start: '2026-07-01T22:00', end: '2026-07-02T02:00', hours: 4 }, '2026-07-01')).toBe(
      '22:00–02.07 02:00',
    );
  });
});

describe('pumpingWindows', () => {
  it('merges slots into windows covering the preceding hour', () => {
    const r = scheduleIrrigations({ events: [{ date: '2025-07-01', volumeM3: 150 }], pv: pvDay('2025-07-01'), pumpKw: 30, flowM3h: 60 });
    // slots 13:00 (12–13) and 12:00 or 14:00; 2.5 h in one window
    const windows = pumpingWindows(r.irrigations[0].hours);
    expect(windows).toHaveLength(1);
    expect(windows[0].hours).toBeCloseTo(2.5);
    const minutes = (t: string) => Number(t.slice(11, 13)) * 60 + Number(t.slice(14, 16));
    expect(minutes(windows[0].end) - minutes(windows[0].start)).toBe(150);
  });
});
