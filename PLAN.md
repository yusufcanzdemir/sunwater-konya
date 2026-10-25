# Konya Su Bütçesi – Ana Plan ve Teknik Spesifikasyon (v2)

> Bu dosya projenin tek doğruluk kaynağıdır. Proje köküne `PLAN.md` olarak koy.
> Claude Code her aşamaya başlamadan önce ilgili bölümü okur, **Karar Kapısı (KK)** işaretli yerlerde durur ve kullanıcıya sorar. Kullanıcının onayı olmadan bir KK'yı geçmez.

---

## 0. Ürün tanımı

Konya Kapalı Havzası'nda seçilen pilot bölgedeki her tarlanın bir sezonda ne kadar yeraltı suyu tükettiğini uydudan ölçen, bunu bir su bütçesiyle karşılaştıran, bütçeyi aşan tarlaları kurum paneline gösteren ve çiftçiye durumunu ve güneşe göre sulama planını Telegram üzerinden ileten sistem.

Temel ölçü: **mavi su tüketimi (blue ET)** = gerçek evapotranspirasyon − etkili yağış. Kapalı havzada yeraltı suyunu fiilen tüketen büyüklük budur; pompalanan su miktarı değil.

### Alınmış kararlar (Karar Kaydı)
| # | Karar | Seçim | Durum |
|---|---|---|---|
| D1 | Ana kullanıcı | Kurum paneli + çiftçiye Telegram | Kesin |
| D2 | Tarla sınırları | Otomatik segmentasyon + elle düzeltme | Kesin |
| D3 | ET yöntemi | Sentinel-2 NDVI-Kc ana yöntem + Landsat SEBAL doğrulama | Kesin |
| D4 | Pilot bölge | Karapınar kuzey/kuzeybatısı, bbox [33.30, 37.70, 33.60, 37.90], ~586 km², %54 tarım (WorldCover); havza bağlamı için Konya Kapalı Havzası tamamı (HydroSHEDS seviye 5, 58.374 km²) | Kesin (KK1) |
| D5 | Sezonlar | 2025 (ana), 2024 (karşılaştırma) | Kesin (KK1) |
| D6 | Teknoloji yığını | Python + Earth Engine işleme hattı; önceden hesaplanmış GeoParquet/PMTiles; mevcut React uygulaması + MapLibre; Vercel fonksiyonları | Kesin (KK1) |
| D7 | Mesaj kanalı | Prototipte Telegram, üründe WhatsApp | Kesin |
| D8 | GRACE kaynağı (KK0) | Earth Engine `NASA/GRACE/MASS_GRIDS_V04/MASCON`, 2002-04 – 2024-09; serinin bitişi grafikte gösterilir, PO.DAAC indirmesi yok | Kesin |
| D9 | Zemin çökmesi (KK0) | EGMS Türkiye'yi kapsamıyor; harita katmanı yok, yalnızca yayımlanmış InSAR çalışmalarına atıf (kural 7) | Kesin |
| D10 | Segmentasyon yöntemi (KK2) | Yöntem B: SAM ViT-H (`segment-anything`, segment-geospatial yerine doğrudan), 2025 NDVI Mayıs/Temmuz/Ağustos yanlış renk girdisi, 512 px karolar. Test yarısında IoU ort. 0,68 / medyan 0,75 (SNIC en iyi: 0,60 / 0,65). 3.448 tarla | Kesin |
| D11 | SNIC + birleştirme (KK2) | Denendi (03b), SNIC size=30'u geçmedi (test IoU 0,57); plana eklenmedi. Küçük parça temizliği şimdilik yok, etiketlemede sık görülürse yeniden değerlendirilir | Kesin |
| D13 | Sınıflar ve etiket hedefi (KK3) | şeker pancarı, mısır, ayçiçeği, yonca, sulu kışlık tahıl, kuru kışlık tahıl, tahıl + ikinci ürün, nadas/boş, diğer (+ "emin değilim"); sınıf başına ≥40, toplam 300–500; önce rastgele sıra, gerekirse hedefli seçim (ayrı işaretlenir); yer gerçeği yok, etiketler görüntü yorumu olarak belgelenir | Kesin |
| D14 | Sınıflandırma yöntemi (Aşama 4/6 değişikliği) | 300–500 elle etiket yerine: NDVI/NDMI profillerinin denetimsiz kümelenmesi (Gaussian karışım modeli), küme ortalamalarının config'teki açık fenoloji kurallarıyla adlandırılması, sınıf olasılığı = küme olasılıklarının toplamı. LightGBM kullanılmıyor. Kontrol: rastgele 50 tarlada kullanıcı önerilen sınıfı "uygun / değil / emin değilim" diye işaretler; sonuç "makullük kontrolü" olarak raporlanır (bağımsız doğruluk değil). Daha önce kör girilen etiketler ayrıca karşılaştırılır | Kesin |
| D15 | Sınıflandırma kabulü (KK4) | Ölçülmüş doğruluk yok; sınıflar panelde "uydu eğrisinden tahmin, doğruluğu ölçülmedi" etiketiyle, belirsiz tarlalar (%13) işaretli gösterilir. Sahadan ürün bilgisi bulunursa doğruluk ölçülür | Kesin |
| D16 | Mavi su dönemi (Aşama 8) | Mavi ET yalnızca bitkinin tarlada olduğu günlerde (Kcb > 0,30) hesaplanır: max(0, ET − Peff) o günler üzerinden. Ekim öncesi / hasat sonrası çıplak toprak buharlaşması yeraltı suyu sayılmaz (yağış ve depolanmış toprak suyu). Sezon formülüne göre pilot toplamı ~%11 düşük | Kesin |
| D17 | ET kalibrasyonu (KK5) | SEBAL ile kalibrasyon yok; NDVI-Kc ana tahmin. SEBAL ekili günlerde NDVI-Kc'nin %59–66'sı; fark büyük ölçüde yapısal (adveksiyon: yaz Rn24 ≈ 6,4 mm/gün < ET0 ≈ 7,6). SEBAL sonucu belgede ve panelde NDVI-Kc'nin yanında belirtilir. Su stresi bayrağı göreli: aynı gün aynı sınıfın medyanına oranı < 0,75 (varsayım), en az 3 geçiş; yağışa dayalı sınıflar hariç (2025: 127, 2024: 119 tarla) | Kesin |
| D18 | GRACE ürünü (Aşama 10) | Ana seri `NASA/GRACE/MASS_GRIDS_V04/MASCON_CRI` (JPL'in önerdiği CRI filtreli sürüm, D8 ile aynı dönem); filtresiz MASCON ve CSR/GFZ/JPL küresel harmonik (2017'ye kadar) duyarlılık için. Eğilim tek değil dönem bazında sunulur (GRACE / GRACE-FO), çünkü düşüş 2018 sonrası hızlanıyor | Kesin |
| D19 | Bütçe (KK6) | Referans ihtiyaç = sınıfın günlük ortanca Kcb eğrisi + damla sulama toprak buharlaşması (fw 0,35, FAO-56 Tablo 20). Tarla durumu S1'e göre (≤1,00 içi, ≤1,15 sınırda, üstü aşım); S2 azaltımı %20 (varsayım, seçilebilir). Durum dili "verimli sulamaya göre tasarruf potansiyeli": uydu tüketimi görür, sızmayla kaybı görmez; aynı sulama varsayımıyla komşu karşılaştırmasında aşım ~%2. Enerji: basma 120 m, pompa 0,50, yağmurlama 0,72 — varsayım etiketli, tarla bazında düzenlenebilir. Açık sulama verim kaybı yalnızca doğrulanmış Ky ile (FAO/IAEA tablosu: mısır 1,25, pancar 0,80–0,90, ayçiçeği 0,95, buğday 1,00); yoncada yok | Kesin |
| D20 | Vektör karolar (Aşama 12) | tippecanoe yerine GDAL PMTiles sürücüsü (pyogrio içindeki GDAL 3.12, ek kurulum yok); katman `fields`, zoom 9–15. Planda olmayan ek: tüm harita sezon oynatıcısı için haftalık kümülatif mavi ET dosyası `season_{sezon}.json`. Barındırma: repoda `public/data` (Vercel statik; GeoParquet hariç, ~42 MB), `12_export.py` her çalıştırmada yeniler | Kesin |
| D21 | Kurum paneli (Aşama 13) | Panel mevcut uygulamada `/panel` sayfası (vercel.json rewrite); `/web` klasörüne taşıma yapılmadı (kökteki api/, Vite ve Vercel yapılandırması bozulmasın diye). MapLibre GL 6 + PMTiles; durum renkleri sabit durum paleti + yazılı etiket; belirsiz ürün kesikli sınır; harita karoları 8 m sadeleştirilmiş (10 m piksel basamakları). Doğal dil sorgusu `/api/parse-query` (Gemini yapılandırılmış çıktı → `src/panel/query.ts` şemasıyla temizlenir); bölge yalnızca pilot alanın yarıları (kuzey/güney/doğu/batı/orta), pilot dışı yer adları reddedilip not olarak gösterilir. Filtreler, kartlar, liste ve CSV aynı süzülmüş tarla kümesini kullanır (`fields_{sezon}.json`) | Kesin |
| D12 | Referans tarlalar | 70 rastgele tarım noktası, 66 elle çizilmiş tarla (`pipeline/reference/`); tek numaralı noktalar ayar, çift numaralılar test için | Kesin |

