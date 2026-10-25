// "Yöntem ve Doğrulama": data sources, method summary, every metric in metrics.json, limits.

import { useEffect, useState, type ReactNode } from 'react';
import { fmt } from '../components/ui';
import { loadMetrics, type Manifest, type Metrics } from './data';

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const pct = (v: number) => `%${fmt(v * 100)}`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-soil-200 bg-white p-4 text-sm text-soil-800">
      <h2 className="text-base font-semibold text-soil-900">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

const SOURCES: [string, string][] = [
  ['Sentinel-2 L2A (COPERNICUS/S2_SR_HARMONIZED)', 'NDVI/NDMI zaman serileri, tarla sınırları'],
  ['Sentinel-1 GRD', 'Sınıflandırmaya ek özellik'],
  ['Landsat 8/9 C2 L2', 'Yüzey sıcaklığı, SEBAL doğrulaması'],
  ['ESA WorldCover 2021', 'Tarım alanı maskesi'],
  ['Open-Meteo arşivi', 'Günlük ET₀ (FAO-56) ve yağış'],
  ['ERA5-Land (saatlik/günlük)', 'ET₀ ve yağış çapraz kontrolü, SEBAL meteorolojisi'],
  ['MODIS MOD16A2GF', 'Sezonluk ET karşılaştırması'],
  ['GRACE/GRACE-FO JPL mascon RL06.3 CRI', 'Havza toplam su depolaması'],
  ['GLDAS 2.1 Noah', 'Toprak nemi, kar, bitki üstü su'],
  ['HydroSHEDS seviye 5', 'Konya Kapalı Havzası sınırı'],
  ['FAO-56 (Allen vd. 1998), FAO-33 Ky (FAO/IAEA tablosu)', 'Bitki katsayıları, verim tepki katsayıları'],
];

