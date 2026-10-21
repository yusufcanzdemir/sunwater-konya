# Güneşli Sulama Asistanı – Prototip Spesifikasyonu

## Amaç

Tek günde, paylaşılabilir linki olan, GERÇEK açık veriyle ÇALIŞAN bir web prototipi.
Kanıtlanacak çekirdek zincir:
**çiftçinin anlatımı → tarlanın günlük su ihtiyacı (FAO-56, gerçek hava verisi) → güneş saatlerine göre sulama planı → mevcut alışkanlığa göre su, enerji, CO₂ ve TL etkisi**

En güçlü kanıt: **geçen sezonun gerçek hava verisiyle geriye dönük simülasyon** ("Bu tarla geçen yıl bu planla sulansaydı şu kadar su tasarruf ederdi").

## Değişmez kurallar

- Tüm sayılar `src/engine/` altındaki saf TypeScript fonksiyonlarından gelir. LLM hesap YAPMAZ, sayı UYDURMAZ.
- Gemini yalnızca: (1) çiftçinin serbest metnini yapılandırılmış veriye çevirme, (2) motorun ürettiği sonucu sade Türkçeyle açıklama.
- Her aşama sonunda uygulama çalışır durumda olmalı. Aşama bitince dur ve rapor ver.
- Arayüz Türkçe, kod İngilizce. Tüm varsayımlar arayüzde "varsayım" etiketiyle görünür ve düzenlenebilir.
- Sentetik veri yok: hava verisi her zaman Open-Meteo'dan gerçek. "Demo tarla" yalnızca form alanlarını doldurur.

## Teknoloji

- Vite + React + TypeScript + Tailwind, grafikler için recharts
- Test: vitest
- AI: Gemini API (`@google/genai`), AI Studio'daki güncel Flash modeli, `responseSchema` ile yapılandırılmış çıktı
- Gemini çağrıları Vercel serverless fonksiyonlarında: `/api/parse-farm`, `/api/explain-plan`. `GEMINI_API_KEY` yalnızca sunucuda.
- Deploy: Vercel

### Open-Meteo uç noktaları (anahtarsız)

- Geocoding: `https://geocoding-api.open-meteo.com/v1/search?name={yer}&language=tr&count=5&countryCode=TR`
- Tahmin (16 güne kadar):
  `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&daily=et0_fao_evapotranspiration,precipitation_sum&hourly=global_tilted_irradiance&tilt=30&azimuth=0&forecast_days=16&timezone=Europe/Istanbul`
- Geçmiş (geriye dönük simülasyon):
  `https://archive-api.open-meteo.com/v1/archive?latitude=..&longitude=..&start_date=..&end_date=..&daily=et0_fao_evapotranspiration,precipitation_sum&hourly=global_tilted_irradiance&tilt=30&azimuth=0&timezone=Europe/Istanbul`
- Not: Open-Meteo'da azimuth 0 = güney. Parametre adlarını dokümantasyondan doğrula; çalışmazsa `shortwave_radiation` ile devam et.

## Aşama 1 – Tarla girdisi + su ihtiyacı motoru (EN ÖNCELİKLİ)

### Form alanları (Gemini olmadan da elle doldurulabilir)

| Alan                                         | Varsayılan                                |
| -------------------------------------------- | ----------------------------------------- |
| Konum (geocoding, Konya ilçeleri önerilir)   | Karapınar                                 |
| Ürün                                         | şeker pancarı / mısır / ayçiçeği / buğday |
| Ekim (veya sulama dönemi başlangıç) tarihi   | ürüne göre                                |
| Alan (dekar)                                 | 100                                       |
| Sulama yöntemi                               | salma / yağmurlama / damla                |
| Toprak tipi                                  | killi tın                                 |
| Kuyu toplam basma yüksekliği (m)             | 120                                       |
| Pompa debisi (m³/saat)                       | 60                                        |
| Pompa-motor verimi                           | 0,50                                      |
| Enerji kaynağı                               | güneş+şebeke / şebeke / dizel             |
| GES gücü (kWp)                               | 50                                        |
| Mevcut alışkanlık: kaç günde bir, kaç saat   | her gün, 20 saat                          |
| Elektrik birim fiyatı (TL/kWh), dizel (TL/L) | kullanıcı girer                           |

"Demo tarla yükle" butonu formu bu varsayılanlarla doldurur.

### Ürün katsayıları (`src/engine/crops.ts`) – FAO-56 Tablo 11-12'den YAKLAŞIK, arayüzde düzenlenebilir

| Ürün                            | Kc_ini | Kc_mid | Kc_end | Aşama süreleri gün (ini/dev/mid/late) | Kök derinliği Zr (m) | p    |
| ------------------------------- | ------ | ------ | ------ | ------------------------------------- | -------------------- | ---- |
| Şeker pancarı                   | 0.35   | 1.20   | 0.70   | 30/45/60/45                           | 1.0                  | 0.55 |
| Mısır (dane)                    | 0.30   | 1.20   | 0.35   | 30/40/50/30                           | 1.0                  | 0.55 |
| Ayçiçeği                        | 0.35   | 1.05   | 0.35   | 25/35/45/25                           | 1.0                  | 0.45 |
| Buğday (ilkbahar sulama dönemi) | 0.40   | 1.15   | 0.30   | 20/25/60/30                           | 1.0                  | 0.55 |

