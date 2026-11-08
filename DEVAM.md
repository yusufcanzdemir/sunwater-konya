# Devam notu — 2026-10-24 (güncelleme 2026-11-05)

Bu dosya, uzun bir oturumdan sonra yeni sohbette kaldığımız yerden devam etmek için yazıldı.
Projenin tek doğruluk kaynağı yine **PLAN.md**'dir (Karar Kaydı D1–D16, İlerleme kaydı).
Bu not yalnızca PLAN.md'de olmayan "şu an ne yapıyorduk" bilgisini tutar.

## Sonra yapılacak: toprak su dengesini ekimden bugüne kesintisiz hesaplamak (~yarım gün)
Kararlaştırıldı 2026-11-05, COP31 sunumundan sonra yapılacak.

**Sorun:** Plan her çalıştığında "7 gün önce toprak tamamen doluydu" varsayımıyla başlıyor
(`forecastInitialDepletionMm: 0`, `PAST_DAYS = 7`). Hem Telegram botunda (`api/_lib/telegram.ts` →
`evaluate`) hem çiftçi uygulamasının demo haftasında (`src/farmer/FieldCard.tsx` → `useWeek`,
`src/farmer/weekPlan.ts` → `buildWeek`) aynı durum var. Gerçek toprak durumu (geçen haftaların
sulaması, yağmuru, kuruması) plana girmiyor.

**Yapılacak:**
1. Su dengesini ekim tarihinden bugüne gün gün yürüt: geçmiş günler Open-Meteo arşivinden (yaklaşık 5 gün
   gecikmeli, `ARCHIVE_LAG_DAYS`), son günler ve önümüzdeki 16 gün tahmin servisinden (`past_days`), araya
   çiftçinin "Suladım" kayıtları girer. Bot ve web aynı ortak fonksiyonu kullansın.
2. Demo haftası için gerekli veri hazır: `public/data/demo_weather_2025.json` 1 Mart – 30 Kasım 2025'in
   tamamını içeriyor. Demo haftası bu dosyadan ekimden itibaren hesaplanır.
3. **Görünür kıl:** demo kartına "Toprakta yaklaşık N günlük su var" ve ekimden bu yana toprak nemi çizgisi
   (sulama ve yağmur günleriyle). Sunum cümlesi: "Tarlanın suyunu ekimden bu yana her gün takip ediyoruz:
   yağmuru hava verisinden, sulamayı çiftçinin 'Suladım'ından."
4. **Kontrol:** örnek tarla F03053'ün demo haftası şu an "Çarşamba–Cumartesi 10:00–16:00, 6 saat, %92
   güneş". Değişiklikten sonra tekrar bak; tablo bozulursa kullanıcıya söyle (gerekirse örnek tarla yeniden
   seçilir, aday listesi: küçük, "fazla su" durumunda pancar tarlaları).

**Aynı konuyla ilgili, daha küçük:**
- Kış yağışıyla sezon başı toprak nemi: şu an her sezon dolu toprakla başlıyor (FAO'da standart kabul,
  Konya'da kış yağışı genelde toprağı doldurur). İstenirse Ekim–Şubat yağışından arşivle hesaplanır;
  çiftçiye sorulmaz.
- Bilinen sınır: sulu kışlık tahıl sonbaharda ekilip Ekim–Kasım'da sulanabiliyor, pilot sezonu ise 1 Mart'ta
  başlıyor; bu sulamalar modelde yok. Belgelere (METHODOLOGY / VALIDATION) sınır olarak eklenmeli.

## COP31 öncesi açık işler (2026-11-05)
- `en-ui` dalındaki değişiklikler commit'lenmedi (İngilizce dil, Telegram tarla sınırı, demo haftası, örnek
  tarla F03053, yağmur butonunun kaldırılması, sezon dışı butonlar). Commit → push → Vercel önizleme →
  `main`'e birleştirme kullanıcıda.
- Vercel ayarları (kullanıcı): `CRON_SECRET`, `PUBLIC_BASE_URL`, `TELEGRAM_WEBHOOK_SECRET`. Sonuncusu
  eklenince gerçek botun webhook'u şifreyle yeniden kurulmalı.