export default function MethodView({ manifest }: { manifest: Manifest }) {
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadMetrics().then(setM, () => setError('Metrikler yüklenemedi.'));
  }, []);
  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!m) return <p className="text-sm text-soil-500">Yükleniyor…</p>;

  const seg = m.segmentation as Obj;
  const cls = m.classification as Obj;
  const et0 = m.et0_crosscheck as Obj;
  const et = m.et_ndvikc as Obj;
  const sebal = m.sebal as Obj;
  const budget = m.budget as Obj;
  const p = manifest.budget_parameters;
  const names = manifest.classes;
  const years = Object.keys(et.seasons).sort().reverse();

  return (
    <div className="space-y-4">
      <Section title="Yöntem özeti">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Tarla sınırları: Sentinel-2 NDVI yanlış renk görüntüsünde SAM ile otomatik bölütleme ({fmt(seg.n_fields)} tarla, ortanca {fmt(seg.median_field_ha, 1)} ha).</li>
          <li>Ürün: NDVI/NDMI eğrilerinin denetimsiz kümelenmesi ve açık fenoloji kurallarıyla adlandırma. Doğruluğu ölçülmedi.</li>
          <li>Gerçek ET: ölçeklenmiş NDVI → Kcb (FAO-56) + toprak buharlaşması, × ET₀; stres yok varsayımı.</li>
          <li>Mavi su: bitkinin tarlada olduğu günlerde ET − etkili yağış; kuru tahıl ve nadasta 0.</li>
          <li>Bütçe: aynı ürünün pilottaki tipik bitki eğrisi + damla sulamada beklenen buharlaşma (S1); S2 pilot toplamını %{fmt(p.s2_reduction * 100)} azaltır (varsayım).</li>
          <li>Doğrulama: Landsat ile bağımsız enerji dengesi (SEBAL), MODIS, ERA5-Land çapraz kontrolleri.</li>
        </ol>
      </Section>

      <Section title="Tarla sınırları (segmentasyon)">
        <p>
          Elle çizilmiş {seg.reference.drawn} referans tarla; ayar ve test yarıları ayrı. Test yarısında ({seg.selected_metrics.test.n_reference} tarla) IoU
          ortalama {fmt(seg.selected_metrics.test.iou_mean, 2)}, ortanca {fmt(seg.selected_metrics.test.iou_median, 2)}; IoU ≥ 0,5 olan tarla payı{' '}
          {pct(seg.selected_metrics.test.share_iou_ge_0_5)}. Birden fazla parçaya bölünen referans tarla payı: {pct(seg.selected_metrics.test.over_segmented_share)}.
        </p>
      </Section>

      <Section title="Ürün sınıfları">
        <p className="font-medium text-amber-800">Bağımsız doğruluk ölçülmedi; sınıflar "uydu eğrisinden tahmin" olarak gösterilir.</p>
        <p>
          Kör etiketlerle uyum: {cls.blind_labels.agree}/{cls.blind_labels.n} (%95 aralık {pct(cls.blind_labels.ci95[0])}–{pct(cls.blind_labels.ci95[1])}). Makullük kontrolü
          (bağımsız değil): {cls.plausibility_check.checked} tarlada {cls.plausibility_check.agree} uygun, {cls.plausibility_check.unsure} emin değilim. Belirsiz tarla
          payı {years.map((y) => `${y}: ${pct(cls.seasons[y].uncertain_share)}`).join(', ')}.
        </p>
      </Section>

      <Section title="Referans ET ve yağış (Open-Meteo / ERA5-Land)">
        <table className="w-full text-left text-xs">
          <thead className="text-soil-500">
            <tr>
              <th className="font-medium">Sezon</th>
              <th className="font-medium">Günlük ET₀ r</th>
              <th className="font-medium">RMSE mm</th>
              <th className="font-medium">Sezon ET₀ mm (OM / ERA5)</th>
              <th className="font-medium">Yağış mm (OM / ERA5)</th>
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

      <Section title="Gerçek ET ve mavi su (NDVI-Kc)">
        <p>
          NDVI aralığı {fmt(et.ndvi_min, 3)}–{fmt(et.ndvi_max, 3)} (pilot persentilleri). Pilot mavi su:{' '}
          {years.map((y) => `${y}: ${fmt(et.seasons[y].pilot_blue_mm3)} milyon m³ (${fmt(et.seasons[y].pilot_blue_mm3_range[0])}–${fmt(et.seasons[y].pilot_blue_mm3_range[1])})`).join('; ')}.
        </p>
      </Section>

      <Section title="Bağımsız kontrol: SEBAL (Landsat) ve MODIS">
        <table className="w-full text-left text-xs">
          <thead className="text-soil-500">
            <tr>
              <th className="font-medium">Sezon</th>
              <th className="font-medium">Geçiş</th>
              <th className="font-medium">SEBAL / NDVI-Kc</th>
              <th className="font-medium">r</th>
              <th className="font-medium">RMSE mm/gün</th>
              <th className="font-medium">Göreli düşük ET</th>
              <th className="font-medium">MODIS sezon mm</th>
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
          SEBAL ekili günlerde NDVI-Kc'nin yaklaşık üçte ikisini veriyor. Fark büyük ölçüde yöntemsel: yaz aylarında günlük net ışınım ET₀'ın
          altında kalıyor ve klasik SEBAL çevreden gelen ek ısıyı (adveksiyon) saymıyor. Bu yüzden kalibrasyon uygulanmadı; gerçek değer büyük
          olasılıkla iki yöntemin arasında. MODIS (500 m, sulama bilgisi yok) sulu tarımda ölçüt olarak kullanılamaz.
        </p>
      </Section>

      <Section title="Bütçe parametreleri">
        <ul className="list-disc space-y-1 pl-5 text-xs">
          <li>Durum: oran ≤ {fmt(p.status_within, 2)} bütçe içinde, ≤ {fmt(p.status_limit, 2)} sınırda, üstü aşım.</li>
          <li>S2 azaltımı %{fmt(p.s2_reduction * 100)} (varsayım, politika hedefi).</li>
          <li>
            Enerji (varsayım): basma {p.head_m} m, pompa-motor verimi {fmt(p.pump_efficiency, 2)}, sulama verimi{' '}
            {fmt(p.irrigation_efficiency[p.default_method], 2)} ({p.default_method === 'sprinkler' ? 'yağmurlama' : p.default_method}).
          </li>
          <li>Açık sulama kaldıracı: sezon ET'si %{fmt(p.deficit_et_reduction * 100)} azaltılır; verim kaybı yalnızca doğrulanmış Ky ile (yoncada yok).</li>
        </ul>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-soil-500">
            <tr>
              <th className="font-medium">Ürün ({years[0]})</th>
              <th className="font-medium">Tarla</th>
              <th className="font-medium">Ölçülen mm</th>
              <th className="font-medium">Referans mm</th>
              <th className="font-medium">Aşım S1</th>
              <th className="font-medium">Aşım S2</th>
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

      <Section title="Veri kaynakları">
        <ul className="list-disc space-y-0.5 pl-5 text-xs">
          {SOURCES.map(([s, use]) => (
            <li key={s}>
              <span className="font-medium">{s}</span> — {use}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Sınırlar">
        <ul className="list-disc space-y-1 pl-5 text-xs">
          <li>Uydu tüketimi (ET) görür; toprağa sızan fazla sulama suyunu ve pompalanan hacmi görmez.</li>
          <li>Sahada ölçüm (akı kulesi, lizimetre) ve doğrulanmış ürün bilgisi yok; ET ve sınıflar uydu tahminidir.</li>
          <li>NDVI-Kc stres yok ve her 7 günde bir ıslatma varsayar; değerler büyük olasılıkla aralığın üst tarafındadır.</li>
          <li>Sulama yöntemi, basma yüksekliği ve pompa verimi tarla bazında bilinmiyor; enerji rakamları varsayımdır.</li>
          <li>Obruk sayısı, yeraltı suyu düşüş miktarı, ruhsatsız kuyu sayısı gibi doğrulanmamış rakamlar kullanılmaz.</li>
        </ul>
      </Section>
      <p className="text-xs text-soil-500">Veri üretimi: {new Date(manifest.generated_at).toLocaleString('tr-TR')}</p>
    </div>
  );
}
