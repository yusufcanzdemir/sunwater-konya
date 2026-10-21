# Teslim Dokümanları Brief'i – Güneşli Sulama Asistanı

> Bu dosyayı proje köküne koy ve AI'a şunu söyle:
> "TESLIM_BRIEF.md dosyasını baştan sona oku. Önce repoyu inceleyip prototipin gerçek durumunu çıkar, sonra Bölüm 6'daki dosyaları üret. Bölüm 3'teki veri kurallarına harfiyen uy."

---

## 1. Görevin

Bu projenin üç ödev teslimi için dokümanları hazırlayacaksın:

- **PDF A – `gorev1_ve_gorev3.pdf`**: Görev 1 (Problem Definition, tek sayfa) + Görev 3 (Build & Show, tek sayfa). Toplam 2 sayfa.
- **PDF B – `gorev2_PDR.pdf`**: Görev 2 (Project Design Review). **Ayrı dosya, kesinlikle tek sayfa.**
- **`form_cevaplari.md`**: Üç görevin form/anket sorularına kopyala-yapıştır yapılabilecek kısa cevaplar.

Dil Türkçe. Bugünün tarihi 21 Ekim 2026. Görev 3 teslimi bugün.

---

## 2. Projenin son hâli (özet)

**Problem:** Konya Kapalı Havzası'nda tarımsal sulama için yeraltı suyu aşırı çekiliyor; bu, obruk oluşumunun bilinen ana etkenlerinden biri. Bölgede güneş enerjili sulama yaygınlaşıyor. Pompalamanın marjinal maliyeti sıfıra yaklaşınca aşırı su çekimi riski artabilir. Çiftçiler sulamayı çoğunlukla göz kararı ve alışkanlıkla yapıyor.

**Çözüm:** Çiftçiye tarlasının gerçek su ihtiyacını FAO-56 yöntemi ve gerçek hava verisiyle hesaplayan, pompayı güneş üretiminin en yüksek olduğu saatlere planlayan, mevcut alışkanlığa göre su, enerji ve CO₂ etkisini gösteren ve uyarıları çiftçinin telefonuna (prototipte Telegram, üründe WhatsApp) gönderen bir sistem. Aşırı sulamadan vazgeçilerek artan güneş elektriği, mevzuatın elverdiği koşullarda şebekeye verilebilecek bir değer olarak gösterilir.

**Climathon eşleşmesi:**
- COP31: 2035'e kadar elektrifikasyonu %35'e çıkarma (dizel pompaların güneş destekli elektrikli sulamaya dönüşümünü su kaynağına zarar vermeden sürdürülebilir kılmak)
- Siemens Impact Area: Karbonsuzlaştırma ve Enerji (ana), Kaynak Verimliliği ve Döngüsellik (su; destekleyici)
- SDG: SDG 6, özellikle 6.4 su kullanım verimliliği (ana); SDG 7 ve SDG 13 (destekleyici)

**Prototip:** Repoyu incele ve hangi özelliklerin gerçekten çalıştığını kendin belirle (Bölüm 5). Planlanan özellikler: haritada tarla çizme, Gemini ile yazılı anlatımdan tarla bilgisi çıkarma, FAO-56 su dengesi, güneşe göre saatlik pompa planı, geçen sezonun gerçek hava verisiyle geriye dönük test ve sezon oynatıcı, etki kartları, Telegram uyarıları ve "Suladım / Yağmur yağdı" geri bildirimi.

---

## 3. VERİ KURALLARI (harfiyen uy)

### 3.1 Doğrulanmış veriler – yalnızca bunları sayısal olarak kullan

