# İddia kontrolü (önceki proje dokümanı)

Kaynak: "Güneşli Sulama, Obruksuz Konya – Problem ve Çözüm Dokümantasyonu" içindeki iddiaların
dış kaynaklarla karşılaştırılması (kullanıcı tarafından yaptırıldı, 2026-10-25'te buraya işlendi).
Kural 7: "Doğrulanmadı" satırlarındaki rakamlar hiçbir ekranda ve belgede kullanılmaz.
Aşama 15'te kullanılan satırlar bağlantılarıyla `docs/DATA_SOURCES.md`'ye taşınır.

## Durum tablosu

| İddia | Durum | Kullanım |
|---|---|---|
| Türkiye'de suyun ~%75'i tarımda | Doğrulandı, güncel değer **%77** (DSİ, 24.06.2024; yıllık 57 milyar m³) | "%77 (DSİ, 2024)" olarak. Kaynak bağlantısı DSİ'nin kendi sayfası olmalı (kontrol çıktısında kaynak adı yanlış görünüyor) |
| COP31, Antalya | Doğrulandı: 9–20 Kasım 2026 (UNFCCC) | Tarihe göre "düzenlenecek / düzenlendi" |
| FAO-56 ile bitki su ihtiyacı | Yöntem doğru; ET₀ tek başına sulama ihtiyacı değil | Projede zaten Kc, etkili yağış ve (Aşama 11) sulama verimi kullanılıyor |
| Fazla güneş elektriğini şebekeye satma | Koşullu (EPDK lisanssız üretim/mahsuplaşma; tesise bağlı) | Genel iddia olarak değil, "koşullara bağlı" notuyla |
| Güneş pompaları aşırı çekimi artırabilir | Literatürde risk olarak destekleniyor; sonuç bağlama bağlı | Konya için araştırılacak risk olarak; Hindistan çalışmasının künyesi bulunmadan atıf yok |
| Şebeke emisyon faktörü 0,44–0,48 kg CO₂/kWh | **Doğrulanmadı.** ETKB'nin 0,6242 tCO₂/MWh değeri güneş/rüzgâr projeleri için birleşik marj, tüketim faktörü değil | Kullanılmaz; CO₂ hesabı yapılacaksa faktörün yılı, tanımı ve kaynağı önce netleşmeli |
| Karapınar GES ~1,35 GWp | Doğrulandı: ETKB faaliyet raporu, 2022 sonu 1.350 MWp / 1.000 MWe | Kaynakla birlikte |
| Konya obruk sayısı, yeraltı suyu düşüşü, ruhsatsız kuyu sayısı | **Doğrulanmadı** | Kullanılmaz (PLAN kural 7) |
| Konya'nın buğday / şeker pancarı sıralaması | Doğrulanmadı | TÜİK il-ürün tablosundan yıl belirtilerek alınırsa kullanılır |

## Örnek senaryo hesapları

Aritmetik doğru, girdiler varsayım: 100 da × 600 mm = 60.000 m³; %55 verimle 109.091 m³ çekim;
120 m basma yüksekliği ve %50 pompa-motor veriminde ~0,654 kWh/m³; %20 azaltım ≈ 21.818 m³ ≈ 14.273 kWh.

- 600 mm, %55, 120 m ve %50 ölçülmüş değil; %20 tasarruf bir hedef, sonuç değil.
- "6,6 t CO₂ azaltımı" doğrulanmış bir faktöre dayanmıyor; kullanılmaz.

## Bu projeye etkisi

- **Aşama 11 (enerji bağlantısı):** sulama verimi, basma yüksekliği ve pompa verimi arayüzde
  "varsayım" etiketiyle, düzenlenebilir parametre olarak kalır (PLAN Aşama 11 ile uyumlu).
- **600 mm varsayımı yerine** Aşama 8'deki uydu tabanlı sınıf bazında sezonluk ET / mavi ET
  kullanılabilir; bu, dokümandaki varsayımın yerini ölçüme dayalı bir değerle alır.
- CO₂ hesabı şu an planda yok; eklenirse önce faktör kararı alınmalı.