Yeni bir karar alındığında bu tabloya satır eklenir.

---

## 1. Değişmez kurallar

1. **Ölçülmemiş hiçbir şey ölçülmüş gibi sunulmaz.** Her sayı ya bir veri kaynağından ya bir hesaptan gelir; varsayımlar arayüzde "varsayım" etiketiyle görünür.
2. **LLM hesap yapmaz.** Gemini yalnızca doğal dil → yapılandırılmış sorgu/veri çevirisi ve hesaplanmış sonuçların sade Türkçe açıklaması için kullanılır; açıklamalarda sayı doğrulama kontrolü zorunludur.
3. **Tekrarlanabilirlik.** Tüm işleme hattı `pipeline/config.yaml` ile parametrelenir, adımlar numaralı betiklerdir, her adım çıktısını diske yazar ve önbellekten devam edebilir.
4. **Doğrulama birinci sınıf vatandaştır.** Her model çıktısının yanında doğruluk metriği veya çapraz kontrol bulunur; metrikler panelde "Yöntem ve Doğrulama" sayfasında gösterilir.
5. **Belirsizlik gösterilir.** Tarla bazlı tüketim ve bütçe değerleri aralıkla verilir.
6. **Mevcut kod korunur.** Önceki prototipteki FAO-56 motoru, güneş planlama, Gemini fonksiyonları ve Telegram botu yeni yapıya taşınır, yeniden yazılmaz.
7. **Doğrulanmamış veri kullanılmaz.** Obruk sayısı, yeraltı suyu düşüş miktarı, ruhsatsız kuyu sayısı gibi doğrulanmamış rakamlar hiçbir ekranda ve dokümanda yer almaz.
8. Arayüz Türkçe, kod ve README İngilizce.

