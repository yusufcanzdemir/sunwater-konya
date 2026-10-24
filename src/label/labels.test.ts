import { describe, expect, it } from 'vitest';
import { checksFromCsv, checksToCsv, classCounts, fromCsv, toCsv, type CheckRow, type LabelRow } from './labels';

const row = (over: Partial<LabelRow>): LabelRow => ({
  field_id: 'F00001',
  class: 'maize',
  confidence: 'high',
  sampling: 'random',
  labeled_by: 'Yusufcan Özdemir',
  labeled_at: '2026-10-22T10:00:00.000Z',
  lon: 33.4,
  lat: 37.8,
  ...over,
});

describe('labels CSV', () => {
  it('round-trips rows, including quotes and commas', () => {
    const rows = [row({}), row({ field_id: 'F00002', class: 'unsure', confidence: '', labeled_by: 'Ad, "Soyad"' })];
    const csv = toCsv(rows);
    expect(csv.split('\n')[0]).toBe('field_id,class,confidence,sampling,labeled_by,labeled_at,lon,lat');
    expect(fromCsv(csv)).toEqual(rows);
  });

  it('reads an empty file as no rows', () => {
    expect(fromCsv('')).toEqual([]);
  });
});

describe('classCounts', () => {
  it('ignores unsure and bad segment outcomes', () => {
    const rows = [row({}), row({ class: 'maize' }), row({ class: 'unsure' }), row({ class: 'bad_segment' }), row({ class: 'fallow' })];
    expect(classCounts(rows)).toEqual({ maize: 2, fallow: 1 });
  });
});

describe('checks CSV', () => {
  it('round-trips check rows with an empty correction', () => {
    const rows: CheckRow[] = [
      { field_id: 'F00010', proposed: 'maize', verdict: 'agree', correct_class: '', checked_by: 'Y', checked_at: '2026-10-23T08:00:00Z' },
      { field_id: 'F00011', proposed: 'maize', verdict: 'disagree', correct_class: 'sugar_beet', checked_by: 'Y', checked_at: '2026-10-23T08:01:00Z' },
    ];
    expect(checksFromCsv(checksToCsv(rows))).toEqual(rows);
  });
});
