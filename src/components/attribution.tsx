// Attribution wording required by the data licences (docs/DATA_SOURCES.md, checked 2026-10-25).

import { t } from '../i18n';

export const ESRI_ATTRIBUTION = 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community';
export const SENTINEL_ATTRIBUTION = 'Contains modified Copernicus Sentinel data 2024–2025';

/** Open-Meteo asks for this link next to data derived from its free API. */
export function OpenMeteoCredit() {
  return (
    <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline">
      Weather data by Open-Meteo.com
    </a>
  );
}

/** Credits for the panel, which shows data derived from all pipeline sources. */
export function PanelCredits() {
  return (
    <p className="text-xs text-soil-500">
      <OpenMeteoCredit /> · {SENTINEL_ATTRIBUTION} · Landsat Collection 2 courtesy of the U.S. Geological Survey · © ESA WorldCover
      project 2021 · Generated using Copernicus Climate Change Service information 2026 (ERA5-Land) · NASA GRACE/GRACE-FO (JPL mascon CRI), GLDAS,
      MODIS MOD16 · HydroSHEDS © World Wildlife Fund, Inc. (2006-2022), used under license · {t('Altlık', 'Base map')}: {ESRI_ATTRIBUTION}.{' '}
      {t('Kaynakların listesi "Yöntem" sekmesinde.', 'The full list of sources is in the "Method" tab.')}
    </p>
  );
}
