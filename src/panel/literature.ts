// Published Konya figures shown in the panel, each read in the source itself on 2026-10-25
// (docs/DATA_SOURCES.md, docs/VALIDATION.md §8). Do not add values that were not verified there.

export interface TrialRow {
  cls: string;
  trial: string;
  source: string;
}

export const KONYA_TRIALS: TrialRow[] = [
  {
    cls: 'sugar_beet',
    trial: '958 mm (tam sulama, damla, Çumra 2013); ~1.000 mm (atıf)',
    source: 'Kaya & Topak 2016, Selçuk Tarım Bilimleri Dergisi 3(1)',
  },
  {
    cls: 'maize',
    trial: '781–821 mm (tam sulama, damla, 2009–2010)',
    source: 'Kara & Sahin 2021, ANADOLU 31(1), doi:10.18615/anadolu.949833',
  },
  {
    cls: 'sunflower',
    trial: '749 mm (en ıslak uygulama, buharlaşmanın %125’i, 2013–2014)',
    source: 'Yavuz vd. 2019, Arabian J. Geosciences 12, doi:10.1007/s12517-019-4867-1',
  },
  {
    cls: 'irrigated_winter_cereal',
    trial: 'en çok 571 mm (22 uygulama); Konya rehber değeri 518 mm',
    source: 'Tari 2016, Agric. Water Manage. 167; Dündar & Topak 2025, TURJAF 13(12)',
  },
  { cls: 'alfalfa', trial: 'Konya deneyi bulunamadı', source: '–' },
];

export interface SubsidenceStudy {
  citation: string;
  finding: string;
  doi: string;
}

export const KONYA_SUBSIDENCE: SubsidenceStudy[] = [
  { citation: 'Üstün vd. 2015, Environmental Earth Sciences 73', finding: 'GPS ve DInSAR: Konya alt havzasında yılda 1–4 cm çökme', doi: '10.1007/s12665-014-3890-5' },
  { citation: 'Calò vd. 2017, Remote Sensing 9(1)', finding: 'ENVISAT 2002–2010: yaklaşık 1.200 km²’de çökme, 10 cm’ye varan düşey yer değiştirme', doi: '10.3390/rs9010083' },
  { citation: 'Orhan vd. 2021, Sensors 21(3)', finding: 'Karapınar, Sentinel-1 2014–2018: yer yer yılda 70 mm’yi aşan çökme', doi: '10.3390/s21030774' },
  { citation: 'Orhan vd. 2024, Geosciences 14(1)', finding: 'Konya Kapalı Havzası, Sentinel-1 2014–2022: yılda 90 mm’ye varan çökme', doi: '10.3390/geosciences14010005' },
];