| # | Bilgi | Doğru ifade | Kaynak |
|---|---|---|---|
| V1 | Tarımın su kullanımı | Türkiye'de kullanılan yıllık yaklaşık 57 milyar m³ suyun %77'si tarımda harcanıyor | DSİ açıklaması, 24 Haziran 2024 |
| V2 | COP31 | 9–20 Kasım 2026 tarihlerinde Antalya'da **düzenlenecek** (geçmiş zaman kullanma) | UNFCCC |
| V3 | Karapınar GES | 2022 sonu itibarıyla 1.350 MWp / 1.000 MWe kapasitesi işletmeye alındı | ETKB Faaliyet Raporu |
| V4 | ET₀ verisi | Open-Meteo, FAO-56 Penman–Monteith temelli referans evapotranspirasyon (ET₀) sağlıyor. ET₀ tek başına sulama ihtiyacı değildir; ürün katsayısı, etkili yağış, toprak su dengesi ve sulama verimi ile birlikte kullanılır | Open-Meteo; FAO Irrigation and Drainage Paper 56 (Allen vd., 1998) |
| V5 | Şebekeye satış | Türkiye'de lisanssız üretim ve mahsuplaşma düzenlemeleri var; ancak fazla enerjinin satış koşulları tesisin bağlantısına, sözleşmesine ve geçerli mevzuata göre değişir. **"Koşullu" olarak ifade et** | EPDK |
| V6 | Güneş pompası riski | Güneş enerjili pompaların yeraltı suyu çekimini artırabileceği literatürde tartışılan bir risk; sonuç koşullara bağlı. 2026 tarihli bir Hindistan çalışması, şebekeye enerji satışı teşviklerinin bazı akifer koşullarında su kullanımını azaltabildiğini gösteriyor. **Bunu Konya için kesin sonuç değil, araştırılması gereken bir risk olarak sun; Hindistan çalışmasını çözümümüzün teşvik kurgusunu destekleyen bir bulgu olarak kullan** | ScienceDirect'te yayımlanmış 2026 çalışması |
| V7 | Emisyon faktörü (güneş) | ETKB'nin yayımladığı belgede güneş ve rüzgâr projeleri için birleşik marj emisyon faktörü 0,6242 tCO₂/MWh. **Yalnızca "şebekeye verilen güneş elektriğinin yerini aldığı üretim" senaryosunda kullan ve tanımını belirt.** Şebekeden tüketilen elektriğin genel emisyon faktörü olarak kullanma | ETKB |
| V8 | Dizel emisyon faktörü | ~2,68 kg CO₂/L | IPCC 2006 Guidelines |

### 3.2 Doğrulanmamış veriler – SAYI KULLANMA

Aşağıdakiler için **hiçbir sayı yazma**. Nitel ifade kullan ve verinin hangi kurumlarca izlendiğini söyle:
- Konya'daki obruk sayısı → "Havzada obruk oluşumunun son yıllarda arttığı DSİ, AFAD, MTA ve Konya Teknik Üniversitesi Obruk Araştırma Merkezi çalışmalarında ele alınmaktadır."
- Yeraltı suyu seviyesindeki düşüş miktarı → "DSİ izleme kuyularında uzun süreli yeraltı suyu düşüşü raporlanmaktadır."
- Ruhsatsız kuyu sayısı → yazma veya "çok sayıda ruhsatsız kuyu bulunduğu belirtilmektedir" de.
- Konya'nın buğday ve şeker pancarı üretimindeki sıralaması → "Konya, Türkiye'nin önemli buğday ve şeker pancarı üretim alanlarından biridir" de, sıralama verme.
- Şebekeden tüketilen elektriğin genel emisyon faktörü → kullanma.

### 3.3 Senaryo hesapları – "varsayım" ve "hedef" olarak etiketle

Örnek tarla senaryosu (matematiği doğrulandı; varsayımlar gerçek tarlada ölçülmedi):

| Kalem | Değer | Not |
|---|---|---|
| Alan, ürün | 100 dekar şeker pancarı | varsayım |
| Sezonluk net su ihtiyacı | 600 mm → 60.000 m³ | varsayım |
| Salma sulama verimi | %55 → brüt çekim 109.091 m³ | varsayım |
| Basma yüksekliği, pompa-motor verimi | 120 m, %50 → 0,654 kWh/m³ | varsayım |
| Su çekiminde azalma | **%20 (hedef, pilotta sınanacak)** → 21.818 m³ | hedef |
| Enerji karşılığı | 14.273 kWh | hesap |
| CO₂ – güneş elektriği şebekeye verilirse | 14.273 kWh × 0,6242 kg/kWh ≈ **8,9 ton** | V7, koşullu |
| CO₂ – pompa dizelle çalışıyorsa | 14.273 kWh × 0,30 L/kWh (varsayım) × 2,68 kg/L ≈ **11,5 ton** | V8 + varsayım |

