# Form cevapları – Güneşli Sulama Asistanı

Öğrenci: Yusuf – Selçuk Üniversitesi · Prototip: https://sunwater-konya.vercel.app/

---

## Görev 1 – Problem Definition

**1. Problem ve kök neden**
Konya Kapalı Havzası'nda tarımsal sulama, bitkinin gerçek ihtiyacı bilinmeden ve giderek güneş enerjisiyle "bedava" hâle gelen pompalarla yapılıyor; bu da yeraltı suyunun aşırı çekilmesine yol açıyor. Kök neden, çiftçinin tarlasının günlük su ihtiyacını bilmemesi ve pompalama maliyeti düştükçe tasarruf motivasyonunun kaybolması.

**2. Etkilenenler ve en çok etkilenen grup**
Havzadaki çiftçiler, kırsal yerleşimler, altyapı ve enerji yatırımları (ör. 2022 sonu itibarıyla 1.350 MWp / 1.000 MWe kapasiteyle işletmeye alınan Karapınar GES) ve gıda güvenliği etkileniyor. En çok etkilenen grup, kuyusu derinleştikçe pompalama maliyeti artan orta ölçekli çiftçiler.

**3. Kanıt**
Türkiye'de kullanılan yıllık yaklaşık 57 milyar m³ suyun %77'si tarımda harcanıyor (DSİ, 2024). DSİ izleme kuyularında uzun süreli yeraltı suyu düşüşü raporlanıyor; havzada obruk oluşumunun son yıllarda arttığı DSİ, AFAD, MTA ve Konya Teknik Üniversitesi Obruk Araştırma Merkezi çalışmalarında ele alınıyor. Güneş enerjili pompaların su çekimini artırabileceği literatürde tartışılan, koşullara bağlı bir risk; Konya için araştırılması gereken bir risk olarak ele alıyoruz.

**4. Neden şimdi ve teknolojinin rolü**
Havzada güneş enerjili sulamaya geçiş hızlanıyor ve 9–20 Kasım 2026'da Antalya'da düzenlenecek COP31 enerji dönüşümünü gündemin önüne taşıyor. Open-Meteo'nun ücretsiz FAO-56 temelli ET₀ verisi ve büyük dil modelleri sayesinde tarla bazında, çiftçinin anlayacağı dilde öneri üretmek artık ekonomik.

**5. Kişisel önem**
Konya'da, Selçuk Üniversitesi'nde okuyorum. Sorunu ilk olarak obruklar ve yeraltı suyu üzerine çıkan haberlerde fark ettim; yaşadığım şehrin çevresinde bu riskin büyüdüğünü görmek konuyu benim için somutlaştırdı.

**6. COP31 / Siemens / SDG eşleşmesi**
COP31: 2035'e kadar elektrifikasyonu %35'e çıkarma – dizel pompaların güneş destekli elektrikli sulamaya dönüşümünü su kaynağına zarar vermeden sürdürülebilir kılmak. Siemens: Karbonsuzlaştırma ve Enerji (ana), Kaynak Verimliliği ve Döngüsellik – su (destekleyici). SDG: SDG 6, özellikle 6.4 (ana); SDG 7 ve SDG 13 (destekleyici).

---

## Görev 2 – Project Design Review (PDR)

**1. Çözüm**
Çiftçiye tarlasının gerçek su ihtiyacını FAO-56 yöntemi ve gerçek hava verisiyle hesaplayan, pompayı güneş üretiminin en yüksek olduğu saatlere planlayan ve uyarıları telefonuna gönderen bir karar destek sistemi. Aşırı sulamadan vazgeçilerek artan güneş elektriği, mevzuatın elverdiği koşullarda şebekeye verilebilecek bir değer olarak gösterilir.

**2. Nasıl çalışıyor ve teknolojinin rolü**
Çiftçinin anlatımı → Gemini ile yapılandırılmış tarla verisi → FAO-56 su dengesi (ET₀ × Kc, etkili yağış, toprak su dengesi, sulama verimi) → GES saatlik üretim tahmini ve pompa planı → sade Türkçe açıklama → Telegram/WhatsApp uyarısı ve geri bildirim. Hesapları LLM değil, test edilmiş fizik/agronomi motoru yapar; ET₀ tek başına sulama ihtiyacı değildir.

**3. Alternatifler ve fark**
Ticari akıllı sulama platformları donanım ve abonelik gerektirir, FAO CROPWAT uzman aracıdır, güneş pompası kontrolcüleri suyun gerekip gerekmediğine bakmaz, göz kararı sulama ihtiyacı bilmeden yapılır. Farkımız: su ihtiyacı ve güneş üretimini birlikte planlamak ve tasarrufu koşullu olarak şebekeye verilebilecek enerjiye bağlamak (2026 tarihli bir Hindistan çalışması bu tür teşviklerin bazı akifer koşullarında su kullanımını azaltabildiğini gösteriyor; sonuç koşullara bağlı); donanımsız, Türkçe ve mesajlaşma kanalından.

