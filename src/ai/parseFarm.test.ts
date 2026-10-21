import { describe, expect, it } from 'vitest';
import { parsedFarmToForm, sanitizeParsedFarm } from './parseFarm';

describe('sanitizeParsedFarm', () => {
  it('keeps valid values and drops invalid ones', () => {
    const p = sanitizeParsedFarm({
      location_text: ' Karapınar ',
      crop: 'sugar_beet',
      planting_date: '2026-04-30',
      area_decare: 100,
      irrigation_method: 'pivot',
      well_head_m: -5,
      pump_flow_m3h: null,
      pv_kwp: 50,
      energy_source: 'solar_grid',
      habit_interval_days: 1,
      habit_hours: 20,
      missing_fields: ['pump_flow_m3h', 3],
      follow_up_question: 'Pompanızın debisi kaç m³/saat?',
    });
    expect(p.location_text).toBe('Karapınar');
    expect(p.irrigation_method).toBeNull();
    expect(p.well_head_m).toBeNull();
    expect(p.missing_fields).toEqual(['pump_flow_m3h']);
  });

  it('rejects impossible dates and survives garbage', () => {
    expect(sanitizeParsedFarm({ planting_date: '2026-02-30' }).planting_date).toBeNull();
    expect(sanitizeParsedFarm(null).crop).toBeNull();
  });
});

describe('parsedFarmToForm', () => {
  it('fills found values and lists the rest as missing', () => {
    const { patch, missing } = parsedFarmToForm(
      sanitizeParsedFarm({
        location_text: 'Karapınar',
        crop: 'sugar_beet',
        area_decare: 100,
        pump_flow_m3h: 62.5,
        energy_source: 'grid',
      }),
    );
    expect(patch).toEqual({
      locationText: 'Karapınar',
      crop: 'sugar_beet',
      areaDecare: '100',
      pumpFlowM3h: '62,5',
      energySource: 'grid',
    });
    expect(missing).toEqual(
      expect.arrayContaining(['plantingDate', 'irrigationMethod', 'wellHeadM', 'habitIntervalDays', 'habitHours']),
    );
    // no PV needed for a grid pump
    expect(missing).not.toContain('pvKwp');
  });
});
