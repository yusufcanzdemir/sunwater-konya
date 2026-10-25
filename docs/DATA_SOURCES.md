# Data sources

Every dataset, model and reference the project uses, with its licence and the attribution it
asks for. Earth Engine access to all sources was checked on 2026-10-22
(`pipeline/00_setup_check.py`); licence pages were read on 2026-10-25. Methods are described in
`docs/METHODOLOGY.md`.

## Datasets

| Source | Access (ID / URL) | Used for | Licence / terms | Attribution |
|---|---|---|---|---|
| Copernicus Sentinel-2 L2A | `COPERNICUS/S2_SR_HARMONIZED`, Cloud Score+ `GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED` | NDVI / EVI / NDMI, field boundaries | Free, full and open (EU Reg. 377/2014, Del. Reg. 1159/2013) | "Contains modified Copernicus Sentinel data 2024–2025" |
| Copernicus Sentinel-1 GRD | `COPERNICUS/S1_GRD` | VV/VH features for classification | As above | As above |
| Landsat 8/9 Collection 2 Level-2 | `LANDSAT/LC08/C02/T1_L2`, `LANDSAT/LC09/C02/T1_L2` | Land-surface temperature and reflectance for SEBAL | U.S. public domain; acknowledgement requested | "Landsat Collection 2 Level-2 data courtesy of the U.S. Geological Survey"; EROS Center (2020), doi:10.5066/P9OGBGM6 |
| ESA WorldCover 2021 v200 | `ESA/WorldCover/v200` | Cropland mask | CC BY 4.0 | "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium"; Zanaga et al. (2022) |
| ERA5-Land (hourly, daily aggregates) | `ECMWF/ERA5_LAND/HOURLY`, `ECMWF/ERA5_LAND/DAILY_AGGR` | ET₀ / rain cross-check, SEBAL meteorology | CC BY 4.0 (Copernicus Climate Data Store) | "Generated using Copernicus Climate Change Service information 2026. Neither the European Commission nor ECMWF is responsible for any use that may be made of the Copernicus information or data it contains."; Muñoz Sabater (2019), doi:10.24381/cds.e2161bac |
| Open-Meteo historical and forecast API | https://archive-api.open-meteo.com, https://api.open-meteo.com | Daily ET₀ and rain per field (pipeline); forecast for the farmer planner and the bot | Data CC BY 4.0; **the free API is for non-commercial use only** (public research counts as non-commercial; subscription or ad-supported apps do not); < 10,000 calls/day | "Weather data by Open-Meteo.com" with a link, next to the data; Zippenfenig (2023), doi:10.5281/ZENODO.7970649 |
| MODIS MOD16A2GF v061 | `MODIS/061/MOD16A2GF` | Seasonal ET cross-check | NASA EOSDIS open data, no restriction; citation requested | Running et al. (2021), doi:10.5067/MODIS/MOD16A2GF.061 |
| GRACE/GRACE-FO JPL mascon RL06.3Mv04 CRI | `NASA/GRACE/MASS_GRIDS_V04/MASCON_CRI` (sensitivity: `…/MASCON`, `…/LAND`) | Basin total water storage | NASA PO.DAAC open data | Wiese et al. (2023), doi:10.5067/TEMSC-3JC634; Watkins et al. (2015); Wiese et al. (2016) |
| GLDAS-2.1 Noah 3-hourly | `NASA/GLDAS/V021/NOAH/G025/T3H` | Soil moisture, snow, canopy water | NASA EOSDIS open data | Beaudoing & Rodell (2020), doi:10.5067/E7TYRXPJKWOQ; Rodell et al. (2004) |
| HydroSHEDS / HydroBASINS level 5 | `WWF/HydroSHEDS/v1/Basins/hybas_5` | Konya Closed Basin polygon | HydroSHEDS licence: free for scientific, educational and commercial use with attribution | "This product incorporates data from the HydroSHEDS version 1 database which is © World Wildlife Fund, Inc. (2006-2022) and has been used herein under license. …" (full text in the HydroSHEDS technical documentation v1.4, Appendix A); Lehner & Grill (2013) |
| Esri World Imagery | ArcGIS Online basemap and `MapServer/export` | Map background in the panel and planner; field snapshot in the bot | Esri Master License Agreement; not for offline tile export | "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community"; at minimum "Esri" must be shown |
| Segment Anything (SAM v1, ViT-H) | https://github.com/facebookresearch/segment-anything | Field boundaries | Apache 2.0 | Kirillov et al. (2023) |
| Google Earth Engine | project `climathon-512416` | Processing platform | Non-commercial use free of charge (no selling of products or fee-for-service deliverables made with it) | – |
| ESA WorldCereal 2021 | `ESA/WorldCereal/2021/MODELS/v100` | Checked for access only (optional), not used | – | – |
| EGMS (European Ground Motion Service) | – | Not used: does not cover Türkiye (D9) | – | – |