---

## 2. Repo yapısı

```
/pipeline            Python işleme hattı (Earth Engine + yerel)
  config.yaml
  00_setup_check.py
  01_aoi.py
  02_composites.py
  03_segmentation.py
  04_labels/         etiketleme araçları ve etiket dosyaları
  05_features.py
  06_classify.py
  07_et0.py
  08_et_ndvikc.py
  09_sebal_validation.py
  10_basin_context.py
  11_budget.py
  12_export.py
  lib/               ortak fonksiyonlar (ee yardımcıları, FAO-56, metrikler)
  tests/
  outputs/           (git dışı) ara ve nihai çıktılar
/web                 Mevcut React uygulaması (panel + çiftçi görünümü)
/api                 Vercel fonksiyonları (Gemini, Telegram, veri servis)
/docs                METHODOLOGY.md, VALIDATION.md, DATA_SOURCES.md
PLAN.md
```

---

## 3. Veri kaynakları

| Veri | Kaynak (Earth Engine ID veya servis) | Kullanım |
|---|---|---|
| Sentinel-2 L2A | `COPERNICUS/S2_SR_HARMONIZED` | NDVI, EVI, NDMI zaman serileri, segmentasyon |
| Sentinel-2 bulut skoru | `GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED` | Bulut maskesi (cs_cdf ≥ 0.6, ayarlanabilir) |
| Landsat 8/9 C2 L2 | `LANDSAT/LC08/C02/T1_L2`, `LANDSAT/LC09/C02/T1_L2` | Yüzey sıcaklığı, SEBAL |
| Sentinel-1 GRD (opsiyonel) | `COPERNICUS/S1_GRD` | Sınıflandırmaya ek özellik |
| Arazi örtüsü | `ESA/WorldCover/v200` | Tarım alanı maskesi |
| WorldCereal | Earth Engine kataloğunda erişimi kontrol edilecek | Zayıf etiket / çapraz kontrol (2021, ürün rotasyonu nedeniyle doğrudan etiket değil) |
| Havza sınırı | `WWF/HydroSHEDS/v1/Basins/hybas_6` (veya uygun seviye) | Konya Kapalı Havzası sınırı |
| ET₀, yağış | Open-Meteo Historical API (FAO-56 ET₀) | Günlük referans ET ve yağış |
| ERA5-Land (alternatif/doğrulama) | `ECMWF/ERA5_LAND/DAILY_AGGR` | ET₀ çapraz kontrol, SEBAL meteorolojisi |
| MODIS ET | `MODIS/061/MOD16A2GF` | Toplu ölçekte çapraz kontrol |
| GRACE/GRACE-FO | `NASA/GRACE/MASS_GRIDS_V04/MASCON` | Havza toplam su depolama eğilimi |
| GLDAS | `NASA/GLDAS/V021/NOAH/G025/T3H` | Toprak nemi/kar çıkarılarak yeraltı suyu bileşeni |
| Yüksek çözünürlüklü görüntü | Esri World Imagery (görsel etiketleme) | Elle etiketleme desteği |
| Zemin çökmesi | European Ground Motion Service – Türkiye kapsamı kontrol edilecek; yoksa yayımlanmış InSAR çalışmaları | Bağlam |

Tüm ID'ler Aşama 0'da `00_setup_check.py` ile erişilebilirlik açısından test edilir; erişilemeyen kaynak KK0'da kullanıcıya raporlanır.

---

## 4. Aşamalar