- İki bot düzeni: gerçek bot `@ciftci_sulama_kanali_ai_bot` Vercel webhook'unda (2026-11-04'te kuruldu),
  test botu `@sunwater_konya_test_bot` `.env.local`'de ve `npm run dev` ile dinleniyor (README, Telegram bot).
- Yayından sonra canlı test: sarı sınırlı fotoğraf (`sharp` Vercel'de ilk kez), `/durum`, haftalık plan;
  panelin Yöntem ve Havza sekmelerinin İngilizcesi.

## Kısa durum
- **Bitti:** Aşama 0–8 (kurulum, çalışma alanı, uydu kompozitleri, SAM ile 3.448 tarla,
  kümeleme + kurallarla ürün sınıfları, özellikler, ET0/yağış, NDVI-Kc ile tarla bazında ET ve
  mavi su). Sonuç: 2025 pilot mavi su ≈ 221 milyon m³ (aralık 159–261).
- **Bitti:** Aşama 9 — SEBAL doğrulaması. Çalıştırma 2026-10-25'te tamamlandı (2025: 48,
  2024: 44 geçiş; rapor `outputs/09_sebal/sebal_report.md`). SEBAL ekili günlerde NDVI-Kc'nin
  ~%60–66'sı; yaz aylarında günlük net ışınım enerjisi (~6,4 mm) ET0'ın (~7,6 mm) altında, SEBAL
  bu enerjiyi aşamadığı için yapısal olarak düşük kalıyor (adveksiyon). KK5 kararı verildi (D17):
  kalibrasyon yok, göreli stres bayrağı.
- **Bitti:** Aşama 10 — havza bağlamı (`10_basin_context.py`, GLDAS aylıkları
  `outputs/10_basin/gldas_monthly.parquet` önbelleğinde).
- **Bitti:** Aşama 11 — `11_budget.py` + `lib/budget.py`; KK6 önerilen varsayılanlarla kapandı (D19).
- **Bitti:** Aşama 12 — `12_export.py` → `pipeline/outputs/12_export/data/` ve `public/data/` (repoda,
  Vercel statik).
- **Bitti:** Aşama 13 — kurum paneli `src/panel/` (`/panel`), `/api/parse-query`.
- **Bitti:** Aşama 14 — Telegram pilot tarlalar (`src/farmer/pilot.ts`, `api/_lib/pilotData.ts`). Gerçek botla
  uçtan uca deneme yapılmadı (kullanıcının sohbetine mesaj gitmesin diye); deploy sonrası `PUBLIC_BASE_URL`
  ayarlanmalı.
- **Bitti:** Aşama 15 — belgeler (docs/), lisans atıfları, Konya deneyleriyle karşılaştırma. Plan tamamlandı.

## Açık kalan iyileştirmeler (plan dışı)
- Sulu kışlık tahılda NDVI-Kc ET Konya deneylerinin %16–29 üstünde (VALIDATION §8): olgunlaşmada ıslatma
  varsayımı ve ikinci ürünlü tarlaların kışlık tahıl sınıfına düşmesi incelenmeli.