Ölçek senaryosu (aynı varsayımlar, şebekeye verilen güneş senaryosu):
- 100 tarla: ~2,18 milyon m³ su, ~1,43 GWh, ~891 ton CO₂
- 1.000 tarla: ~21,8 milyon m³ su, ~14,3 GWh, ~8.909 ton CO₂

Zorunlu ifadeler:
- "%20, doğrulanmış bir sonuç değil; pilotta kuyu sayacı ölçümüyle sınanacak hedeftir."
- Şebekeye verilen enerji CO₂ hesabı için: "Şebekeye gerçekten verilen net enerji ve geçerli mevzuata bağlı bir senaryo hesabıdır."
- Etkinin birincil ölçütleri **su (m³)** ve **enerji (kWh)**; CO₂ ikincil ve senaryoya bağlı.
- Obruk üzerindeki etki doğrudan ölçülmez; problem bağlamı olarak sunulur.

### 3.4 Prototipten gelen sayı
Repoda demo tarla için geriye dönük test çalışıyorsa, prototipi çalıştırıp sonucu al ve Görev 3'te şu etiketle kullan: "Prototip geriye dönük simülasyonu – geçen sezonun gerçek hava verisi (Open-Meteo), varsayımlı tarla ve alışkanlık parametreleri." Çalıştıramıyorsan sayı uydurma; ekran kaydında gösterileceğini yaz.

### 3.5 Genel
- `[Doğrula]` gibi etiketler nihai dokümanlarda OLMAYACAK.
- Kaynakça her sayfanın altında kısa ve küçük puntoyla; yalnızca Bölüm 3.1'deki kaynaklar ve FAO-56.
- Şirket ve ürün adlarını (CropX, Netafim vb.) yalnızca alternatif örneği olarak, iddia içermeden kullan.

---

## 4. Ödev gereksinimleri ve içerik planı

### Görev 1 — Problem Definition (PDF A, sayfa 1)
Başlıklar ödevdeki maddelerle birebir aynı olsun:
1. **Problem ve kök neden (1–2 cümle):** Konya Kapalı Havzası'nda ihtiyaç bilinmeden yapılan ve giderek güneş enerjisiyle "bedava" hâle gelen sulama yeraltı suyunu aşırı çekiyor; kök neden, çiftçinin bitkinin gerçek su ihtiyacını bilmemesi ve pompalama maliyeti düştükçe tasarruf motivasyonunun kaybolması.
2. **Etkilenenler ve en çok etkilenen grup:** Havzadaki çiftçiler (en çok etkilenen: kuyusu derinleşen, pompalama maliyeti artan orta ölçekli çiftçiler), kırsal yerleşimler, altyapı ve enerji yatırımları (Karapınar GES, V3), gıda güvenliği.
3. **Kanıt:** V1, V3, V6 ve Bölüm 3.2'deki nitel ifadeler.
4. **Neden şimdi ve teknolojinin rolü:** Güneş enerjili sulamaya geçişin hızlandığı dönem; COP31 (V2); açık hava verisi (V4) ve büyük dil modelleri ile tarla bazında, çiftçinin anlayacağı dilde öneri artık ekonomik.
5. **Kişisel önem:** Kullanıcıya sor (Bölüm 7). Cevap yoksa bu alanı "[Kişisel bağlantı – öğrenci tarafından doldurulacak]" olarak bırak ve kullanıcıyı uyar.
6. **COP31 / Siemens / SDG:** Bölüm 2'deki eşleşme.

