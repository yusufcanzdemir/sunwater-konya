// "Yöntem ve Doğrulama": data sources, method summary, every metric in metrics.json, limits.

import { useEffect, useState, type ReactNode } from 'react';
import { fmt } from '../components/ui';
import { lang, locale, pc, t } from '../i18n';
import { loadMetrics, type Manifest, type Metrics } from './data';
import { KONYA_SUBSIDENCE, KONYA_TRIALS } from './literature';

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const pct = (v: number) => pc(fmt(v * 100));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-soil-200 bg-white p-4 text-sm text-soil-800">
      <h2 className="text-base font-semibold text-soil-900">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

const SOURCES: [string, string][] = [
  ['Sentinel-2 L2A (COPERNICUS/S2_SR_HARMONIZED)', t('NDVI/NDMI zaman serileri, tarla sınırları', 'NDVI/NDMI time series, field boundaries')],
  ['Sentinel-1 GRD', t('Sınıflandırmaya ek özellik', 'Extra classification features')],
  ['Landsat 8/9 C2 L2', t('Yüzey sıcaklığı, SEBAL doğrulaması', 'Surface temperature, SEBAL check')],
  ['ESA WorldCover 2021', t('Tarım alanı maskesi', 'Cropland mask')],
  [
    t('Open-Meteo arşivi ve tahmini (ücretsiz API, ticari olmayan kullanım; CC BY 4.0)', 'Open-Meteo archive and forecast (free API, non-commercial use; CC BY 4.0)'),
    t('Günlük ET₀ (FAO-56) ve yağış, çiftçi planı', 'Daily ET₀ (FAO-56) and rainfall, farmer plan'),
  ],
  [t('ERA5-Land (saatlik/günlük)', 'ERA5-Land (hourly/daily)'), t('ET₀ ve yağış çapraz kontrolü, SEBAL meteorolojisi', 'ET₀ and rainfall cross-check, SEBAL weather')],
  ['MODIS MOD16A2GF', t('Sezonluk ET karşılaştırması', 'Seasonal ET comparison')],
  ['GRACE/GRACE-FO JPL mascon RL06.3 CRI', t('Havza toplam su depolaması', 'Basin total water storage')],
  ['GLDAS 2.1 Noah', t('Toprak nemi, kar, bitki üstü su', 'Soil moisture, snow, canopy water')],
  [t('HydroSHEDS seviye 5', 'HydroSHEDS level 5'), t('Konya Kapalı Havzası sınırı', 'Konya Closed Basin boundary')],
  [
    t('FAO-56 (Allen vd. 1998), FAO-33 Ky (Moutonnet 2002, FAO Water Reports 22)', 'FAO-56 (Allen et al. 1998), FAO-33 Ky (Moutonnet 2002, FAO Water Reports 22)'),
    t('Bitki katsayıları, verim tepki katsayıları', 'Crop coefficients, yield response factors'),
  ],
  [t('Segment Anything (Kirillov vd. 2023, Apache 2.0)', 'Segment Anything (Kirillov et al. 2023, Apache 2.0)'), t('Tarla sınırları', 'Field boundaries')],
  ['Esri World Imagery', t('Harita altlığı, Telegram tarla görüntüsü', 'Base map, Telegram field image')],
];

const LIMITS: [string, string][] = [
  [
    'Uydu tüketimi (ET) görür; toprağa sızan fazla sulama suyunu ve pompalanan hacmi görmez.',
    'Satellites see consumption (ET); they do not see excess irrigation water that percolates into the soil, or the pumped volume.',
  ],
  [
    'Sahada ölçüm (akı kulesi, lizimetre) ve doğrulanmış ürün bilgisi yok; ET ve sınıflar uydu tahminidir.',
    'There are no field measurements (flux tower, lysimeter) and no verified crop data; ET and classes are satellite estimates.',
  ],
  [
    'NDVI-Kc stres yok ve her 7 günde bir ıslatma varsayar. Konya deneylerine göre pancar ve ayçiçeğinde uyumlu, mısırda biraz, sulu kışlık tahılda belirgin şekilde yüksek.',
    'NDVI-Kc assumes no stress and wetting every 7 days. Against the Konya trials it agrees for sugar beet and sunflower, is slightly high for maize and clearly high for irrigated winter cereal.',
  ],
  [
    'Sulama yöntemi, basma yüksekliği ve pompa verimi tarla bazında bilinmiyor; enerji rakamları varsayımdır.',
    'Irrigation method, pumping head and pump efficiency are not known per field; energy figures are assumptions.',
  ],
  [
    'Obruk sayısı, yeraltı suyu düşüş miktarı, ruhsatsız kuyu sayısı gibi doğrulanmamış rakamlar kullanılmaz.',
    'Unverified figures, such as the number of sinkholes, the amount of groundwater decline or the number of unlicensed wells, are not used.',
  ],
];

