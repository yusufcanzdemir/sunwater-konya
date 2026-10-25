# Devam notu — 2026-10-24

Bu dosya, uzun bir oturumdan sonra yeni sohbette kaldığımız yerden devam etmek için yazıldı.
Projenin tek doğruluk kaynağı yine **PLAN.md**'dir (Karar Kaydı D1–D16, İlerleme kaydı).
Bu not yalnızca PLAN.md'de olmayan "şu an ne yapıyorduk" bilgisini tutar.

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
  ayarlanmalı. Sıradaki: Aşama 15 (METHODOLOGY.md, DATA_SOURCES.md, kaynak doğrulamalı literatür karşılaştırması).
  Ky kaynağı (FAO/IAEA, Moutonnet, Tablo 1: https://www.fao.org/4/Y3655E/y3655e04.htm) Aşama 15'te
  DATA_SOURCES.md'ye taşınacak.
- **Sırada:** Aşama 9'u bitirmek → **KK5** (kalibrasyon kararı) → Aşama 10 (GRACE havza) →
  11 (bütçe, KK6) → 12 (dışa aktarım) → 13 (kurum paneli) → 14 (Telegram) → 15 (belgeler).

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