### Görev 2 — PDR (PDF B, tek sayfa, ayrı dosya)
1. **Çözüm (1–2 cümle)**
2. **Nasıl çalışıyor ve teknolojinin rolü:** çiftçinin anlatımı → Gemini yapılandırılmış veri → FAO-56 su dengesi (ET₀ × Kc, etkili yağış, toprak su dengesi, sulama verimi; V4) → GES saatlik üretim tahmini ve pompa planı → sade Türkçe açıklama → Telegram/WhatsApp uyarısı ve geri bildirim. Hesapları LLM değil, fizik/agronomi motoru yapar.
3. **Alternatifler ve fark:** ticari akıllı sulama platformları (pahalı donanım/abonelik), FAO CROPWAT (uzman aracı), güneş pompası kontrolcüleri (suyun gerekip gerekmediğine bakmaz), göz kararı sulama. Fark: su ihtiyacı + güneş üretimini birlikte planlama, tasarrufu gelire bağlayan teşvik kurgusu (V5 koşullu, V6 destekleyici bulgu), donanımsız başlangıç, Türkçe ve mesajlaşma kanalı.
4. **Program süresince prototiplenecek kısım:** FAO-56 su dengesi motoru, güneşe göre plan, gerçek hava verisiyle geriye dönük test, Gemini ile doğal dil girişi ve açıklama, Telegram uyarısı. Kapsam dışı: pompa kontrol donanımı, uydu NDVI kalibrasyonu, ölçülmüş saha tasarrufu.
5. **Baseline'a göre etki hedefi:** Bölüm 3.3 tablosunun kısa hâli + zorunlu ifadeler. Ölçülebilir hedefler: pilotta kuyu sayacıyla ≥%20 su azalması (verim kaybı olmadan), pompa saatlerinin ≥%80'i güneş saatlerinde.
6. **Dört kriter (1–5):** Greener 4, Circular 3, Financeable 3, Socially Impactful 4; her biri tek cümle gerekçe:
   - Greener 4: pompalama enerjisini ve dizel kullanımını azaltır; yeraltı suyunu korur; tarla başına etki orta ölçekte.
   - Circular 3: atık döngüsü yok, ancak sınırlı bir doğal kaynak olan yeraltı suyunu kullanımda tutar.
   - Financeable 3: çiftçiye enerji tasarrufu ve koşullu satış geliri; kooperatif ve GES kurulum firmalarıyla gelir yolları; ödeme isteği henüz doğrulanmadı.
   - Socially Impactful 4: çiftçi geçimi, kırsal güvenlik ve gıda güvenliği; teknik bilgisi olmayan çiftçiye Türkçe araç.

### Görev 3 — Build & Show (PDF A, sayfa 2)
1. **Prototip bağlantısı:** Kullanıcıdan al (Bölüm 7). Yoksa "[Bağlantı eklenecek]" bırak.
2. **Şu anda gerçekten çalışan temel fonksiyon:** "Geçen sezonun gerçek hava verisiyle, çizilen tarla için günlük su ihtiyacını hesaplayıp güneşe göre sulama planı üreten ve mevcut alışkanlığa göre su ve enerji farkını gösteren motor" (repo durumuna göre düzelt) + Bölüm 3.4'teki sayı.
3. **Araçlar ve seçme nedenleri:** Claude Code (özel fizik/agronomi mantığı ve test edilebilir motor gerektiği için), React + TypeScript, Open-Meteo (ücretsiz, FAO-56 ET₀ ve geçmiş veri), Gemini API (yapılandırılmış çıktı ile doğal dil anlama ve Türkçe açıklama), Leaflet + Esri uydu katmanı, Telegram Bot API (onay gerektirmeden hızlı kurulum; üründe WhatsApp), Vercel. Repoda gerçekte kullanılanlara göre düzelt.
4. **Çalışan ve mock/placeholder bölümler:** Bölüm 5'te çıkardığın tabloyu kullan. Dürüst ol; mock olan her şeyi yaz.
5. **Yapay zekânın kullanıcı için işlevi:** (a) çiftçinin serbest metnini yapılandırılmış tarla verisine çevirmek, eksik bilgiyi sormak; (b) motorun sonucunu teknik terim olmadan, yalnızca hesaplanmış sayılarla sade Türkçeye çevirmek (sayı doğrulama kontrolüyle). Hesaplamaları yapay zekâ yapmaz; bu, etki iddiasını savunulabilir kılar.

---

