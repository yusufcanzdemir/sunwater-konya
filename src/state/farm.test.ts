import { describe, expect, it } from 'vitest';
import { EMPTY_FORM, demoForm, parseNumber, validateFarmForm } from './farm';

describe('farm form', () => {
  it('parses Turkish decimal comma', () => {
    expect(parseNumber('0,50')).toBe(0.5);
    expect(parseNumber('  ')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });

  it('accepts the demo field without prices', () => {
    const { input, errors } = validateFarmForm(demoForm(2026));
    expect(errors).toEqual({});
    expect(input).toMatchObject({
      locationText: 'Karapınar',
      crop: 'sugar_beet',
      plantingDate: '2026-04-20',
      areaDecare: 100,
      pumpEfficiency: 0.5,
      habitIntervalDays: 7,
      habitHours: 24,
      electricityPriceTlKwh: null,
    });
  });

  it('reports missing required fields', () => {
    const { input, errors } = validateFarmForm(EMPTY_FORM);
    expect(input).toBeNull();
    expect(Object.keys(errors)).toEqual(expect.arrayContaining(['locationText', 'crop', 'plantingDate', 'areaDecare']));
  });

  it('rejects pump efficiency above 1', () => {
    const { errors } = validateFarmForm({ ...demoForm(2026), pumpEfficiency: '1,5' });
    expect(errors.pumpEfficiency).toBeDefined();
  });
});