### Aşama 0 – Kurulum ve erişim kontrolü
- Earth Engine: ticari olmayan kullanım kaydı, Google Cloud projesi, `earthengine-api`, `geemap`, kimlik doğrulama.
- Python ortamı: `uv` veya `conda`; bağımlılıklar `pyproject.toml`'da.
- `00_setup_check.py`: Bölüm 3'teki her veri kaynağına küçük bir sorgu atar, sonuç tablosu basar.
- **KK0:** Erişim tablosu kullanıcıya gösterilir. Erişilemeyen kaynaklar için alternatif önerilir.

### Aşama 1 – Çalışma alanı
- `01_aoi.py`: Havza poligonu (HydroSHEDS'ten Konya merkezli kapalı havza seçimi, görsel kontrol için harita çıktısı).
- Pilot alan: varsayılan olarak Karapınar doğusundan Ereğli'ye uzanan tarım ovasında bir dikdörtgen; `config.yaml`'da `pilot_bbox`.
- Tarım maskesi: WorldCover `cropland` sınıfı.
- Çıktı: `aoi_basin.geojson`, `aoi_pilot.geojson`, pilot alan ve havza haritası PNG, pilot alandaki tarım alanı (km²).
- **KK1:** Kullanıcıya pilot alan haritası, alan büyüklüğü, tahmini tarla sayısı ve D4–D6 kararları sunulur; kesinleştirilir.

### Aşama 2 – Görüntü kompozitleri
- `02_composites.py`: Sezon (1 Mart – 31 Ekim) için bulut maskeli Sentinel-2 koleksiyonu.
- 10 günlük medyan kompozitler: NDVI, EVI, NDMI. Boşluklar zaman içinde doğrusal interpolasyonla doldurulur, boşluk oranı raporlanır.
- Segmentasyon için çok zamanlı yığın: ayın medyan NDVI'ları (Nisan–Eylül) + Temmuz RGB.
- Çıktı: Earth Engine asset'leri + küçük önizleme PNG'leri.

### Aşama 3 – Tarla segmentasyonu (D2)
- **Yöntem A (varsayılan, Earth Engine içinde):** Çok zamanlı NDVI yığını üzerinde `ee.Algorithms.Image.Segmentation.SNIC`; parametreler (`size`, `compactness`, `connectivity`) config'te. Segmentler vektöre çevrilir, tarım maskesiyle kesilir, 0,5 ha altı ve tarım dışı segmentler elenir.
- **Yöntem B (alternatif):** Pilot alanın 10 m kompoziti dışa aktarılır, `segment-geospatial` (SAM tabanlı) ile yerelde segmentlenir.
- Kalite ölçümü: Pilot alanda rastgele 50 tarla elle çizilir (referans); IoU ve aşırı/eksik bölünme oranları hesaplanır.
- Elle düzeltme: Çıktı GeoJSON'u web uygulamasındaki düzenleme modunda (Geoman) veya QGIS'te birleştirme/bölme ile düzeltilir; düzeltmeler `fields_corrected.geojson` olarak saklanır, işleme hattı bunu tercih eder.
- Çıktı: `fields.geojson` (field_id, geometri, alan_ha, segmentasyon_güveni).
- **KK2:** Yöntem A ve (denendiyse) B'nin IoU karşılaştırması ve örnek haritalar kullanıcıya sunulur; hangi yöntemle devam edileceği seçilir.

### Aşama 4 – Etiketleme
- Sınıflar (KK3'te kesinleşecek): şeker pancarı, mısır, ayçiçeği, yonca, sulu kışlık tahıl, kuru (sulanmayan) kışlık tahıl, nadas/boş, diğer.
- **Etiketleme aracı (web uygulamasında `/label` sayfası):** Rastgele bir tarla seçilir; NDVI ve NDMI eğrisi, sezon içinden 4 RGB küçük görüntü ve yüksek çözünürlüklü harita gösterilir; kullanıcı sınıf seçer veya "emin değilim" der. Etiketler `labels.csv`'ye (field_id, sınıf, güven, etiketleyen, tarih) yazılır.
- Fenoloji kuralları, etiketlemede yardımcı ipucu olarak gösterilir (otomatik etiket değildir):
  - Kışlık tahıl: Nisan–Mayıs zirvesi, Haziran sonu–Temmuz hasat düşüşü
  - Şeker pancarı: Mayıs'tan Ekim'e uzun yüksek NDVI platosu
  - Mısır: Temmuz–Ağustos zirvesi
  - Ayçiçeği: Haziran–Temmuz zirvesi, Ağustos'ta hızlı düşüş
  - Yonca: tekrarlayan biçim kaynaklı testere dişi NDVI
  - Kuru tahıl: sulu tahıla göre düşük ve erken düşen zirve, yazın düşük NDMI
- Hedef: sınıf başına en az 40, toplam 300–500 etiket; mekânsal olarak dağınık.
- WorldCereal 2021: yalnızca sulanan alan maskesi ve sınıf dağılımı için çapraz kontrol.
- **KK3:** Sınıf listesi ve hedef etiket sayısı kullanıcıyla kesinleştirilir; etiketleme sürecinde ara rapor (sınıf dağılımı) gösterilir.

### Aşama 5 – Özellik çıkarımı
- `05_features.py`: Her tarla için 10 günlük NDVI, EVI, NDMI dizileri (tarla içi medyan), harmonik regresyon katsayıları, zirve zamanı/değeri, yeşil dönem uzunluğu, Temmuz–Ağustos ortalama NDMI; opsiyonel Sentinel-1 VV/VH aylık ortalamaları.
- Earth Engine'de `reduceRegions` ile hesaplanır, Parquet olarak dışa aktarılır.
- Çıktı: `features_{sezon}.parquet`.

### Aşama 6 – Ürün sınıflandırma
- `06_classify.py`: Yerelde LightGBM (karşılaştırma için Random Forest).
- Doğrulama: **mekânsal blok çapraz doğrulama** (pilot alan 5–10 bloğa bölünür, komşu tarlalar arasındaki sızıntı önlenir). Raporlar: genel doğruluk, sınıf bazında F1, karışıklık matrisi, olasılık kalibrasyonu.
- Her tarla için sınıf ve olasılık; olasılığı eşiğin altındaki tarlalar "belirsiz" işaretlenir.
- İki sezon (2024, 2025) için tahmin.
- **KK4:** Metrikler kullanıcıya sunulur. Kabul eşiği önerisi: genel doğruluk ≥ %80, ana sınıflarda F1 ≥ 0,75. Eşiğin altındaysa: daha fazla etiket, Sentinel-1 ekleme veya sınıf birleştirme seçenekleri tartışılır.

### Aşama 7 – Referans ET ve yağış
- `07_et0.py`: Tarlalar Open-Meteo/ERA5 ızgara hücrelerine gruplanır; her hücre için günlük ET₀ ve yağış bir kez çekilir ve önbelleğe alınır.
- Çapraz kontrol: ERA5-Land'den FAO-56 Penman–Monteith ile hesaplanan ET₀ ile karşılaştırma (pilot alanın birkaç hücresinde).
- Etkili yağış: mevcut motordaki kural (P < 5 mm → 0; aksi 0,8·P), config'te değiştirilebilir.

### Aşama 8 – ET hesabı: NDVI-Kc (D3, ana yöntem)
- `08_et_ndvikc.py`:
  - Günlük NDVI: 10 günlük seriden yumuşatma (Savitzky–Golay veya harmonik uyum) ve günlük interpolasyon.
  - Temel ürün katsayısı, ölçeklenmiş NDVI yöntemiyle:
    `Kcb = Kcb_min + (Kcb_max − Kcb_min) × clamp((NDVI − NDVI_min)/(NDVI_max − NDVI_min), 0, 1)`
    `Kcb_min ≈ 0.15`, `Kcb_max` ürüne göre FAO-56 tablosundan, `NDVI_min` çıplak toprak (pilot alandan ampirik, ~0.15), `NDVI_max` tam örtü (ampirik, ~0.85–0.90). Tüm değerler config'te ve literatür kaynağıyla.
  - Toprak buharlaşması: FAO-56 ikili katsayı yaklaşımının basitleştirilmiş hâli (Ke), ıslanma olayları yağış ve tahmini sulama günlerinden.
  - `ET = (Kcb + Ke) × ET₀` (su stresi yok varsayımı; stres SEBAL ile kontrol edilir).
  - Kuru tahıl ve nadas sınıflarında su dengesi kısıtı: sezonluk ET, yağış + başlangıç toprak suyunu aşamaz.
  - Mavi su: `blue_ET = max(0, ET − Peff)`, sulanmayan sınıflarda 0.
- Çıktı: tarla bazında günlük ET serisi, sezonluk ET, mavi ET, belirsizlik aralığı (NDVI_min/max ve Kcb_max parametrelerine duyarlılıktan).

### Aşama 9 – SEBAL doğrulaması (D3)
- `09_sebal_validation.py`: Landsat 8/9 geçiş günlerinde açık kaynak geeSEBAL uygulaması (veya eşdeğer enerji dengesi modeli) ile anlık ET ve buharlaşma oranı; günlük ET'ye ölçekleme.
- Karşılaştırma: geçiş günlerinde tarla bazında SEBAL ET'si ile NDVI-Kc ET'si; sınıf bazında yanlılık ve RMSE.
- Kullanımı: (1) NDVI-Kc yönteminin doğrulanması, (2) su stresi olan tarlaların işaretlenmesi (SEBAL ET'si NDVI-Kc'nin anlamlı ölçüde altında), (3) gerekirse sınıf bazında kalibrasyon katsayısı.
- Ek çapraz kontroller: MODIS MOD16 ile pilot alan toplamında karşılaştırma; Konya'da yapılmış sulama deneylerinde raporlanan sezonluk tüketim değerleriyle karşılaştırma (kaynaklar `docs/DATA_SOURCES.md`'ye); kuru tahıl tarlalarında sezonluk ET ≈ yağış sağlaması.
- **KK5:** Doğrulama sonuçları kullanıcıya sunulur. Kalibrasyon uygulanıp uygulanmayacağına birlikte karar verilir.

### Aşama 10 – Havza bağlamı
- `10_basin_context.py`:
  - GRACE/GRACE-FO mascon verisinden havza ortalaması toplam su depolama anomalisi (LWE, cm); GLDAS toprak nemi, kar ve bitki örtüsü suyu çıkarılarak yeraltı suyu anomalisi.
  - 2003'ten bugüne zaman serisi, GRACE ile GRACE-FO arasındaki boşluk (2017–2018) açıkça gösterilir; eğilim (cm/yıl) ve havza alanıyla hacim (km³/yıl) belirsizlik aralığıyla.
  - Not: GRACE'in mekânsal çözünürlüğü kabadır; sonuç havza ölçeğinde bir eğilim olarak sunulur.
  - Zemin çökmesi: EGMS kapsamı kontrolü; kapsıyorsa pilot alan için hız haritası katmanı, kapsamıyorsa yayımlanmış çalışmalara atıf.

### Aşama 11 – Su bütçesi ve tarla değerlendirmesi
- `11_budget.py`:
  - **Referans ihtiyaç:** Her tarla için sınıfına göre, mevcut FAO-56 motoruyla (uydu ölçümlü Kcb ile kalibre) verimli sulama altında beklenen mavi su ihtiyacı.
  - **Bütçe senaryoları (config'te, arayüzde seçilebilir):**
    - S0 Mevcut durum: ölçülen tüketim (karşılaştırma tabanı)
    - S1 Verimli sulama: her tarla referans ihtiyacı kadar tüketir
    - S2 Havza dengesi: pilot alan toplam mavi tüketiminin %X azaltılması (X varsayım, varsayılan değer KK6'da belirlenir); azaltım tarlalara ürün bazlı ihtiyaç oranında dağıtılır
  - Tarla durumu: `ratio = blue_ET_measured / budget`; sınıflar: bütçe içinde (≤1.0), sınırda (1.0–1.15), aşım (>1.15) – eşikler config'te.
  - **Eylem kaldıraçları** (tarla başına öneri metni üretimi için, sayılar motordan): toprak buharlaşmasını azaltma (yöntem/zamanlama), açık sulama (deficit irrigation) senaryosu, ürün değişikliği senaryosu (ör. pancar → buğday tüketim farkı).
  - Enerji bağlantısı: mavi tüketim / sulama verimi × basma yüksekliği → pompalama enerjisi (kWh); basma yüksekliği bölgesel varsayım, tarla bazında düzenlenebilir. Güneş planı mevcut motordan.
- **KK6:** Bütçe senaryolarının parametreleri, durum eşikleri ve pilot alan sonuç özeti kullanıcıya sunulur; varsayılanlar kesinleştirilir.

### Aşama 12 – Dışa aktarım
- `12_export.py`:
  - `fields_{sezon}.parquet`: geometri, alan, sınıf, olasılık, sezonluk ET, mavi ET, aralık, referans ihtiyaç, senaryo bütçeleri, durum, stres bayrağı, enerji.
  - Haritalar için `fields_{sezon}.pmtiles` (tippecanoe).
  - Tarla detayları: `field/{id}.json` (günlük NDVI, ET, kümülatif mavi ET, bütçe çizgisi).
  - `basin.json` (GRACE serisi ve eğilim), `metrics.json` (tüm doğrulama metrikleri).
- Barındırma: Vercel statik dosyaları veya Vercel Blob.

### Aşama 13 – Kurum paneli (web)
- Harita: MapLibre GL + PMTiles; tarlalar durumuna göre renkli (bütçe içinde / sınırda / aşım / belirsiz), uydu altlığı.
- Filtreler: sezon, ürün, durum, senaryo, alan aralığı.
- Tarla paneli: ürün ve olasılık, NDVI eğrisi, günlük ET, kümülatif mavi ET'nin bütçe çizgisiyle karşılaştırması, stres bayrağı, enerji ve öneriler.
- Özet kartları: pilot alan toplam mavi tüketim (m³), senaryolara göre fark, aşım yapan tarla sayısı ve alanı, ürün dağılımı.
- Havza sekmesi: GRACE yeraltı suyu anomalisi grafiği ve eğilim.
- **Sezon oynatıcı:** önceki prototipteki oynatıcı, tüm harita için: kaydırıcıyla gün gün kümülatif tüketimin tarlalarda renk olarak ilerlemesi.
- **Doğal dil sorgu (Gemini):** "Ereğli tarafında bütçesini en çok aşan 20 pancar tarlası" → yapılandırılmış filtre JSON'u (şema: sınıf, durum, alan, sıralama, limit, bölge) → harita filtrelenir; sorgu yorumu kullanıcıya gösterilir.
- "Yöntem ve Doğrulama" sayfası: veri kaynakları, yöntem özeti, `metrics.json`'daki tüm metrikler, sınırlar.
- CSV dışa aktarım.

### Aşama 14 – Çiftçi kanalı (Telegram)
- Kayıt: çiftçi Telegram'da konum paylaşır → en yakın tarla poligonu bulunur → harita küçük görüntüsüyle onay istenir → chat_id ↔ field_id eşlemesi.
- Mesaj türleri:
  - Sezon özeti: "Tarlanız 2025 sezonunda uydu ölçümüne göre yaklaşık X mm (Y m³) yeraltı suyu tüketti; benzer pancar tarlalarının ortalaması Z mm, verimli sulama referansı R mm."
  - Haftalık plan (sulama sezonunda): mevcut FAO-56 + güneş motoru, uydu Kcb ile.
  - Uyarı: yağış tahmini planı değiştirdiğinde.
- Butonlar: "✅ Suladım", "🌧 Yağmur yağdı", "📅 Haftalık plan", "📊 Tarlamın durumu".
- Tüm mesaj metinleri `/api/explain-plan` ile, sayı doğrulamalı.
- Sezon dışında (demo dönemi) varsayılan mesaj türü sezon özetidir.

### Aşama 15 – Doğrulama raporu ve dokümantasyon
- `docs/METHODOLOGY.md`: tüm yöntemler, formüller, parametreler ve kaynakları.
- `docs/VALIDATION.md`: segmentasyon IoU, sınıflandırma metrikleri, ET çapraz kontrolleri, kuru tahıl sağlaması, belirsizlik analizi, bilinen sınırlar.
- `docs/DATA_SOURCES.md`: her veri kaynağı, lisansı, erişim tarihi.
- README (İngilizce): amaç, mimari diyagramı, kurulum, ortam değişkenleri, işleme hattının çalıştırılması, deploy.

---

## 5. Bilinen riskler ve ele alınma biçimi

| Risk | Ele alınışı |
|---|---|
| Earth Engine kota/işlem süresi | Pilot alan sınırlı tutulur; ağır işler `Export` görevleriyle; ara sonuçlar asset olarak saklanır |
| Segmentasyon hataları | IoU ölçümü, elle düzeltme akışı, belirsiz segment işaretleme |
| Etiket azlığı / yanlılığı | Mekânsal dağılım hedefi, "emin değilim" seçeneği, mekânsal blok doğrulama |
| NDVI-Kc stresi yakalamaz | SEBAL doğrulaması ve stres bayrağı (KK5) |
| ET için saha ölçümü yok | Çoklu bağımsız çapraz kontrol (SEBAL, MODIS, literatür, kuru tahıl sağlaması); sonuçlar aralıkla |
| Bütçe için resmî sürdürülebilir çekim verisi yok | Bütçe senaryo parametresi olarak; resmî veri gelirse config'ten değiştirilir |
| Sulama verimliliği paradoksu | Ölçüt pompalama değil mavi ET; öneriler tüketimi (buharlaşma, ürün, açık sulama) hedefler |
| WorldCereal erişimi | Yalnızca çapraz kontrol; yokluğunda süreç etkilenmez |
| GRACE çözünürlüğü | Yalnızca havza ölçeğinde eğilim olarak sunulur |

---

## 6. Karar kapıları özeti

| KK | Aşama | Kullanıcıya sunulacak | Karar |
|---|---|---|---|
| KK0 | 0 | Veri erişim tablosu | Alternatif kaynaklar |
| KK1 | 1 | Pilot alan haritası, büyüklük, tahmini tarla sayısı | D4, D5, D6 kesinleşir |
| KK2 | 3 | Segmentasyon yöntemleri IoU karşılaştırması | Segmentasyon yöntemi |
| KK3 | 4 | Sınıf listesi, etiket hedefi, ara dağılım | Sınıflar ve etiket hedefi |
| KK4 | 6 | Sınıflandırma metrikleri | Kabul / iyileştirme yolu |
| KK5 | 9 | ET doğrulama sonuçları | Kalibrasyon uygulanması |
| KK6 | 11 | Bütçe senaryoları ve sonuç özeti | Senaryo parametreleri ve eşikler |

Ayrıca: herhangi bir aşamada plandan sapmayı gerektiren bir durum çıkarsa (veri yok, yöntem çalışmıyor), Claude Code kendi başına alternatif uygulamaz; durumu ve seçenekleri kullanıcıya sunar.

---

## 7. Claude Code çalışma protokolü

Her oturumun başında:
```
PLAN.md'yi oku. Karar Kaydı'nı ve son tamamlanan aşamayı kontrol et.
Şu anki aşama: [N]. Sadece bu aşamayı uygula. Değişmez kurallara uy.
Aşama sonunda: testleri çalıştır, çıktıları özetle, varsa Karar Kapısı'nda dur ve bana sor.
Plandan sapman gerekirse uygulamadan önce bana seçenekleri sun.
```

Her aşama sonunda Claude Code şu formatta rapor verir:
1. Yapılanlar (dosyalar, çıktılar)
2. Sonuçlar ve metrikler
3. Beklenmeyen durumlar
4. Karar Kapısı varsa: seçenekler ve önerisi
5. Sonraki aşama için ön koşullar

Aşama tamamlandığında PLAN.md'nin sonuna kısa bir ilerleme kaydı eklenir:


github maine asla push yapmıyoruz belli bir süre hep branchlerde çalışıyoruz. Commitleri sen değil ben atıyorum. sen sadece komutları yaz.

## 8. İlerleme kaydı
| Tarih | Aşama | Durum | Not |
|---|---|---|---|
| 2026-10-22 | 0 – Kurulum ve erişim | Tamamlandı (KK0) | EE projesi climathon-512416; zorunlu 13 kaynak erişilebilir; GRACE 2024-09 bitişli (D8); EGMS Türkiye kapsamı yok (D9) |
| 2026-10-22 | 1 – Çalışma alanı | Tamamlandı (KK1) | Havza HydroSHEDS L5 58.374 km²; pilot D [33.30,37.70,33.60,37.90] 586 km², tarım 314 km² (%54); D4–D6 kesin |
| 2026-10-22 | 2 – Görüntü kompozitleri | Tamamlandı | Dekadal NDVI/EVI/NDMI (24 dekad) 2025+2024 ve seg_stack_2025 EE asset; tarım piksellerinde boşluk 2025 %0, 2024 %1,5 (yalnızca Mart) |
| 2026-10-22 | 3 – Tarla segmentasyonu | Tamamlandı (KK2) | 66 referans tarla (/reference aracı); SNIC 3 deneme, SNIC+birleştirme, SAM; SAM seçildi (D10), fields.geojson 3.448 tarla |
| 2026-10-24 | 4 – Etiketleme | Değiştirildi (D14) | /label aracı + rehber; 9 kör etiket; elle etiketleme yerine kümeleme + kural, /check ile 50 tarla makullük kontrolü |
| 2026-10-24 | 5 – Özellik çıkarımı | Tamamlandı | 3.448 tarla x 107 özellik, 2025 ve 2024 (S2 dekad serileri, harmonikler, fenoloji, S1 VV/VH) |
| 2026-10-24 | 6 – Ürün sınıflandırma | Tamamlandı (KK4 bekliyor) | GMM 20 küme + fenoloji kuralları; belirsiz %13; doğruluk ölçülmedi (kör 5/8, kontrol 47 uygun/3 emin değil, bağımlı) |
| 2026-10-24 | 7 – Referans ET ve yağış | Tamamlandı | Open-Meteo 11 hücre; ERA5-Land FAO-56 PM çapraz kontrol: sezon ET0 farkı %3,5 (2025) / %10 (2024), r 0,98; yağış farkı daha büyük (%19 / %42), Aşama 8 aralığa taşır |
| 2026-10-24 | 8 – ET (NDVI-Kc) | Tamamlandı | NDVI_min 0,078 / NDVI_max 0,911 (pilot persentilleri); 2025 pilot mavi su 221 Mm³ (159–261), 2024 aynı yöntem; kuru tahıl/nadas yağış+toprak suyu ile sınırlı; mavi su bitki dönemiyle sınırlı (D16) |
| 2026-10-25 | 9 – SEBAL doğrulaması | Tamamlandı (KK5) | 2025 48, 2024 44 geçiş; SEBAL/NDVI-Kc 0,66 / 0,59, r 0,63; MODIS MOD16 sulu tarımda ölçüt olamaz; kalibrasyon yok, göreli stres bayrağı (D17); docs/VALIDATION.md bölüm 5 |
| 2026-10-25 | 10 – Havza bağlamı | Tamamlandı | GRACE CRI − GLDAS Noah, 2003-01 – 2024-10; yeraltı suyu eğilimi tüm dönem −0,66 cm/yıl (−0,39 km³/yıl), GRACE −0,20 (anlamlı değil), GRACE-FO −2,73 cm/yıl (−1,59 km³/yıl); 4 ürün tutarlı (D18); docs/VALIDATION.md bölüm 6 |
| 2026-10-25 | 11 – Su bütçesi | Tamamlandı (KK6) | 2025: ölçülen 221 Mm³, S1 206, S2 177 Mm³; S1 durumu 776 içi / 1.570 sınırda / 801 aşım (3.147 sulu tarla); kaldıraçlar: damla ~22, %10 açık sulama ~23, ürün değişikliği ≤48 Mm³; enerji ~200 GWh (varsayım); D19 |
| 2026-10-25 | 12 – Dışa aktarım | Tamamlandı | GeoParquet + PMTiles (GDAL) 2025/2024, 3.448 tarla JSON (iki sezon, günlük seri + bütçe çizgisi), season/basin/metrics/manifest; public/data ~42 MB (D20) |
| 2026-10-25 | 13 – Kurum paneli | Tamamlandı | /panel: harita (durum/oynatıcı), filtreler, doğal dil sorgu, özet kartları, tarla paneli (seriler, bütçe çizgisi, stres, kaldıraçlar, enerji), havza sekmesi, Yöntem ve Doğrulama, CSV; başsız Chrome ile denendi; 123 test (D21) |