## 5. Önce yapman gereken: prototip durum analizi

Dokümanları yazmadan önce repoyu incele ve şu tabloyu çıkar (bunu bana da göster):

| Özellik | Durum (Çalışıyor / Kısmen / Mock / Yok) | Kanıt (dosya, test veya çalıştırma sonucu) |
|---|---|---|
| Haritada tarla çizme ve alan hesabı | | |
| Gemini ile yazılı anlatımdan tarla bilgisi | | |
| FAO-56 su dengesi (gerçek Open-Meteo verisi) | | |
| Güneşe göre saatlik pompa planı | | |
| Geriye dönük test ve sezon oynatıcı | | |
| Etki kartları | | |
| Gemini ile sade Türkçe açıklama | | |
| Telegram uyarısı ve geri bildirim | | |
| Deploy edilmiş paylaşılabilir link | | |

Testleri çalıştır. Bir özellik çalışmıyorsa dokümanda "çalışıyor" yazma.

---

## 6. Çıktı dosyaları ve biçim

Üreteceğin dosyalar (`deliverables/` klasörüne):
1. `gorev1_ve_gorev3.pdf` – 2 sayfa (sayfa 1: Görev 1, sayfa 2: Görev 3)
2. `gorev2_PDR.pdf` – **tam 1 sayfa**
3. `form_cevaplari.md` – her görev için ödev maddeleri sırasıyla, form kutusuna sığacak kısalıkta (madde başına 1–3 cümle)
4. Kaynak HTML dosyaları (sonradan düzenleme için)

Biçim:
- A4, kenar boşluğu ~15 mm, gövde 10–10,5 pt, sade sans-serif yazı tipi (Türkçe karakter desteği olan, ör. Inter veya Noto Sans), başlıklar koyu.
- Her sayfanın üstünde: proje adı "Güneşli Sulama Asistanı", görev adı, öğrenci adı alanı.
- Görsel olarak tek sayfaya sığması için: kısa paragraflar, gerektiğinde küçük tablolar (etki ve dört kriter için tablo uygun). Uzun madde listelerinden kaçın.
- Prototipten bir ekran görüntüsü (sezon oynatıcı veya güneş–pompa grafiği) Görev 3 sayfasına küçük boyutta eklenebilir.
- Üretim: HTML + CSS → PDF (Playwright/Chromium `page.pdf` veya WeasyPrint). Türkçe karakterleri kontrol et.
- **Sayfa sayısı kontrolü zorunlu:** PDF'leri ürettikten sonra sayfa sayısını programatik olarak doğrula (ör. pypdf). PDR 1 sayfayı aşarsa metni kısalt, yazı boyutunu 9,5 pt'nin altına düşürme; tekrar üret.

---

## 7. Kullanıcıya soracakların (yazmaya başlamadan önce, tek mesajda)

1. Adın ve okulun/bölümün (sayfa başlığı için)
2. Problemle kişisel bağlantın (2–3 cümle; Konya ile bağın varsa, problemi ilk nerede fark ettiğin)
3. Prototip bağlantısı (Vercel/AI Studio linki veya ekran kaydı linki)

Cevap gelmeyen alanları köşeli parantezli yer tutucuyla bırak ve sonunda listele.

---

## 8. Son kontrol listesi

- [ ] Bölüm 3.2'deki hiçbir konuda sayı yok
- [ ] COP31 "düzenlenecek" olarak yazılı (V2)
- [ ] %77 ve kaynağı DSİ 2024 olarak yazılı (V1)
- [ ] 0,6242 yalnızca şebekeye verilen güneş senaryosunda ve tanımıyla kullanılmış (V7)
- [ ] Şebekeye satış "koşullu" (V5); Hindistan bulgusu "koşullara bağlı" (V6)
- [ ] %20 "hedef" olarak etiketli; senaryo değerleri "varsayım"
- [ ] Görev 3'teki çalışan/mock ayrımı Bölüm 5 analiziyle tutarlı
- [ ] PDR ayrı dosya ve tam 1 sayfa; PDF A tam 2 sayfa
- [ ] `[Doğrula]` etiketi yok; yer tutucular listelendi