Kc eğrisi: ini döneminde sabit Kc_ini → dev döneminde doğrusal artış → mid döneminde sabit Kc_mid → late döneminde Kc_end'e doğrusal iniş.

### Toprak (`src/engine/soil.ts`) – YAKLAŞIK

| Toprak    | θFC  | θWP  |
| --------- | ---- | ---- |
| Killi tın | 0.32 | 0.17 |
| Tın       | 0.27 | 0.12 |
| Kumlu tın | 0.18 | 0.08 |
| Kil       | 0.38 | 0.24 |

### Su dengesi (`src/engine/waterBalance.ts`) – FAO-56 Bölüm 8, basitleştirilmiş

- `TAW = 1000 × (θFC − θWP) × Zr` (mm), `RAW = p × TAW`
- Günlük: `ETc = Kc(gün) × ET0`
- Etkili yağış: `Peff = P < 5 ? 0 : 0.8 × P`
- Kök bölgesi eksikliği: `Dr_t = clamp(Dr_{t-1} − Peff − I_net + ETc, 0, TAW)`, başlangıç `Dr_0 = 0` (tarla kapasitesinde)
- Sulama kararı: `Dr_t ≥ RAW` ise o gün sulama, net miktar `I_net = Dr_t` (mm)
- Tahmin kullanımı: önümüzdeki 2 gün içinde toplam Peff, Dr'yi RAW altına düşürecekse sulamayı ertele
- Brüt su: `I_gross = I_net / efficiency`; efficiency: salma 0.55, yağmurlama 0.72, damla 0.88
- Hacim: `V (m³) = I_gross (mm) × alan (dekar)` (1 mm × 1 dekar = 1 m³)

### Çıktı

- Günlük grafik: ET0, ETc, yağış, Dr ve RAW eşiği, sulama günleri
- Kartlar: sezon toplam net ihtiyaç (mm), brüt su (m³), sulama sayısı

## Aşama 2 – Güneşe göre plan + etki + geriye dönük test

### Pompa (`src/engine/pump.ts`)

- Güç: `P_pump (kW) = 9.81 × (Q/3600) × H / η`
- Enerji: `E (kWh) = 9.81 × H × V / (3600 × η)`
- Süre: `saat = V / Q`

### GES üretimi (`src/engine/pv.ts`)

- Saatlik: `P_pv(t) = kWp × GTI(t) / 1000 × PR`, `PR = 0.80` (varsayım)

### Saatlik planlama (`src/engine/schedule.ts`)

- Sulama günü için gereken pompa saatlerini, `P_pv(t)` en yüksek saatlerden başlayarak açgözlü yerleştir.
- Her saat için: güneşten karşılanan kWh = `min(P_pump, P_pv)`, kalan = şebeke/dizel.
- Dönüşümlü sulama: tarla parsel parsel sulanır. Bir sulama turu, sulama gününden bir sonraki sulama gününün öncesine kadar (en fazla 14 gün, varsayım) yayılır; bu penceredeki tüm günlerin en yüksek `P_pv` saatleri önce doldurulur. Tur pencereye sığmazsa (pompa kapasitesi sınırda) arayüzde uyar.
- Sulama olmayan saatlerdeki ve pompa sonrası artan `P_pv` = "şebekeye verilebilir fazla enerji".

### Baseline (mevcut alışkanlık)

- Kullanıcının alışkanlığı: her `interval` günde bir, `hours` saat → sezon hacmi `= Q × hours × sezondaki sulama sayısı`
- Alışkanlık girilmezse: `V_baseline = V_model_net / efficiency × 1.25` (göz kararı aşırı sulama varsayımı, arayüzde etiketli)

### Etki (`src/engine/impact.ts`)

- Su tasarrufu: `ΔV = V_baseline − V_model` (negatifse "mevcut sulamanız ihtiyacın altında, verim riski" uyarısı göster; tasarruf iddia etme)
- Enerji: `ΔE` pompa formülüyle
- CO₂: dizel `ΔE × 0.30 L/kWh × 2.68 kg/L`; şebeke `ΔE × 0.46 kg/kWh`; güneş: tasarruf edilen kWh şebekeye verilirse `ΔE × 0.46` (şebeke eşdeğeri)
- TL: enerji kaynağına göre birim fiyatla
- Gösterim: tek sayı değil, ±%25 aralık
- Ölçek tablosu: 100 ve 1.000 tarla için (bu tarlanın değeri × n)
- Sabit, kaldırılamaz sınır metni: "Bu sonuçlar FAO-56 yöntemi, gerçek hava verisi ve varsayımlara dayalı TAHMİNDİR. Gerçek tasarruf, pilot tarlalarda kuyu sayacı ölçümüyle doğrulanacaktır."

