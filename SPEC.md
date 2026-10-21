# Güneşli Sulama Asistanı – Prototip Spesifikasyonu (tam sürüm)

> Aşama 1-3 çekirdek motor ve AI, Aşama 4 görsel arayüz, Aşama 5 Telegram, Aşama 6 sunum ve deploy.

## Amaç
Tek günde, paylaşılabilir linki olan, GERÇEK açık veriyle ÇALIŞAN, görsel ve kullanıcı odaklı bir prototip.
Kanıtlanacak çekirdek zincir:
**çiftçinin tarlası → günlük su ihtiyacı (FAO-56, gerçek hava verisi) → güneş saatlerine göre sulama planı → mevcut alışkanlığa göre su, enerji, CO₂ ve TL etkisi → çiftçinin telefonuna giden uyarı**

En güçlü kanıt: **geçen sezonun gerçek hava verisiyle geriye dönük simülasyon** ("Bu tarla geçen yıl bu planla sulansaydı şu kadar su tasarruf ederdi").

Hedef kullanıcı: teknik bilgisi olmayan Konyalı bir çiftçi. Büyük butonlar, az metin, ikonlar, mobilde rahat kullanım.

## Değişmez kurallar
- Tüm sayılar `src/engine/` altındaki saf TypeScript fonksiyonlarından gelir. LLM hesap YAPMAZ, sayı UYDURMAZ.
- Gemini yalnızca: (1) çiftçinin serbest metnini yapılandırılmış veriye çevirme, (2) motorun sonucunu sade Türkçeyle açıklama, (3) opsiyonel: Telegram sesli mesajını metne çevirme.
- Her aşama sonunda uygulama çalışır durumda olmalı. Aşama bitince dur ve rapor ver.
- Arayüz Türkçe, kod İngilizce. Tüm varsayımlar arayüzde "varsayım" etiketiyle görünür ve düzenlenebilir.
- Sentetik veri yok: hava verisi her zaman Open-Meteo'dan gerçek. "Demo tarla" yalnızca form alanlarını doldurur.
- Görseller yalnızca motorun gerçek çıktısını gösterir; temsili veya uydurma veri (ör. doğrulanmamış obruk noktaları) eklenmez.
- Web arayüzünde sesli giriş YOK; çiftçi web'de yazarak veya haritada çizerek girer.

## Teknoloji
- Vite + React + TypeScript + Tailwind
- Grafik: recharts; animasyon: framer-motion
- Harita: react-leaflet + `@geoman-io/leaflet-geoman-free` (çizim) + `@turf/area`, `@turf/centroid`
- Test: vitest
- AI: Gemini API (`@google/genai`), AI Studio'daki güncel Flash modeli, `responseSchema` ile yapılandırılmış çıktı
- Sunucu: Vercel serverless fonksiyonları (`/api/*`). Gizli anahtarlar yalnızca sunucuda: `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`
- Basit depolama (Telegram kullanıcıları ve geri bildirimler): Upstash Redis / Vercel KV; kurulum yoksa tek demo kullanıcısı için `TELEGRAM_DEMO_CHAT_ID`
- Deploy: Vercel

### Open-Meteo uç noktaları (anahtarsız)
- Geocoding: `https://geocoding-api.open-meteo.com/v1/search?name={yer}&language=tr&count=5&countryCode=TR`
- Tahmin (16 güne kadar):
  `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&daily=et0_fao_evapotranspiration,precipitation_sum&hourly=global_tilted_irradiance&tilt=30&azimuth=0&forecast_days=16&timezone=Europe/Istanbul`
- Geçmiş (geriye dönük simülasyon):
  `https://archive-api.open-meteo.com/v1/archive?latitude=..&longitude=..&start_date=..&end_date=..&daily=et0_fao_evapotranspiration,precipitation_sum&hourly=global_tilted_irradiance&tilt=30&azimuth=0&timezone=Europe/Istanbul`
- Not: Open-Meteo'da azimuth 0 = güney. Parametre adlarını dokümantasyondan doğrula; çalışmazsa `shortwave_radiation` ile devam et.

---

## Aşama 1 – Tarla girdisi + su ihtiyacı motoru (EN ÖNCELİKLİ)