**4. Program süresince prototiplenecek kısım**
FAO-56 su dengesi motoru, güneşe göre saatlik pompa planı, gerçek hava verisiyle geriye dönük test, Gemini ile doğal dil girişi ve açıklama, Telegram uyarısı. Kapsam dışı: pompa kontrol donanımı, uydu NDVI kalibrasyonu, ölçülmüş saha tasarrufu.

**5. Baseline'a göre etki hedefi**
Örnek tarla senaryosu (varsayım): 100 dekar şeker pancarı, 600 mm net ihtiyaç, %55 salma verimi → 109.091 m³ brüt çekim; %20 azalma hedefiyle 21.818 m³ su ve 14.273 kWh enerji; CO₂ güneş elektriği şebekeye verilirse ≈8,9 ton (0,6242 tCO₂/MWh: ETKB'nin şebekeye verilen güneş elektriğinin yerini aldığı üretim için birleşik marj faktörü; şebekeye gerçekten verilen net enerji ve geçerli mevzuata bağlı bir senaryo hesabıdır), pompa dizelse ≈11,5 ton. %20, doğrulanmış bir sonuç değil; pilotta kuyu sayacı ölçümüyle sınanacak hedeftir. Ölçülebilir hedefler: verim kaybı olmadan ≥%20 su azalması ve pompa saatlerinin ≥%80'inin güneş saatlerinde olması; birincil ölçütler su (m³) ve enerji (kWh).

**6. Dört kriter (1–5)**
Greener 4: pompalama enerjisini ve dizel kullanımını azaltır, yeraltı suyunu korur; tarla başına etki orta ölçekte. Circular 3: atık döngüsü yok, ancak sınırlı bir kaynak olan yeraltı suyunu kullanımda tutar. Financeable 3: enerji tasarrufu ve koşullu satış geliri, kooperatif ve GES kurulum firmalarıyla gelir yolları; ödeme isteği henüz doğrulanmadı. Socially Impactful 4: çiftçi geçimi, kırsal güvenlik ve gıda güvenliği; teknik bilgisi olmayan çiftçiye Türkçe araç.

---

## Görev 3 – Build & Show

**1. Prototip bağlantısı**
https://sunwater-konya.vercel.app/ – "Demo tarla yükle" → "Planı hesapla".

**2. Şu anda gerçekten çalışan temel fonksiyon**
Geçen sezonun gerçek hava verisiyle, haritada çizilen veya yazıyla anlatılan tarla için günlük su ihtiyacını FAO-56 yöntemiyle hesaplayan, pompayı güneş saatlerine planlayan ve mevcut alışkanlığa göre su ve enerji farkını gösteren motor. Karapınar'da 100 dekar şeker pancarı (20 Nisan – 16 Ekim 2026) için plan 155.122 m³, alışkanlık 216.000 m³: yaklaşık 60.878 m³ (%28) daha az su ve 39.814 kWh daha az pompa enerjisi (prototip geriye dönük simülasyonu – geçen sezonun gerçek hava verisi (Open-Meteo), varsayımlı tarla ve alışkanlık parametreleri).

**3. Araçlar ve seçme nedenleri**
Claude Code (özel fizik/agronomi mantığı ve test edilebilir motor; 101 otomatik test), React + TypeScript (Vite, Tailwind, Recharts, Framer Motion), Open-Meteo (ücretsiz FAO-56 ET₀, tahmin ve geçmiş veri), Gemini API (yapılandırılmış çıktıyla doğal dil anlama ve Türkçe açıklama), Leaflet + Geoman + Esri uydu + Turf (tarla çizme ve alan), Telegram Bot API (hızlı kurulum; üründe WhatsApp), Vercel (paylaşılabilir link ve sunucu fonksiyonları).

**4. Çalışan ve mock/placeholder bölümler**
Çalışıyor (yayında): harita, FAO-56 su dengesi, güneşe göre plan, geriye dönük test ve sezon oynatıcı, etki kartları. Kısmen: Gemini ile metin okuma ve açıklama ile Telegram uyarısı/geri bildirimi yerelde çalışıyor, yayındaki sunucu fonksiyonu düzeltiliyor; Telegram için kalıcı depolama ve sabah bildirimi henüz yayında çalışmadı. Varsayım: tarla ve alışkanlık değerleri, ürün/toprak katsayıları, yağmur düğmesi miktarları ve CO₂ kartı; yok: NDVI, pompa kontrolü, kuyu sayacı, WhatsApp, kooperatif paneli.

**5. Yapay zekânın kullanıcı için işlevi**
(a) Çiftçinin serbest metnini yapılandırılmış tarla verisine çevirir ve eksik bilgiyi sorar; (b) motorun sonucunu teknik terim olmadan, yalnızca hesaplanmış sayılarla sade Türkçeye çevirir ve her sayı motor çıktısıyla doğrulanır. Hesaplamaları yapay zekâ yapmaz; bu, etki iddiasını savunulabilir kılar.