### Geriye dönük test (EN ÖNEMLİ EKRAN)

- Geçen sezonun aynı tarih aralığı için archive API'den gerçek ET0, yağış ve GTI çek.
- Motoru o veriyle çalıştır, baseline alışkanlıkla karşılaştır.
- Kümülatif su grafiği: baseline vs. model (iki çizgi), aradaki alan = tasarruf.
- Başlık: "Geçen sezonun gerçek hava verisiyle: bu plan X m³ (≈%Y) daha az su çekerdi."

### Bu haftanın planı

- Tahmin verisiyle önümüzdeki 7-16 gün; hangi gün, hangi saatler arası, kaç saat sulanacağı.
- Sulama sezonu dışındaysa: "Sulama sezonu dışındasınız" mesajı ve geriye dönük teste yönlendirme. (Prototip ekim ayında gösterileceği için demo akışının ana ekranı geriye dönük test olmalı.)

## Aşama 3 – Gemini entegrasyonu

### `/api/parse-farm`

- Girdi: çiftçinin serbest metni (ör. "Karapınar'da 100 dönüm pancarım var, nisan sonu ektim, salma sulama yapıyorum, kuyu 120 metre, 50 kilovat panelim var, haftada bir gün boyu sularım")
- Sistem talimatı: "Türk çiftçisinin tarlasını anlatan metinden yalnızca açıkça söylenen bilgileri çıkar. Söylenmeyeni uydurma, missing_fields listesine yaz. 'Dönüm' = dekar. 'Gün boyu' ≈ 24 saat, 'yarım gün' ≈ 12 saat."
- responseSchema:

```json
{
  "location_text": "string|null",
  "crop": "sugar_beet|maize|sunflower|wheat|null",
  "planting_date": "YYYY-MM-DD|null",
  "area_decare": "number|null",
  "irrigation_method": "flood|sprinkler|drip|null",
  "well_head_m": "number|null",
  "pump_flow_m3h": "number|null",
  "pv_kwp": "number|null",
  "energy_source": "solar_grid|grid|diesel|null",
  "habit_interval_days": "number|null",
  "habit_hours": "number|null",
  "missing_fields": ["string"],
  "follow_up_question": "string"
}
```

- UI: çıkarılan değerler forma DOLDURULUR, kullanıcı onaylamadan hesap yapılmaz; eksik alanlar vurgulanır ve `follow_up_question` gösterilir.

### `/api/explain-plan`

- Girdi: motorun JSON çıktısı (plan, etki, uyarılar)
- Sistem talimatı: "Konya'daki bir çiftçiye sulama planını sade Türkçeyle, en fazla 6 cümlede anlat. YALNIZCA verilen JSON'daki sayıları kullan, yeni sayı üretme. Teknik terim kullanma (ET0, Kc yazma). Önce bu haftaki eylemi söyle, sonra tasarrufu TL ve su olarak söyle, en sonda yeraltı suyunu ve obruk riskini korumaya katkısını bir cümleyle belirt."
- Doğrulama: yanıttaki tüm sayıların girdi JSON'unda geçtiğini kontrol eden basit bir fonksiyon; geçmezse bir kez yeniden dene, yine geçmezse şablon metne dön.

## Aşama 4 – Sunum katmanı

- Ana akış 3 adım: 1) Tarlanı anlat 2) Planın 3) Etkin (geriye dönük test)
- Üstte bağlam bandı: "Konya Kapalı Havzası'nda aşırı yeraltı suyu çekimi obruk oluşumunu hızlandırıyor. Güneş enerjisi pompayı bedavaya çalıştırınca bu risk artabilir."
- "Bugün çalışan / Vizyon" bölümü:
  - Bugün: doğal dilden tarla bilgisi, FAO-56 su dengesi (gerçek hava verisi), güneşe göre saatlik plan, geriye dönük test, etki hesabı, sade Türkçe açıklama
  - Vizyon: Sentinel-2 NDVI ile tarla bazında kalibrasyon, pompa kontrol cihazıyla otomatik çalıştırma, kuyu sayacı ile ölçülmüş tasarruf, kooperatif paneli, sesli kullanım
- Hata durumları: Open-Meteo veya Gemini hatasında anlaşılır Türkçe mesaj, elle girişe dönüş.

## Test (vitest)

- Kc eğrisi: aşama sınırlarında doğru değerler
- Su dengesi: yağışsız sabit ET0 ile sulama aralığının RAW/ETc ile tutarlı olması
- Pompa enerjisi: H=120, V=1000, η=0.5 → ≈654 kWh
- Planlama: pompa saatleri en yüksek GTI saatlerine yerleşiyor mu
- Etki: baseline < model ise tasarruf iddia edilmiyor mu

**\*\*\*\***\_\_\_**\*\*\*\***Kurallar:

1.Gite her aşama bittiğinde commit atılacak ama sen atmayacaksın ben atacağım sen bana sadece komutları vereceksin commit yazısını yazacaksın geri kalanı ben yapacağım.

2.