export default function MethodView({ manifest }: { manifest: Manifest }) {
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadMetrics().then(setM, () => setError(t('Metrikler yüklenemedi.', 'Metrics could not be loaded.')));
  }, []);
  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!m) return <p className="text-sm text-soil-500">{t('Yükleniyor…', 'Loading…')}</p>;

  const seg = m.segmentation as Obj;
  const segTest = seg.selected_metrics.test;
  const cls = m.classification as Obj;
  const blind = cls.blind_labels;
  const plaus = cls.plausibility_check;
  const et0 = m.et0_crosscheck as Obj;
  const et = m.et_ndvikc as Obj;
  const sebal = m.sebal as Obj;
  const pilotBlue = Object.keys(et.seasons)
    .sort()
    .reverse()
    .map((y) => `${y}: ${fmt(et.seasons[y].pilot_blue_mm3)} ${t('milyon m³', 'million m³')} (${fmt(et.seasons[y].pilot_blue_mm3_range[0])}–${fmt(et.seasons[y].pilot_blue_mm3_range[1])})`)
    .join('; ');
  const budget = m.budget as Obj;
  const p = manifest.budget_parameters;
  const names = manifest.classes;
  const years = Object.keys(et.seasons).sort().reverse();
  const uncertainShares = years.map((y) => `${y}: ${pct(cls.seasons[y].uncertain_share)}`).join(', ');
  const cropEt = (m.crop_period_et ?? {}) as Record<string, Record<string, { median: number; p25: number; p75: number }>>;

  return (
    <div className="space-y-4">
      <Section title={t('Yöntem özeti', 'Method summary')}>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            {t(
              `Tarla sınırları: Sentinel-2 NDVI yanlış renk görüntüsünde SAM ile otomatik bölütleme (${fmt(seg.n_fields)} tarla, ortanca ${fmt(seg.median_field_ha, 1)} ha).`,
              `Field boundaries: automatic segmentation with SAM on a Sentinel-2 NDVI false-colour image (${fmt(seg.n_fields)} fields, median ${fmt(seg.median_field_ha, 1)} ha).`,
            )}
          </li>
          <li>
            {t(
              'Ürün: NDVI/NDMI eğrilerinin denetimsiz kümelenmesi ve açık fenoloji kurallarıyla adlandırma. Doğruluğu ölçülmedi.',
              'Crop: unsupervised clustering of NDVI/NDMI curves, named with explicit phenology rules. Accuracy not measured.',
            )}
          </li>
          <li>
            {t(
              'Gerçek ET: ölçeklenmiş NDVI → Kcb (FAO-56) + toprak buharlaşması, × ET₀; stres yok varsayımı.',
              'Actual ET: scaled NDVI → Kcb (FAO-56) + soil evaporation, × ET₀; no-stress assumption.',
            )}
          </li>
          <li>
            {t(
              'Mavi su: bitkinin tarlada olduğu günlerde ET − etkili yağış; kuru tahıl ve nadasta 0.',
              'Blue water: ET − effective rainfall on days the crop is in the field; 0 for rainfed cereal and fallow.',
            )}
          </li>
          <li>
            {t(
              `Bütçe: aynı ürünün pilottaki tipik bitki eğrisi + damla sulamada beklenen buharlaşma (S1); S2 pilot toplamını %${fmt(p.s2_reduction * 100)} azaltır (varsayım).`,
              `Budget: the typical crop curve of the same crop in the pilot + the evaporation expected under drip irrigation (S1); S2 cuts the pilot total by ${fmt(p.s2_reduction * 100)}% (assumption).`,
            )}
          </li>
          <li>
            {t(
              'Doğrulama: Landsat ile bağımsız enerji dengesi (SEBAL), MODIS, ERA5-Land çapraz kontrolleri.',
              'Validation: independent Landsat energy balance (SEBAL), MODIS and ERA5-Land cross-checks.',
            )}
          </li>
        </ol>
      </Section>

      <Section title={t('Tarla sınırları (segmentasyon)', 'Field boundaries (segmentation)')}>
        <p>
          {t(
            `Elle çizilmiş ${seg.reference.drawn} referans tarla; ayar ve test yarıları ayrı. Test yarısında (${segTest.n_reference} tarla) IoU ortalama ${fmt(segTest.iou_mean, 2)}, ortanca ${fmt(segTest.iou_median, 2)}; IoU ≥ 0,5 olan tarla payı ${pct(segTest.share_iou_ge_0_5)}. Birden fazla parçaya bölünen referans tarla payı: ${pct(segTest.over_segmented_share)}.`,
            `${seg.reference.drawn} reference fields drawn by hand, split into tuning and test halves. On the test half (${segTest.n_reference} fields) mean IoU ${fmt(segTest.iou_mean, 2)}, median ${fmt(segTest.iou_median, 2)}; share of fields with IoU ≥ 0.5: ${pct(segTest.share_iou_ge_0_5)}. Share of reference fields split into several pieces: ${pct(segTest.over_segmented_share)}.`,
          )}
        </p>
      </Section>

      <Section title={t('Ürün sınıfları', 'Crop classes')}>
        <p className="font-medium text-amber-800">
          {t(
            'Bağımsız doğruluk ölçülmedi; sınıflar "uydu eğrisinden tahmin" olarak gösterilir.',
            'Independent accuracy was not measured; classes are shown as "estimated from the satellite curve".',
          )}
        </p>
        <p>
          {t(
            `Kör etiketlerle uyum: ${blind.agree}/${blind.n} (%95 aralık ${pct(blind.ci95[0])}–${pct(blind.ci95[1])}). Makullük kontrolü (bağımsız değil): ${plaus.checked} tarlada ${plaus.agree} uygun, ${plaus.unsure} emin değilim. Belirsiz tarla payı ${uncertainShares}.`,
            `Agreement with blind labels: ${blind.agree}/${blind.n} (95% interval ${pct(blind.ci95[0])}–${pct(blind.ci95[1])}). Plausibility check (not independent): of ${plaus.checked} fields, ${plaus.agree} plausible, ${plaus.unsure} unsure. Share of uncertain fields ${uncertainShares}.`,
          )}
        </p>
      </Section>

      <Section title={t('Referans ET ve yağış (Open-Meteo / ERA5-Land)', 'Reference ET and rainfall (Open-Meteo / ERA5-Land)')}>
        <table className="w-full text-left text-xs">
          <thead className="text-soil-500">
            <tr>
              <th className="font-medium">{t('Sezon', 'Season')}</th>
              <th className="font-medium">{t('Günlük ET₀ r', 'Daily ET₀ r')}</th>
              <th className="font-medium">RMSE mm</th>
              <th className="font-medium">{t('Sezon ET₀ mm (OM / ERA5)', 'Season ET₀ mm (OM / ERA5)')}</th>
              <th className="font-medium">{t('Yağış mm (OM / ERA5)', 'Rainfall mm (OM / ERA5)')}</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y} className="border-t border-soil-100">
                <td>{y}</td>
                <td>{fmt(et0[y].daily_et0_r, 3)}</td>
                <td>{fmt(et0[y].daily_et0_rmse_mm, 2)}</td>
                <td>
                  {fmt(et0[y].season_et0_mm_open_meteo)} / {fmt(et0[y].season_et0_mm_era5_pm)}
                </td>
                <td>
                  {fmt(et0[y].season_precip_mm_open_meteo)} / {fmt(et0[y].season_precip_mm_era5)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={t('Gerçek ET ve mavi su (NDVI-Kc)', 'Actual ET and blue water (NDVI-Kc)')}>
        <p>
          {t(
            `NDVI aralığı ${fmt(et.ndvi_min, 3)}–${fmt(et.ndvi_max, 3)} (pilot persentilleri). Pilot mavi su: ${pilotBlue}.`,
            `NDVI range ${fmt(et.ndvi_min, 3)}–${fmt(et.ndvi_max, 3)} (pilot percentiles). Pilot blue water: ${pilotBlue}.`,
          )}
        </p>
      </Section>

      <Section title={t('Bağımsız kontrol: SEBAL (Landsat) ve MODIS', 'Independent check: SEBAL (Landsat) and MODIS')}>
        <table className="w-full text-left text-xs">
          <thead className="text-soil-500">
            <tr>
              <th className="font-medium">{t('Sezon', 'Season')}</th>
              <th className="font-medium">{t('Geçiş', 'Overpasses')}</th>
              <th className="font-medium">SEBAL / NDVI-Kc</th>
              <th className="font-medium">r</th>
              <th className="font-medium">{t('RMSE mm/gün', 'RMSE mm/day')}</th>
              <th className="font-medium">{t('Göreli düşük ET', 'Relatively low ET')}</th>
              <th className="font-medium">{t('MODIS sezon mm', 'MODIS season mm')}</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => {
              const s = sebal[y];
              const o = s.comparison.overall.cropped;
              return (
                <tr key={y} className="border-t border-soil-100">
                  <td>{y}</td>
                  <td>{s.overpasses_used}</td>
                  <td>{fmt(o.ratio_sebal_to_ndvikc, 2)}</td>
                  <td>{fmt(o.r, 2)}</td>
                  <td>{fmt(o.rmse_mm, 1)}</td>
                  <td>
                    {fmt(s.comparison.stress_fields)} / {fmt(s.comparison.fields_with_obs)}
                  </td>
                  <td>
                    {fmt(s.modis_mod16_season_mm_cropland)} (NDVI-Kc {fmt(s.ndvikc_season_et_mm_area_weighted)})
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-soil-600">
          {t(
            "SEBAL ekili günlerde NDVI-Kc'nin yaklaşık üçte ikisini veriyor. Fark büyük ölçüde yöntemsel: yaz aylarında günlük net ışınım ET₀'ın altında kalıyor ve klasik SEBAL çevreden gelen ek ısıyı (adveksiyon) saymıyor. Bu yüzden kalibrasyon uygulanmadı. SEBAL değerleri her üründe Konya tarla deneylerinin de altında kalıyor (aşağıdaki karşılaştırma). MODIS (500 m, sulama bilgisi yok) sulu tarımda ölçüt olarak kullanılamaz.",
            'On cropped days SEBAL gives about two-thirds of NDVI-Kc. The gap is mostly methodological: in summer daily net radiation stays below ET₀, and classic SEBAL does not count the extra heat brought in from the surroundings (advection). So no calibration was applied. SEBAL values are also below the Konya field trials for every crop (comparison below). MODIS (500 m, no irrigation information) cannot serve as a benchmark for irrigated farming.',
          )}
        </p>
      </Section>

      <Section title={t('Konya tarla deneyleriyle karşılaştırma', 'Comparison with Konya field trials')}>
        <p className="text-xs text-soil-600">
          {t(
            "Bitkinin tarlada olduğu günlerdeki NDVI-Kc ET'si (ürünü belirsiz olmayan tarlaların ortancası) ile Konya'da yayımlanmış tarla deneylerinin sezonluk su tüketimi.",
            'NDVI-Kc ET on the days the crop is in the field (median of fields with a confident crop class) against the seasonal water use of field trials published in Konya.',
          )}
        </p>
        <table className="w-full text-left text-xs">
          <thead className="text-soil-500">
            <tr>
              <th className="font-medium">{t('Ürün', 'Crop')}</th>
              {years.map((y) => (
                <th key={y} className="font-medium">
                  {t('Uydu', 'Satellite')} {y}
                </th>
              ))}
              <th className="font-medium">{t('Konya deneyleri', 'Konya trials')}</th>
              <th className="font-medium">{t('Kaynak', 'Source')}</th>
            </tr>
          </thead>
          <tbody>
            {KONYA_TRIALS.map((r) => (
              <tr key={r.cls} className="border-t border-soil-100 align-top">
                <td>{names[r.cls] ?? r.cls}</td>
                {years.map((y) => {
                  const v = cropEt[y]?.[r.cls];
                  return <td key={y}>{v ? `${fmt(v.median)} mm (${fmt(v.p25)}–${fmt(v.p75)})` : '–'}</td>;
                })}
                <td>{lang === 'en' ? r.trial_en : r.trial}</td>
                <td className="text-soil-500">{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-soil-600">
          {t(
            'Pancar ve ayçiçeğinde uydu tahmini deneylerin içinde veya biraz altında; mısırda tam sulama değerlerinin biraz üstünde; sulu kışlık tahılda belirgin şekilde yüksek (1 Mart öncesi dahil edilmediği hâlde). Kışlık tahıl tüketimi bir üst tahmin olarak okunmalıdır. Deneyler tek yer ve yılda, çoğunlukla damla sulamayla yapılmıştır; karşılaştırma ürün bazında büyüklük sırasını sınar, tek tarlayı değil.',
            'For sugar beet and sunflower the satellite estimate is within or slightly below the trials; for maize slightly above full-irrigation values; for irrigated winter cereal clearly higher (even though days before 1 March are excluded). Winter cereal use should be read as an upper estimate. The trials come from single sites and years, mostly under drip irrigation; the comparison tests the order of magnitude per crop, not single fields.',
          )}
        </p>
      </Section>

      <Section title={t('Bütçe parametreleri', 'Budget parameters')}>
        <ul className="list-disc space-y-1 pl-5 text-xs">
          <li>
            {t(
              `Durum: oran ≤ ${fmt(p.status_within, 2)} bütçe içinde, ≤ ${fmt(p.status_limit, 2)} sınırda, üstü aşım.`,
              `Status: ratio ≤ ${fmt(p.status_within, 2)} within budget, ≤ ${fmt(p.status_limit, 2)} borderline, above that over.`,
            )}
          </li>
          <li>{t(`S2 azaltımı %${fmt(p.s2_reduction * 100)} (varsayım, politika hedefi).`, `S2 reduction ${fmt(p.s2_reduction * 100)}% (assumption, policy target).`)}</li>
          <li>
            {t(
              `Enerji (varsayım): basma ${p.head_m} m, pompa-motor verimi ${fmt(p.pump_efficiency, 2)}, sulama verimi ${fmt(p.irrigation_efficiency[p.default_method], 2)} (${p.default_method === 'sprinkler' ? 'yağmurlama' : p.default_method}).`,
              `Energy (assumption): head ${p.head_m} m, pump-motor efficiency ${fmt(p.pump_efficiency, 2)}, irrigation efficiency ${fmt(p.irrigation_efficiency[p.default_method], 2)} (${p.default_method}).`,
            )}
          </li>
          <li>
            {t(
              `Açık sulama kaldıracı: sezon ET'si %${fmt(p.deficit_et_reduction * 100)} azaltılır; verim kaybı yalnızca doğrulanmış Ky ile (yoncada yok).`,
              `Deficit irrigation lever: season ET cut by ${fmt(p.deficit_et_reduction * 100)}%; yield loss only with a verified Ky (none for alfalfa).`,
            )}
          </li>
        </ul>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-soil-500">
            <tr>
              <th className="font-medium">
                {t('Ürün', 'Crop')} ({years[0]})
              </th>
              <th className="font-medium">{t('Tarla', 'Fields')}</th>
              <th className="font-medium">{t('Ölçülen mm', 'Measured mm')}</th>
              <th className="font-medium">{t('Referans mm', 'Reference mm')}</th>
              <th className="font-medium">{t('Aşım S1', 'Over S1')}</th>
              <th className="font-medium">{t('Aşım S2', 'Over S2')}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(budget.seasons[years[0]].classes as Obj).map(([c, v]) => (
              <tr key={c} className="border-t border-soil-100">
                <td>{names[c] ?? c}</td>
                <td>{v.fields}</td>
                <td>{fmt(v.measured_mm_median)}</td>
                <td>{fmt(v.reference_mm_median)}</td>
                <td>{pct(v.over_s1_share)}</td>
                <td>{pct(v.over_s2_share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={t('Zemin çökmesi (yayımlanmış çalışmalar)', 'Land subsidence (published studies)')}>
        <p className="text-xs text-soil-600">
          {t(
            "EGMS Türkiye'yi kapsamadığı için harita katmanı yok; hakemli InSAR/GNSS çalışmalarından özetler:",
            'EGMS does not cover Türkiye, so there is no map layer; summaries of peer-reviewed InSAR/GNSS studies:',
          )}
        </p>
        <ul className="list-disc space-y-0.5 pl-5 text-xs">
          {KONYA_SUBSIDENCE.map((s) => (
            <li key={s.doi}>
              {lang === 'en' ? s.finding_en : s.finding} — {s.citation},{' '}
              <a className="underline" href={`https://doi.org/${s.doi}`} target="_blank" rel="noreferrer">
                doi:{s.doi}
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('Veri kaynakları', 'Data sources')}>
        <ul className="list-disc space-y-0.5 pl-5 text-xs">
          {SOURCES.map(([s, use]) => (
            <li key={s}>
              <span className="font-medium">{s}</span> — {use}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('Sınırlar', 'Limits')}>
        <ul className="list-disc space-y-1 pl-5 text-xs">
          {LIMITS.map(([tr, en]) => (
            <li key={en}>{t(tr, en)}</li>
          ))}
        </ul>
      </Section>
      <p className="text-xs text-soil-500">
        {t('Veri üretimi', 'Data generated')}: {new Date(manifest.generated_at).toLocaleString(locale)}
      </p>
    </div>
  );
}
