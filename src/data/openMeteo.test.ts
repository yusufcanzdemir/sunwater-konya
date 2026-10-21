import { describe, expect, it, vi } from 'vitest';
import { buildArchiveUrl, buildForecastUrl, fetchArchive, geocode, parseWeatherResponse, pickBestGeoResult } from './openMeteo';

const sample = {
  latitude: 37.7,
  longitude: 33.55,
  daily: {
    time: ['2025-05-01', '2025-05-02', '2025-05-03'],
    et0_fao_evapotranspiration: [4.1, null, 5.3],
    precipitation_sum: [0, 2.4, 12],
  },
  hourly: {
    time: ['2025-05-01T11:00', '2025-05-01T12:00'],
    global_tilted_irradiance: [750, null],
  },
};

describe('Open-Meteo URLs', () => {
  it('builds the forecast URL with tilted irradiance facing south', () => {
    const url = new URL(buildForecastUrl(37.7, 33.55));
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('daily')).toBe('et0_fao_evapotranspiration,precipitation_sum');
    expect(url.searchParams.get('hourly')).toBe('global_tilted_irradiance');
    expect(url.searchParams.get('tilt')).toBe('30');
    expect(url.searchParams.get('azimuth')).toBe('0');
    expect(url.searchParams.get('forecast_days')).toBe('16');
    expect(url.searchParams.get('timezone')).toBe('Europe/Istanbul');
  });

  it('builds the archive URL with dates and no tilt for shortwave fallback', () => {
    const url = new URL(buildArchiveUrl(37.7, 33.55, '2025-04-20', '2025-10-16', 'shortwave_radiation'));
    expect(url.origin + url.pathname).toBe('https://archive-api.open-meteo.com/v1/archive');
    expect(url.searchParams.get('start_date')).toBe('2025-04-20');
    expect(url.searchParams.get('end_date')).toBe('2025-10-16');
    expect(url.searchParams.get('hourly')).toBe('shortwave_radiation');
    expect(url.searchParams.has('tilt')).toBe(false);
  });
});

describe('parseWeatherResponse', () => {
  it('maps daily values and drops days with missing data', () => {
    const s = parseWeatherResponse(sample, 'global_tilted_irradiance');
    expect(s.daily).toEqual([
      { date: '2025-05-01', et0: 4.1, precipitation: 0 },
      { date: '2025-05-03', et0: 5.3, precipitation: 12 },
    ]);
    expect(s.missingDates).toEqual(['2025-05-02']);
    expect(s.hourly).toEqual([{ time: '2025-05-01T11:00', irradiance: 750 }]);
  });

  it('throws when daily data is absent', () => {
    expect(() => parseWeatherResponse({}, 'global_tilted_irradiance')).toThrow();
  });
});

describe('fetchArchive', () => {
  it('falls back to shortwave_radiation when tilted irradiance fails', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: true, reason: 'bad' }), { status: 400 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...sample, hourly: { time: ['2025-05-01T12:00'], shortwave_radiation: [800] } }),
          { status: 200 },
        ),
      );
    const s = await fetchArchive(37.7, 33.55, '2025-05-01', '2025-05-03', fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(s.irradianceVariable).toBe('shortwave_radiation');
    expect(s.hourly[0].irradiance).toBe(800);
  });
});

describe('error messages', () => {
  it('turns network failures into Turkish messages per service', async () => {
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(geocode('Karapınar', offline)).rejects.toThrow('Konum servisine ulaşılamadı');
    await expect(fetchArchive(37.7, 33.55, '2025-05-01', '2025-05-03', offline)).rejects.toThrow(
      'Hava verisi servisine ulaşılamadı',
    );
  });
});

describe('pickBestGeoResult', () => {
  it('prefers a Konya match', () => {
    const r = pickBestGeoResult([
      { id: 1, name: 'Karapınar', latitude: 38.7, longitude: 31.4, admin1: 'Afyonkarahisar' },
      { id: 2, name: 'Karapınar', latitude: 37.7, longitude: 33.5, admin1: 'Konya' },
    ]);
    expect(r?.id).toBe(2);
    expect(pickBestGeoResult([])).toBeNull();
  });
});