Licence pages: Sentinel legal notice (sentinels.copernicus.eu), USGS Landsat Collection 2 and
copyright FAQ (usgs.gov), esa-worldcover.org/en/data-access, cds.climate.copernicus.eu,
open-meteo.com/en/licence and /en/terms, lpdaac.usgs.gov/data/data-citation-and-policies,
hydrosheds.org, arcgis.com item 10df2279f9684e4a9f6a7f08febac2a9 and
developers.arcgis.com/documentation/esri-and-data-attribution, earthengine.google.com/terms.

Notes:

- The JPL mascon landing page returned 404 on 2026-10-25; the dataset citation is taken from the
  NASA CMR record.
- The ERA5-Land licence name comes from the CDS catalogue API; the licence text itself was not
  opened.
- The Open-Meteo free tier is non-commercial. A commercial or paid deployment needs an
  Open-Meteo API subscription; the same applies to Earth Engine.

## Konya field trials (literature comparison, `docs/VALIDATION.md` §8)

Seasonal crop water consumption measured in the Konya plain. Values were read in the sources
themselves; secondary citations are marked.

1. Kaya, Z., Topak, R. (2016). Şekerpancarında kısmi kök bölgesi sulama yöntemi uygulamasının verim
   ve sulama suyu kullanımına etkisi. Selçuk Tarım Bilimleri Dergisi, 3(1), 130–137.
   https://dergipark.org.tr/tr/download/article-file/3082125 (year from the submission dates; no DOI).
2. Kara, S., Sahin, M. (2021). Water-yield relations of drip irrigated maize in arid and semi-arid
   regions. ANADOLU, 31(1), 9–20. doi:10.18615/anadolu.949833
3. Yavuz, N., Çiftçi, N., Yavuz, D. (2019). Effects of different irrigation interval and plant-pan
   coefficient applications on yield and quality parameters of oil sunflower grown in semi-arid
   climatic conditions. Arabian Journal of Geosciences, 12(22), 672. doi:10.1007/s12517-019-4867-1
4. Tari, A.F. (2016). The effects of different deficit irrigation strategies on yield, quality, and
   water-use efficiencies of wheat under semi-arid conditions. Agricultural Water Management, 167,
   1–10. doi:10.1016/j.agwat.2015.12.023 (site given as Central Anatolia; Konya plain per ref. 6)
5. Dündar, M.A., Topak, R. (2025). Konya Ovası koşullarında kışlık buğdayda sulamanın verime etkisi.
   Turkish Journal of Agriculture – Food Science and Technology, 13(12), 4183–4191.
   doi:10.24925/turjaf.v13i12.4183-4191.8344
6. Süheri, S., Amarkai, P.A., Yavuz, D. (2019). A comparative study of crop evapotranspiration
   estimation by three methods with measured crop evapotranspiration in Konya Plain. Selcuk Journal
   of Agriculture and Food Sciences, 33(1), 1–6. doi:10.15316/SJAFS.2019.148

No Konya field trial with seasonal ET was found for alfalfa or silage maize, and no remote-sensing
(SEBAL/METRIC) study with seasonal crop ET for Konya.

## Land subsidence (published InSAR / GNSS studies, D9)

No subsidence layer is shown; these peer-reviewed studies are cited instead. Rates are quoted from
the abstracts.

1. Üstün, A. et al. (2015). Land subsidence in Konya Closed Basin and its spatio-temporal detection
   by GPS and DInSAR. Environmental Earth Sciences, 73(10), 6691–6703. doi:10.1007/s12665-014-3890-5 —
   "a considerable land subsidence resulting in the rate of 1–4 cm/year in Konya sub-basin".
2. Calò, F. et al. (2017). DInSAR-based detection of land subsidence and correlation with groundwater
   depletion in Konya Plain, Turkey. Remote Sensing, 9(1), 83. doi:10.3390/rs9010083 — ENVISAT
   2002–2010, subsidence over about 1,200 km² with vertical displacements up to 10 cm.
3. Orhan, O., Oliver-Cabrera, T., Wdowinski, S., Yalvac, S., Yakar, M. (2021). Land subsidence and its
   relations with sinkhole activity in Karapınar region, Turkey: a multi-sensor InSAR time series
   study. Sensors, 21(3), 774. doi:10.3390/s21030774 — Sentinel-1 2014–2018, COSMO-SkyMed 2016–2017:
   "broad areas of subsidence with rates exceeding 70 mm/yr".
4. Orhan, O., Haghshenas Haghighi, M., Demir, V., Gökkaya, E., Gutiérrez, F., Al-Halbouni, D. (2024).
   Spatial and temporal patterns of land subsidence and sinkhole occurrence in the Konya Endorheic
   Basin, Turkey. Geosciences, 14(1), 5. doi:10.3390/geosciences14010005 — Sentinel-1 2014–2022:
   "widespread subsidence zones with rates as high as 90 mm/y".

## Method references

See the reference list in `docs/METHODOLOGY.md`.
