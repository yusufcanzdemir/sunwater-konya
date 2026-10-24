import { BookOpen } from 'lucide-react';

/** Phenology hints per class; the same rules, with thresholds, name clusters in pipeline/lib/phenology.py. */
export const HINTS: Record<string, string> = {
  irrigated_winter_cereal: 'Nisan–Mayıs zirvesi, Haziran sonu–Temmuz hasat düşüşü.',
  rainfed_winter_cereal: 'Sulu tahıla göre daha düşük ve daha erken düşen zirve; yazın düşük NDMI.',
  cereal_second_crop: 'Tahıl zirvesi ve Temmuz hasadından sonra Ağustos–Eylül’de ikinci yükseliş.',
  sugar_beet: 'Mayıs’tan Ekim’e uzun, yüksek NDVI platosu.',
  maize: 'Temmuz–Ağustos zirvesi; Eylül sonunda kuruma.',
  sunflower: 'Haziran–Temmuz zirvesi, Ağustos’ta hızlı düşüş.',
  alfalfa: 'Biçimlere bağlı tekrarlayan testere dişi NDVI.',
  fallow: 'Sezon boyunca düşük NDVI.',
  other: 'Yukarıdakilere uymayan ürün (sebze, meyve bahçesi vb.).',
};

/** Step-by-step labelling guide shown in the /label tool. Thresholds are rough guides, not rules. */
export function LabelGuide() {
  return (
    <details className="rounded-lg bg-white p-3 text-sm shadow-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <BookOpen size={16} /> Rehber: nasıl karar veririm?
      </summary>
      <div className="mt-2 space-y-3 text-soil-700">
        <section>
          <h3 className="font-semibold">Ekranda ne var?</h3>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>
              <b>Yeşil çizgi (NDVI)</b> bitki yeşilliği: 0,2 altı çıplak toprak, 0,3–0,5 seyrek bitki, 0,7 üstü sık ve canlı bitki.
            </li>
            <li>
              <b>Mavi çizgi (NDMI)</b> bitkideki su: sulanan tarlada yüksek, kurakta düşük.
            </li>
            <li>
              <b>Alttaki 4 görüntü</b>: yeşil = bitki, sarı/altın = olgun tahıl, açık bej = çıplak ya da hasat edilmiş.
            </li>
          </ul>
        </section>
        <section>
          <h3 className="font-semibold">1. Hiç yeşerdi mi?</h3>
          <p>NDVI hiç 0,3’ü geçmiyor, görüntüler hep bej → <b>Nadas / boş</b>.</p>
        </section>
        <section>
          <h3 className="font-semibold">2. Tepe hangi ayda?</h3>
          <p className="font-medium">A) Nisan–Mayıs’ta tepe, Temmuz’a kadar düşüş → kışlık tahıl</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Ağustos–Eylül’de yeniden yükseliyor → <b>Tahıl + ikinci ürün</b></li>
            <li>Yükselmiyor, tepe 0,7 üstü, Mayıs’ta NDMI yüksek → <b>Sulu kışlık tahıl</b></li>
            <li>Yükselmiyor, tepe 0,4–0,65, düşüş erken → <b>Kuru kışlık tahıl</b></li>
          </ul>
          <p className="mt-1 font-medium">B) Mayıs’ta düşük, tepe yazda → yazlık ürün (Eylül’e bakın)</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Haziran’dan Ekim’e yüksek kalıyor, Eylül’de koyu yeşil → <b>Şeker pancarı</b></li>
            <li>Tepe Temmuz sonu–Ağustos, Eylül’de yavaş düşüş, soluk yeşil/sarımsı → <b>Mısır</b></li>
            <li>Tepe Temmuz, Ağustos’ta hızlı düşüş, Eylül’de kahverengi/bej → <b>Ayçiçeği</b></li>
          </ul>
          <p className="mt-1 font-medium">C) Nisan’da zaten yeşil, defalarca inip çıkıyor (testere dişi) → <b>Yonca</b></p>
        </section>
        <section>
          <h3 className="font-semibold">3. Hiçbirine uymuyor</h3>
          <p>
            Eğri net ama tanıdık değil → <b>Diğer</b>.
          </p>
        </section>
        <section>
          <h3 className="font-semibold">Güven</h3>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Eğri ve görüntüler aynı şeyi söylüyor → Eminim</li>
            <li>İki ürün arasında kaldınız → olasını seçin, Kısmen eminim (k)</li>
            <li>Üç ve daha fazla seçenek ya da garip eğri → Emin değilim (e)</li>
          </ul>
        </section>
        <section>
          <h3 className="font-semibold">Segment hatalı</h3>
          <p>Sarı çerçeve iki farklı tarlayı kapsıyor ya da büyük bir tarlanın küçük bir parçası.</p>
        </section>
        <p className="text-xs text-soil-500">Sayılar yaklaşık değerlerdir; yön gösterir, kesin kural değildir.</p>
      </div>
    </details>
  );
}
