// Open-Meteo clients (no API key). URL building and response parsing are pure so they
// can be tested without the network; the fetch wrappers only do I/O.

import type { HourlyIrradiance } from '../engine/pv';
import type { DailyWeather } from '../engine/waterBalance';

export type { HourlyIrradiance };

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const TIMEZONE = 'Europe/Istanbul';

/** Panel orientation: 30° tilt, facing south (Open-Meteo azimuth 0 = south). */
export const PANEL_TILT_DEG = 30;
export const PANEL_AZIMUTH_DEG = 0;

export type IrradianceVariable = 'global_tilted_irradiance' | 'shortwave_radiation';

export interface WeatherSeries {
  latitude: number;
  longitude: number;
  daily: DailyWeather[];
  hourly: HourlyIrradiance[];
  irradianceVariable: IrradianceVariable;
  /** Dates dropped because ET0 or precipitation was missing. */
  missingDates: string[];
}

export interface GeoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  admin2?: string;
}

export class OpenMeteoError extends Error {}

type FetchFn = typeof fetch;

export function buildGeocodingUrl(name: string): string {
  const params = new URLSearchParams({ name, language: 'tr', count: '5', countryCode: 'TR' });
  return `${GEOCODING_URL}?${params}`;
}

function weatherParams(latitude: number, longitude: number, variable: IrradianceVariable): URLSearchParams {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: 'et0_fao_evapotranspiration,precipitation_sum',
    hourly: variable,
    timezone: TIMEZONE,
  });
  if (variable === 'global_tilted_irradiance') {
    params.set('tilt', String(PANEL_TILT_DEG));
    params.set('azimuth', String(PANEL_AZIMUTH_DEG));
  }
  return params;
}

export function buildForecastUrl(
  latitude: number,
  longitude: number,
  variable: IrradianceVariable = 'global_tilted_irradiance',
  forecastDays = 16,
): string {
  const params = weatherParams(latitude, longitude, variable);
  params.set('forecast_days', String(forecastDays));
  return `${FORECAST_URL}?${params}`;
}

export function buildArchiveUrl(
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string,
  variable: IrradianceVariable = 'global_tilted_irradiance',
): string {
  const params = weatherParams(latitude, longitude, variable);
  params.set('start_date', startDate);
  params.set('end_date', endDate);
  return `${ARCHIVE_URL}?${params}`;
}

interface RawWeatherResponse {
  latitude?: number;
  longitude?: number;
  daily?: {
    time?: string[];
    et0_fao_evapotranspiration?: (number | null)[];
    precipitation_sum?: (number | null)[];
  };
  hourly?: { time?: string[] } & Partial<Record<IrradianceVariable, (number | null)[]>>;
}

export function parseWeatherResponse(json: unknown, variable: IrradianceVariable): WeatherSeries {
  const raw = json as RawWeatherResponse;
  const time = raw.daily?.time;
  const et0 = raw.daily?.et0_fao_evapotranspiration;
  const precipitation = raw.daily?.precipitation_sum;
  if (!time || !et0 || !precipitation) {
    throw new OpenMeteoError('Yanıtta günlük ET0 veya yağış verisi yok.');
  }

  const daily: DailyWeather[] = [];
  const missingDates: string[] = [];
  time.forEach((date, i) => {
    const e = et0[i];
    const p = precipitation[i];
    if (e == null || p == null) missingDates.push(date);
    else daily.push({ date, et0: e, precipitation: p });
  });

  const hourTimes = raw.hourly?.time ?? [];
  const hourValues = raw.hourly?.[variable] ?? [];
  const hourly: HourlyIrradiance[] = [];
  hourTimes.forEach((t, i) => {
    const v = hourValues[i];
    if (v != null) hourly.push({ time: t, irradiance: v });
  });

  return {
    latitude: raw.latitude ?? NaN,
    longitude: raw.longitude ?? NaN,
    daily,
    hourly,
    irradianceVariable: variable,
    missingDates,
  };
}

async function getJson(url: string, fetchFn: FetchFn): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(url);
  } catch {
    throw new OpenMeteoError('Hava verisi servisine ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = (body as { reason?: string } | null)?.reason;
    throw new OpenMeteoError(`Hava verisi servisi hata verdi${reason ? `: ${reason}` : '.'}`);
  }
  return body;
}

/**
 * Fetches with tilted irradiance first; if the request fails or has no irradiance values,
 * retries with plain shortwave radiation (as allowed by the spec).
 */
async function fetchWeather(
  buildUrl: (variable: IrradianceVariable) => string,
  fetchFn: FetchFn,
): Promise<WeatherSeries> {
  try {
    const series = parseWeatherResponse(await getJson(buildUrl('global_tilted_irradiance'), fetchFn), 'global_tilted_irradiance');
    if (series.hourly.length > 0) return series;
  } catch {
    // fall through to shortwave_radiation
  }
  return parseWeatherResponse(await getJson(buildUrl('shortwave_radiation'), fetchFn), 'shortwave_radiation');
}

export function fetchForecast(latitude: number, longitude: number, fetchFn: FetchFn = fetch): Promise<WeatherSeries> {
  return fetchWeather((v) => buildForecastUrl(latitude, longitude, v), fetchFn);
}

export function fetchArchive(
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string,
  fetchFn: FetchFn = fetch,
): Promise<WeatherSeries> {
  return fetchWeather((v) => buildArchiveUrl(latitude, longitude, startDate, endDate, v), fetchFn);
}

export async function geocode(name: string, fetchFn: FetchFn = fetch): Promise<GeoResult[]> {
  let body: { results?: GeoResult[] };
  try {
    body = (await getJson(buildGeocodingUrl(name), fetchFn)) as { results?: GeoResult[] };
  } catch {
    throw new OpenMeteoError('Konum servisine ulaşılamadı. İnternet bağlantınızı kontrol edin veya biraz sonra tekrar deneyin.');
  }
  return (body.results ?? []).map(({ id, name, latitude, longitude, admin1, admin2 }) => ({
    id,
    name,
    latitude,
    longitude,
    admin1,
    admin2,
  }));
}

/** Prefer a Konya match, otherwise the first result. */
export function pickBestGeoResult(results: GeoResult[]): GeoResult | null {
  return results.find((r) => r.admin1 === 'Konya') ?? results[0] ?? null;
}
