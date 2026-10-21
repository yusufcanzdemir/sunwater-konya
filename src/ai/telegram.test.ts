import { describe, expect, it } from 'vitest';
import { checkExplanation } from './explain';
import { planChangeNote, relativeDay, templateTelegram, type TelegramPayload } from './telegram';

const inSeason: TelegramPayload = {
  tarla: 'Karapınar – Şeker pancarı',
  sezon_disi: false,
  siradaki_sulama: { gun: 'Yarın', saatler: '10:00–15:00', saat: 5 },
  yagis: { gun: '24 Ekim Cumartesi', mm: 12 },
  gunes_payi_yuzde: 64,
  hafta_tasarruf: { su_m3: 1200, kwh: 780 },
  verim_riski: false,
  gecmis_sezon_tasarruf: null,
};

describe('templateTelegram', () => {
  it('writes at most 5 lines, each starting with an emoji, using only payload numbers', () => {
    const text = templateTelegram(inSeason);
    const lines = text.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('🌱 Karapınar – Şeker pancarı tarlası');
    expect(lines[1]).toBe('💧 Yarın 10:00–15:00 arası 5 saat sulayın.');
    expect(text).toContain('1.200 m³ su ve 780 kWh');
    expect(checkExplanation(text, inSeason)).toEqual({ ok: true, unknown: [] });
  });

  it('out of season: no action, last season what-if', () => {
    const p: TelegramPayload = {
      ...inSeason,
      sezon_disi: true,
      siradaki_sulama: null,
      yagis: null,
      gunes_payi_yuzde: null,
      hafta_tasarruf: null,
      gecmis_sezon_tasarruf: { su_m3: 60878, kwh: 39814 },
    };
    const text = templateTelegram(p);
    expect(text).toContain('Sulama sezonu dışındasınız');
    expect(text).toContain('60.878 m³');
    expect(checkExplanation(text, p).ok).toBe(true);
  });

  it('flags a yield risk instead of savings', () => {
    const text = templateTelegram({ ...inSeason, hafta_tasarruf: null, verim_riski: true });
    expect(text).toContain('verim riski');
  });
});

describe('relativeDay / planChangeNote', () => {
  it('names today and tomorrow', () => {
    expect(relativeDay('2026-07-01', '2026-07-01')).toBe('Bugün');
    expect(relativeDay('2026-07-02', '2026-07-01')).toBe('Yarın');
    expect(relativeDay('2026-07-04', '2026-07-01')).toBe('4 Temmuz Cumartesi');
  });

  it('only warns when the planned day/hours change', () => {
    expect(planChangeNote(null, '2026-07-02|10:00–15:00', inSeason)).toBeNull();
    expect(planChangeNote('2026-07-02|10:00–15:00', '2026-07-02|10:00–15:00', inSeason)).toBeNull();
    expect(planChangeNote('2026-07-02|10:00–15:00', 'none', { ...inSeason, siradaki_sulama: null })).toBe(
      '⚠️ Plan değişti: sulamayın, 24 ekim cumartesi yağmur bekleniyor.',
    );
    expect(planChangeNote('none', '2026-07-02|10:00–15:00', inSeason)).toBe('⚠️ Plan değişti: yeni sulama yarın 10:00–15:00 arası.');
  });
});