### Form alanları
| Alan | Varsayılan |
|---|---|
| Konum (geocoding; Aşama 4'te haritadan otomatik) | Karapınar |
| Ürün | şeker pancarı / mısır / ayçiçeği / buğday |
| Ekim (veya sulama dönemi başlangıç) tarihi | ürüne göre |
| Alan (dekar; Aşama 4'te haritadan otomatik) | 100 |
| Sulama yöntemi | salma / yağmurlama / damla |
| Toprak tipi | killi tın |
| Kuyu toplam basma yüksekliği (m) | 120 |
| Pompa debisi (m³/saat) | 60 |
| Pompa-motor verimi | 0,50 |
| Enerji kaynağı | güneş+şebeke / şebeke / dizel |
| GES gücü (kWp) | 50 |
| Mevcut alışkanlık: kaç günde bir, kaç saat | her gün, 20 saat |
| Elektrik birim fiyatı (TL/kWh), dizel (TL/L) | kullanıcı girer |

"Demo tarla yükle" butonu formu bu varsayılanlarla doldurur.

### Ürün katsayıları (`src/engine/crops.ts`) – FAO-56 Tablo 11-12'den YAKLAŞIK, arayüzde düzenlenebilir
| Ürün | Kc_ini | Kc_mid | Kc_end | Aşama süreleri gün (ini/dev/mid/late) | Kök derinliği Zr (m) | p |
|---|---|---|---|---|---|---|
| Şeker pancarı | 0.35 | 1.20 | 0.70 | 30/45/60/45 | 1.0 | 0.55 |
| Mısır (dane) | 0.30 | 1.20 | 0.35 | 30/40/50/30 | 1.0 | 0.55 |
| Ayçiçeği | 0.35 | 1.05 | 0.35 | 25/35/45/25 | 1.0 | 0.45 |
| Buğday (ilkbahar sulama dönemi) | 0.40 | 1.15 | 0.30 | 20/25/60/30 | 1.0 | 0.55 |

Kc eğrisi: ini döneminde sabit Kc_ini → dev döneminde doğrusal artış → mid döneminde sabit Kc_mid → late döneminde Kc_end'e doğrusal iniş.

### Toprak (`src/engine/soil.ts`) – YAKLAŞIK
| Toprak | θFC | θWP |
|---|---|---|
| Killi tın | 0.32 | 0.17 |
| Tın | 0.27 | 0.12 |
| Kumlu tın | 0.18 | 0.08 |
| Kil | 0.38 | 0.24 |

### Su dengesi (`src/engine/waterBalance.ts`) – FAO-56 Bölüm 8, basitleştirilmiş
- `TAW = 1000 × (θFC − θWP) × Zr` (mm), `RAW = p × TAW`
- Günlük: `ETc = Kc(gün) × ET0`
- Etkili yağış: `Peff = P < 5 ? 0 : 0.8 × P`
- Kök bölgesi eksikliği: `Dr_t = clamp(Dr_{t-1} − Peff − I_net + ETc, 0, TAW)`, başlangıç `Dr_0 = 0`
- Sulama kararı: `Dr_t ≥ RAW` ise o gün sulama, net miktar `I_net = Dr_t` (mm)
- Tahmin kullanımı: önümüzdeki 2 gün içinde toplam Peff, Dr'yi RAW altına düşürecekse sulamayı ertele
- Brüt su: `I_gross = I_net / efficiency`; efficiency: salma 0.55, yağmurlama 0.72, damla 0.88
- Hacim: `V (m³) = I_gross (mm) × alan (dekar)` (1 mm × 1 dekar = 1 m³)
- Fonksiyon, dışarıdan gelen gerçek kayıtları (çiftçinin "Suladım" / "Yağmur yağdı" girişleri) kabul edebilmeli (Aşama 5).

### Çıktı
- Günlük grafik: ET0, ETc, yağış, Dr ve RAW eşiği, sulama günleri
- Kartlar: sezon toplam net ihtiyaç (mm), brüt su (m³), sulama sayısı

---

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
- Alışkanlık: her `interval` günde bir, `hours` saat → sezon hacmi `= Q × hours × sezondaki sulama sayısı`
- Alışkanlık girilmezse: `V_baseline = V_model_net / efficiency × 1.25` (göz kararı aşırı sulama varsayımı, etiketli)

### Etki (`src/engine/impact.ts`)
- Su tasarrufu: `ΔV = V_baseline − V_model` (negatifse "mevcut sulamanız ihtiyacın altında, verim riski" uyarısı; tasarruf iddia etme)
- Enerji: `ΔE` pompa formülüyle
- CO₂: dizel `ΔE × 0.30 L/kWh × 2.68 kg/L`; şebeke `ΔE × 0.46 kg/kWh`; güneş: tasarruf edilen kWh şebekeye verilirse `ΔE × 0.46` (şebeke eşdeğeri)
- TL: enerji kaynağına göre birim fiyatla
- Gösterim: ±%25 aralık
- Ölçek tablosu: 100 ve 1.000 tarla için (bu tarlanın değeri × n)
- Sabit, kaldırılamaz sınır metni: "Bu sonuçlar FAO-56 yöntemi, gerçek hava verisi ve varsayımlara dayalı TAHMİNDİR. Gerçek tasarruf, pilot tarlalarda kuyu sayacı ölçümüyle doğrulanacaktır."

### Geriye dönük test (DEMONUN ANA EKRANI)
- Geçen sezonun aynı tarih aralığı için archive API'den gerçek ET0, yağış ve GTI çek.
- Motoru o veriyle çalıştır, baseline alışkanlıkla karşılaştır.
- Kümülatif su grafiği: baseline vs. model, aradaki alan = tasarruf.
- Başlık: "Geçen sezonun gerçek hava verisiyle: bu plan X m³ (≈%Y) daha az su çekerdi."

### Bu haftanın planı
- Tahmin verisiyle önümüzdeki 7-16 gün; hangi gün, hangi saatler arası, kaç saat sulanacağı.
- Sulama sezonu dışındaysa: "Sulama sezonu dışındasınız" mesajı ve geriye dönük teste yönlendirme. (Prototip ekim ayında gösterileceği için ana ekran geriye dönük test.)

---

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
- UI: çıkarılan değerler forma DOLDURULUR, kullanıcı onaylamadan hesap yapılmaz; eksik alanlar vurgulanır, `follow_up_question` gösterilir.

### `/api/explain-plan`
- Girdi: motorun JSON çıktısı (plan, etki, uyarılar) ve `format: "web" | "telegram"`
- Sistem talimatı: "Konya'daki bir çiftçiye sulama planını sade Türkçeyle anlat. YALNIZCA verilen JSON'daki sayıları kullan, yeni sayı üretme. Teknik terim kullanma (ET0, Kc yazma). Önce bu haftaki eylemi söyle, sonra tasarrufu TL ve su olarak söyle, en sonda yeraltı suyunu ve obruk riskini korumaya katkısını bir cümleyle belirt." Web için en fazla 6 cümle, Telegram için en fazla 5 kısa satır.
- Doğrulama: yanıttaki tüm sayıların girdi JSON'unda geçtiğini kontrol eden fonksiyon; geçmezse bir kez yeniden dene, yine geçmezse şablon metne dön.

---

## Aşama 4 – Görsel ve kullanıcı odaklı arayüz (motora DOKUNMADAN)

### 4.1 Uydu haritasında tarla çizme
- react-leaflet, Esri World Imagery katmanı:
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` (attribution: "Tiles © Esri")
- Başlangıç: Karapınar. Geoman ile poligon çizme ve düzenleme.
- `@turf/area` ile alanı m² → dekar (÷1000) çevirip forma yaz; `@turf/centroid` ile konumu belirle.
- Çizim yoksa elle konum ve alan girişi çalışmaya devam eder.

### 4.2 Güneş–pompa günlük grafiği
- Seçilen gün için saatlik `P_pv` (sarı alan), pompanın çalıştığı saatler (mavi bloklar), şebekeye verilebilir fazla enerji (açık sarı ton).
- recharts ComposedChart. Üstte kısa özet: "Pompa 5 saatin 5'inde güneşle çalıştı, 120 kWh fazla enerji şebekeye verilebilir."

### 4.3 Sezon oynatıcı (demonun yıldızı)
- Geriye dönük test verisini gün gün oynatan kaydırıcı + oynat/durdur butonu.
- **Toprak su deposu göstergesi (SVG):** doluluk = `1 − Dr/TAW`, RAW eşiği çizgisi, yağmur günü bulut ikonu, sulama günü damla animasyonu (framer-motion).
- **İki kuyu kesiti (SVG), yan yana:** "Alışkanlıkla" ve "Asistanla"; o güne kadar çekilen kümülatif su yükselen bir sütun olarak, sayısal etiketiyle.
- Altında kümülatif su grafiği; kaydırıcıyla senkron dikey çizgi.

### 4.4 Etki kartları
- Sayaç animasyonuyla su (m³), enerji (kWh), CO₂ (ton), TL.
- Somut karşılıklar: olimpik havuz (2.500 m³) ve hane yıllık su tüketimi. Sabitler `src/engine/constants.ts` içinde, hane değeri için yorum: `// TÜİK belediye su istatistikleri, doğrulanacak`.

### 4.5 Tasarım
- Renkler: krem arka plan, toprak kahvesi metin, olgun buğday sarısı vurgu; su için tek canlı mavi, güneş için sarı.
- Kartlarda bol boşluk, büyük rakamlar, ikonlar (lucide-react).
- Ana akış 3 adım: 1) Tarlanı göster (harita + yazılı anlatım)  2) Planın (güneş–pompa grafiği, haftalık plan)  3) Etkin (sezon oynatıcı + etki kartları)