- Mısır (Kara & Sahin 2021) Tablo 3 değerleri bozuk PDF'ten okundu; atıf öncesi tekrar kontrol.
- Gerçek botla uçtan uca deneme (deploy sonrası). (Onay görüntüsüne tarla sınırı 2026-11-03'te eklendi.)
- Open-Meteo ücretsiz API ve Earth Engine yalnızca ticari olmayan kullanım içindir; ürünleşirse abonelik gerekir.
  Ky kaynağı (FAO/IAEA, Moutonnet, Tablo 1: https://www.fao.org/4/Y3655E/y3655e04.htm) Aşama 15'te
  DATA_SOURCES.md'ye taşınacak.
- Aşama planı tamamlandı; sıradaki işler dosyanın başındaki iki bölümde.

## Aşama 9'a nasıl devam edilir
1. `pipeline/09_sebal_validation.py` tekrar çalıştırılır; işlenmiş geçişler
   `pipeline/outputs/09_sebal/scenes/` önbelleğinden atlanır:
   `cd pipeline; py -3.13 -m uv run python -u -W ignore 09_sebal_validation.py > outputs/09_sebal/run.log 2>&1`
   (arka planda; geçiş başına ~15–25 sn, kalan süre ~30 dk).
2. Bitince `outputs/09_sebal/sebal_report.md` okunur: sınıf bazında SEBAL/NDVI-Kc oranı,
   yanlılık, RMSE, su stresi bayrakları, MODIS MOD16 karşılaştırması.
3. KK5 kullanıcıya sunulur: sınıf bazında kalibrasyon katsayısı uygulansın mı?

## Aşama 9 hakkında bilinmesi gerekenler
- SEBAL kendi yazımımız (`pipeline/lib/sebal.py`), geeSEBAL PyPI'da yok. Klasik SEBAL:
  otomatik sıcak/soğuk piksel (tarım alanında NDVI ve LST yüzdelikleri), sıcak pikselde
  kararlılık iterasyonu, piksel bazında iterasyon (yalnızca kararsız atmosfer formülleri),
  EF × Rn24 (de Bruin) / λ ile günlük ET. Meteoroloji: ERA5-Land saatlik/günlük, pilot ortalaması.
- Hızlandırma: geçiş başına tek istekle 30 m ET haritası indirilip tarla ortalamaları yerelde
  hesaplanıyor (alan içi 10 m tampon, en az 4 piksel ve %70 geçerli piksel).
- Aynı gün iki Landsat sahnesi pilotu kesiyorsa mozaiklenir (anahtar `LC08_YYYYMMDD`).
- İlk gözlem (tek geçiş, 2 Temmuz 2025): SEBAL ortalama ~%18 daha düşük (4,1 vs 5,0 mm/gün,
  r 0,77). İki olası açıklama yorumlanacak: gerçek su stresi ve SEBAL'ın günlük EF yönteminin
  kurak bölgedeki adveksiyonu (çevreden gelen ek enerji) saymaması. KK5'te açıkça anlatılmalı;
  doğrudan "NDVI-Kc yanlış" sonucuna varılmamalı.

## Çalışma ortamı
- Python: `pipeline/` içinde `py -3.13 -m uv run ...` (uv PATH'te değil). Testler:
  `py -3.13 -m uv run pytest -q` (70 test). SAM için `--extra sam` (CUDA, RTX 4060).
- Earth Engine projesi: `climathon-512416`; asset klasörü `projects/climathon-512416/assets/sunwater`.
- Web: kökte `npm run dev`; yalnızca geliştirme sunucusunda çalışan araç sayfaları
  `/reference`, `/label`, `/check` (vite.config.ts içindeki dev eklentileri).
- `pipeline/outputs/` git dışında, hepsi scriptlerle yeniden üretilebilir.
- Belgeler: `docs/VALIDATION.md` bölüm 1–4 yazıldı (segmentasyon, sınıflandırma, ET0, ET).

## Açık işler / notlar
- `docs/METHODOLOGY.md` ve `docs/DATA_SOURCES.md` henüz yok (Aşama 15). Literatür
  karşılaştırması (Konya sulama deneyleri) kaynak doğrulanarak yapılacak; doğrulanmamış rakam
  kullanılmaz (kural 7).
- Önceki proje dokümanındaki iddiaların kontrolü `docs/IDDIA_KONTROLU.md`'de (hangi rakam
  kullanılabilir / kullanılamaz). Aşama 11 ve 15'te bakılacak.
- Ürün sınıflarının doğruluğu ölçülmedi (D14, D15); panelde böyle gösterilecek.
- React uygulaması `/web` klasörüne taşınmadı (D21); panel `/panel` sayfası.

## Kullanıcının çalışma tercihi
- Commit'leri kullanıcı atar; Claude yalnızca komut önerir, ara sıra (aşama sonlarında).
  main'e asla push yok; dal: `v2`.
- Kullanıcı teknik ayrıntıdan çok sade özet istiyor; scriptleri Claude çalıştırır, kullanıcıdan
  yalnızca karar kapılarında görüş istenir.
