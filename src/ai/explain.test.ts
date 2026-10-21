import { describe, expect, it } from 'vitest';
import { checkExplanation, dayName, templateExplanation, unknownNumbers, type ExplainPayload } from './explain';

const payload: ExplainPayload = {
  bu_hafta: {
    sezon_disi: false,
    sulama_turlari: [
      {
        baslangic: '23 Haziran Salı',
        bitis: '2 Temmuz Perşembe',
        toplam_saat: 160.5,
        su_m3: 9630,
        ilk_gunler: [{ gun: '23 Haziran Salı', saatler: '08:00–18:00', saat: 10 }],
      },
    ],
  },
  gecmis_sezon: {
    donem: '20 Nisan – 16 Ekim',
    mevcut_sulama_su_m3: 216000,
    plan_su_m3: 155122,
    verim_riski: false,
    tasarruf: { su_m3_yaklasik: 60878, su_m3_alt: 45659, su_m3_ust: 76098, yuzde: 28, tl_alt: 89582, tl_ust: 149304 },
    gunes_payi_yuzde: 34,
  },
  uyarilar: [],
};

describe('dayName', () => {
  it('writes the date in words', () => {
    expect(dayName('2026-10-21')).toBe('21 Ekim Çarşamba');
    expect(dayName('2026-04-20', false)).toBe('20 Nisan');
  });
});

describe('number check', () => {
  it('accepts payload numbers in Turkish, English or plain form', () => {
    const text =
      '23 Haziran Salı günü 08:00–18:00 arasında sulayın, tur 160,5 saat sürer. Geçen sezon 60.878 m³ (%28) ve 89582–149.304 TL tasarruf olurdu; 76,098 m³e kadar.';
    expect(unknownNumbers(text, payload)).toEqual([]);
  });

  it('flags invented numbers', () => {
    expect(unknownNumbers('Bu plan 70.000 m³ ve %35 tasarruf sağlar.', payload)).toEqual(['70.000', '35']);
  });

  it('rejects numbers written as words and foreign script', () => {
    const spelled = checkExplanation('Tur toplam iki yüz elli virgül sekiz saat sürer.', payload);
    expect(spelled.ok).toBe(false);
    expect(spelled.unknown).toEqual(['iki', 'yüz', 'elli', 'virgül', 'sekiz']);
    expect(checkExplanation('yüz elli नौ bin TL', payload).ok).toBe(false);
  });

  it('does not mistake ordinary words for number words', () => {
    // altında, onu, bir, binlerce… are not number words on their own
    const text = 'Mevcut sulamanız ihtiyacın altında, onu bir an önce artırın; bu binlerce çiftçiye örnek olur.';
    expect(checkExplanation(text, payload)).toEqual({ ok: true, unknown: [] });
  });

  it('rejects technical terms', () => {
    expect(checkExplanation('ET0 değerine göre sulayın.', payload).ok).toBe(false);
    expect(checkExplanation('', payload).ok).toBe(false);
  });
});

describe('templateExplanation', () => {
  it('passes its own number check and stays within 6 sentences', () => {
    const text = templateExplanation(payload);
    expect(checkExplanation(text, payload)).toEqual({ ok: true, unknown: [] });
    expect(text.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(6);
    expect(text).toContain('obruk');
  });

  it('covers off-season and yield-risk cases', () => {
    const text = templateExplanation({
      bu_hafta: { sezon_disi: true, sulama_turlari: [] },
      gecmis_sezon: { ...payload.gecmis_sezon!, verim_riski: true, tasarruf: null, gunes_payi_yuzde: null },
      uyarilar: [],
    });
    expect(text).toContain('sezonu dışındasınız');
    expect(text).toContain('verim kaybı');
    expect(checkExplanation(text, payload).ok).toBe(true);
  });
});