---

## Aşama 5 – Telegram botu (üründe WhatsApp, prototipte Telegram)

### 5.1 Kurulum
- BotFather'dan `TELEGRAM_BOT_TOKEN`.
- `/api/telegram-webhook`: `/start` komutunda chat_id'yi kaydet (Upstash Redis / Vercel KV; yoksa `TELEGRAM_DEMO_CHAT_ID`). Kayıtta kullanıcıya hangi tarlaya bağlandığını söyle.
- Webhook kurulumu (`setWebhook`) README'de.

### 5.2 Bildirim
- `/api/send-alert`: mevcut tarla ve plan verisini al, `/api/explain-plan` ile `format: "telegram"` mesajı üret, `sendMessage` ile gönder.
- Mesaj (en fazla 5 satır, emoji ölçülü):
  ```
  🌱 Karapınar – Pancar tarlası
  💧 Yarın 10:00–15:00 arası 5 saat sulayın.
  🌧 Cumartesi yağmur bekleniyor, pazartesiye kadar sulamayın.
  ☀️ Pompa tamamen güneşle çalışacak.
  📉 Bu hafta tahmini 1.200 m³ su ve 780 kWh tasarruf.
  ```
  (Sayılar örnektir; gerçekte yalnızca motor çıktısından gelir.)
- Altında inline keyboard: "✅ Suladım", "🌧 Yağmur yağdı", "📅 Haftalık plan".

### 5.3 Geri bildirim döngüsü
- "✅ Suladım": o güne gerçek sulama kaydı ekle (plandaki I_net, ya da kullanıcı saat girerse `Q × saat / alan`).
- "🌧 Yağmur yağdı": o güne gözlenen yağış kaydı ekle (kullanıcıya "az / orta / çok" seçtir → 5 / 15 / 30 mm varsayımı, etiketli).
- Su dengesi bu kayıtlarla yeniden hesaplanır; kullanıcıya güncel durum kısa mesajla döner ("Toprağınızda yaklaşık 4 günlük su var").
- "📅 Haftalık plan": 7 günlük planı kısa liste olarak gönder.

### 5.4 Otomatik bildirim
- `vercel.json` cron: her sabah 07:00 (Europe/Istanbul). Sulama sezonu dışındaysa mesaj gönderme.
- Tahminde yağış değişip planı etkilediyse ek uyarı: "Plan değişti: bugün sulamayın, akşam yağmur bekleniyor."

### 5.5 Web arayüzüyle bağlantı
- Web'de "Telegram'a bildirim gönder" butonu (demoda canlı gösterim için) ve botu başlatma linki + QR kodu.

### 5.6 Opsiyonel: Telegram sesli mesajı (zaman kalırsa)
- Ana giriş yazı. Kullanıcı sesli mesaj gönderirse: dosyayı Telegram API'den indir, Gemini'ye ses olarak gönder, `/api/parse-farm` şemasıyla yapılandırılmış veriye çevir, sonucu onay butonlarıyla kullanıcıya göster.
- Desteklenmiyorsa: "Şimdilik lütfen yazarak anlatın" mesajı.

---

## Aşama 6 – Sunum katmanı ve deploy
- Üstte bağlam bandı: "Konya Kapalı Havzası'nda aşırı yeraltı suyu çekimi obruk oluşumunu hızlandırıyor. Güneş enerjisi pompayı bedavaya çalıştırınca bu risk artabilir."
- "Bugün çalışan / Vizyon" bölümü:
  - Bugün: haritada tarla çizme, yazılı anlatımdan tarla bilgisi (Gemini), FAO-56 su dengesi (gerçek hava verisi), güneşe göre saatlik plan, geriye dönük test ve sezon oynatıcı, etki hesabı, Telegram uyarıları ve geri bildirim
  - Vizyon: WhatsApp kanalı, Sentinel-2 NDVI ile tarla bazında kalibrasyon, pompa kontrol cihazıyla otomatik çalıştırma, kuyu sayacı ile ölçülmüş tasarruf, kooperatif paneli
- Hata durumları: Open-Meteo, Gemini veya Telegram hatasında anlaşılır Türkçe mesaj, elle girişe dönüş.
- README.md İngilizce: amaç, mimari, veri kaynakları, varsayımlar, sınırlar, kurulum, ortam değişkenleri, webhook ve cron.
- Vercel deploy.

## Test (vitest)
- Kc eğrisi: aşama sınırlarında doğru değerler
- Su dengesi: yağışsız sabit ET0 ile sulama aralığının RAW/ETc ile tutarlı olması; dış kayıtların (sulama/yağış) dengeyi doğru güncellemesi
- Pompa enerjisi: H=120, V=1000, η=0.5 → ≈654 kWh
- Planlama: pompa saatleri en yüksek GTI saatlerine yerleşiyor mu
- Etki: baseline < model ise tasarruf iddia edilmiyor mu
- Alan dönüşümü: bilinen poligon için dekar doğru mu

---

## Claude Code prompt'ları (sırayla kullan)

**Prompt 1 – Başlangıç ve motor**
```
SPEC.md dosyasını baştan sona oku. "Değişmez kurallar" bölümüne her aşamada uy.
Vite + React + TypeScript + Tailwind ile projeyi kur, vitest ekle.
Sadece Aşama 1'i uygula: form, crops.ts, soil.ts, waterBalance.ts, Open-Meteo tahmin ve
archive istemcisi, günlük grafik. Motor fonksiyonları saf ve test edilebilir olsun.
Bitince testleri çalıştır, nasıl başlatacağımı söyle ve dur.
```

**Prompt 2 – Plan, etki, geriye dönük test**
```
SPEC.md Aşama 2'yi uygula: pump.ts, pv.ts, schedule.ts, impact.ts, baseline hesabı,
geriye dönük test ekranı (kümülatif su grafiği) ve bu haftanın planı.
Geriye dönük test ana ekran olsun. Sınır metnini kaldırılamaz şekilde ekle.
Testleri yaz ve çalıştır, sonra dur.
```

**Prompt 3 – Gemini**
```
SPEC.md Aşama 3'ü uygula. Vercel serverless fonksiyonları: /api/parse-farm ve
/api/explain-plan (web ve telegram formatları). @google/genai kullan, responseSchema ile
yapılandırılmış çıktı al. API anahtarı yalnızca sunucuda. Sayı doğrulama fonksiyonunu ekle.
Yerelde vercel dev ile çalıştırma talimatını ver ve dur.
```

**Prompt 4 – Görsel arayüz**
```
SPEC.md Aşama 4'ü uygula; motor fonksiyonlarına DOKUNMA. Sırayla: 4.1 uydu haritasında
tarla çizme, 4.2 güneş–pompa grafiği, 4.3 sezon oynatıcı (toprak deposu, iki kuyu kesiti,
senkron grafik), 4.4 etki kartları, 4.5 tasarım ve 3 adımlı akış. Web'de sesli giriş ekleme.
Her alt adımdan sonra çalışır durumda olduğunu doğrula. Zaman kısıtlıysa öncelik
4.3 > 4.1 > 4.2 > 4.4. Bitince dur.
```

**Prompt 5 – Telegram**
```
SPEC.md Aşama 5'i uygula: webhook ve /start kaydı, /api/send-alert, inline keyboard
(Suladım / Yağmur yağdı / Haftalık plan), geri bildirimlerin su dengesine işlenmesi,
sabah 07:00 cron ve plan değişikliği uyarısı, web'de "Telegram'a gönder" butonu ve QR.
Ana giriş yazı. 5.6 sesli mesajı yalnızca geri kalan her şey çalışıyorsa ekle.
setWebhook adımlarını README'ye yaz ve dur.
```

**Prompt 6 – Sunum ve deploy**
```
SPEC.md Aşama 6'yı uygula: bağlam bandı, "Bugün çalışan / Vizyon" bölümü, hata durumları,
İngilizce README. Mobil görünümü kontrol et. Vercel deploy adımlarını ve gereken ortam
değişkenlerini (GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, KV/Redis veya TELEGRAM_DEMO_CHAT_ID)
listele.
```

**Hata ayıklama prompt'u**
```
[Hata mesajı / beklenmeyen davranış]. Önce nedenini açıkla, sonra en küçük değişiklikle düzelt.
Motor fonksiyonlarına dokunuyorsan ilgili testi güncelle ve tüm testleri çalıştır.
```

**\*\*\*\***\_\_\_**\*\*\*\***Kurallar:

1.Gite her aşama bittiğinde commit atılacak ama sen atmayacaksın ben atacağım sen bana sadece komutları vereceksin commit yazısını yazacaksın geri kalanı ben yapacağım.

2.
