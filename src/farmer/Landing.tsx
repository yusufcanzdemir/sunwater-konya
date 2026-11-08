// Product page at / for visitors without a remembered field: what SunWater does for a farmer,
// shown with the product itself (the Telegram morning message, the field page), then "find your field".

import { ArrowRight, Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { lang, t } from '../i18n';

/** Product images exist in Turkish and English (public/img/<name>.webp, <name>-en.webp). */
const img = (name: string) => `/img/${name}${lang === 'en' ? '-en' : ''}.webp`;

/** Telegram-like phone showing the morning plan as it arrives. */
function PhoneMock() {
  return (
    <div className="relative mx-auto w-[300px] shrink-0 rounded-[2.6rem] bg-stone-900 p-2.5 shadow-2xl shadow-emerald-950/30 sm:w-[330px]">
      <div className="overflow-hidden rounded-[2.1rem] bg-[#dfe7ec]">
        {/* chat header */}
        <div className="flex items-center gap-2.5 bg-white px-4 pb-2.5 pt-6">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-900 text-sm font-bold text-amber-300">SW</div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-stone-900">SunWater</p>
            <p className="text-xs text-sky-600">bot</p>
          </div>
        </div>
        {/* message */}
        <div className="space-y-1.5 px-2.5 py-3">
          <p className="mx-auto w-fit rounded-full bg-black/20 px-2.5 py-0.5 text-[11px] font-medium text-white">{t('Bugün 07:00', 'Today 07:00')}</p>
          <div className="overflow-hidden rounded-2xl rounded-bl-md bg-white shadow-sm">
            <img src={img('telegram-plan')} alt={t('Telegram sabah planı', 'Telegram morning plan')} className="block w-full" />
            <div className="space-y-0.5 px-3 py-2 text-[12.5px] leading-snug text-stone-800">
              <p>🌱 {t('F03053 – Şeker pancarı tarlası', 'F03053 – Sugar beet field')}</p>
              <p>💧 {t('Çarşamba 10:00–16:00 arası 6 saat sulayın.', 'Wednesday 10:00–16:00, irrigate 6 hours.')}</p>
              <p>☀️ {t('Bu hafta pompa enerjisinde güneş payı: %92.', 'Solar share of the pump energy this week: 92%.')}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-1">
            <span className="rounded-xl bg-white/70 py-1.5 text-center text-[12.5px] font-semibold text-sky-700">✅ {t('Suladım', 'I irrigated')}</span>
            <span className="rounded-xl bg-white/70 py-1.5 text-center text-[12.5px] font-semibold text-sky-700">🌾 {t('Tarlamı aç', 'Open my field')}</span>
          </div>
        </div>
        {/* bottom menu */}
        <div className="grid grid-cols-2 gap-1 bg-[#eef1f3] p-1.5 pb-4 text-[12px] font-medium text-stone-700">
          {['💧 ' + t('Bugün', 'Today'), '📅 ' + t('Bu hafta', 'This week'), '📊 ' + t('Tarlam', 'My field'), '📍 ' + t('Tarla değiştir', 'Change field')].map((b) => (
            <span key={b} className="rounded-lg bg-white py-2 text-center shadow-sm">
              {b}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Feature({ kicker, title, children, image, alt, flip = false }: { kicker: string; title: string; children: ReactNode; image: string; alt: string; flip?: boolean }) {
  return (
    <div className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-16 ${flip ? 'lg:[&>*:first-child]:order-2' : ''}`}>
      <div>
        <p className="text-sm font-bold uppercase tracking-wider text-amber-700">{kicker}</p>
        <h3 className="mt-2 text-2xl font-bold tracking-tight text-stone-900 lg:text-3xl">{title}</h3>
        <div className="mt-3 space-y-3 text-lg leading-relaxed text-stone-600">{children}</div>
      </div>
      <img src={image} alt={alt} loading="lazy" className="w-full rounded-2xl border border-stone-200 shadow-xl shadow-stone-900/10" />
    </div>
  );
}

const FAQ: [string, string][] = [
  [
    t('Ücretli mi?', 'Does it cost anything?'),
    t('Hayır. Şu an Karapınar’da ücretsiz bir pilot olarak çalışıyor. Telegram dışında bir şey indirmen gerekmez.', 'No. It is a free pilot in Karapınar; you only need Telegram.'),
  ],
  [
    t('Hangi tarlalar için çalışıyor?', 'Which fields are covered?'),
    t('Karapınar’ın kuzeyindeki 3.448 tarla için. Bu alanın dışındaysan tarlanı haritada çizip yine plan alabilirsin.', 'The 3,448 fields north of Karapınar. Outside that area you can draw your field and still get a plan.'),
  ],
  [
    t('Az sularsam verimim düşmez mi?', 'Will less water hurt my yield?'),
    t('Plan, bitkinin o hafta ihtiyacı olan suyu hesaplar ve onu verir. Kestiği şey ihtiyacın üstündeki fazla su.', 'The plan gives the water the crop needs that week. It only cuts the water above that need.'),
  ],
  [
    t('Bilgilerim nereye gidiyor?', 'Where does my data go?'),
    t('Pompa, fatura ve kuyu bilgilerin yalnızca senin telefonunda kalır. SunWater denetim ya da ceza için kullanılmaz; çiftçinin kendi aracıdır.', 'Your pump, bill and well data stay on your phone. SunWater is never used for inspections or fines; it is the farmer’s own tool.'),
  ],
];

export default function Landing({ botUrl, children }: { botUrl: string | null; children: ReactNode }) {
  const toFind = () => document.getElementById('tarlan')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-b from-amber-50/70 to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-12 lg:grid-cols-[1fr_auto] lg:gap-20 lg:px-8 lg:py-20">
          <div>
            <p className="inline-flex rounded-full bg-emerald-900/5 px-3 py-1 text-sm font-semibold text-emerald-900">
              {t('Karapınar çiftçileri için · Ücretsiz', 'For Karapınar farmers · Free')}
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-stone-900 sm:text-5xl lg:text-6xl">
              {t('Ne zaman, kaç saat sulayacağın her sabah telefonunda.', 'When to irrigate and for how long, on your phone every morning.')}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600 lg:text-xl">
              {t(
                'SunWater tarlanı uydudan tanır, hava durumunu takip eder ve sana sade bir sulama planı gönderir. Fazla su da, fazla elektrik de cebinden çıkmasın.',
                'SunWater knows your field from satellite images, follows the weather and sends you a simple irrigation plan. No water or electricity wasted.',
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={toFind} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-900 px-6 py-3.5 text-lg font-semibold text-white hover:bg-emerald-950">
                {t('Tarlamı bul', 'Find my field')} <ArrowRight size={20} />
              </button>
              {botUrl && (
                <a href={botUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl border border-stone-300 bg-white px-6 py-3.5 text-lg font-semibold text-stone-800 hover:bg-stone-50">
                  {t('Telegram’dan başla', 'Start on Telegram')}
                </a>
              )}
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-600">
              {[t('3.448 tarla tanımlı', '3,448 fields mapped'), t('Sensör ve sayaç yok', 'No sensors or meters'), t('Uydudan takip', 'Tracked from satellites')].map((x) => (
                <li key={x} className="inline-flex items-center gap-1.5">
                  <Check size={16} className="text-emerald-700" /> {x}
                </li>
              ))}
            </ul>
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* What you get */}
      <section className="mx-auto max-w-6xl space-y-20 px-5 py-16 lg:space-y-28 lg:px-8 lg:py-24">
        <Feature
          kicker={t('Sabah planı', 'Morning plan')}
          title={t('Hangi gün, hangi saatler, kaç saat', 'Which day, which hours, how long')}
          image={img('telegram-plan')}
          alt={t('Resimli sabah planı', 'Morning plan card')}
        >
          <p>{t('Her sabah 07:00’de Telegram’a tarlanın fotoğrafıyla birlikte planın gelir. Yağmur geliyorsa plan kendiliğinden değişir, sana da haber verir.', 'Every morning at 07:00 your plan arrives on Telegram with a photo of your field. If rain is coming, the plan changes and tells you.')}</p>
          <p>{t('Suladığında “Suladım”a basman yeterli; bot toprağında kaç günlük su kaldığını söyler.', 'When you irrigate, tap “I irrigated”; the bot tells you how many days of water are left in the soil.')}</p>
        </Feature>
        <Feature
          flip
          kicker={t('Sezon özeti', 'Season summary')}
          title={t('Komşu tarlalara göre nerede olduğunu gör', 'See where you stand next to similar fields')}
          image={img('telegram-season')}
          alt={t('Sezon karşılaştırma kartı', 'Season comparison card')}
        >
          <p>{t('Uydu, bu sezon tarlanın ne kadar yeraltı suyu kullandığını ölçer. Aynı ürünü eken tarlalarla ve damla sulamayla yetecek miktarla yan yana görürsün.', 'Satellites measure how much groundwater your field used this season, next to fields with the same crop and to what drip irrigation would have needed.')}</p>
        </Feature>
        <Feature
          kicker={t('Tarla sayfan', 'Your field page')}
          title={t('Pompanı, faturanı, kuyunu tek yerde tut', 'Your pump, bill and well in one place')}
          image={img('web-tarla')}
          alt={t('Tarla sayfası', 'Field page')}
        >
          <p>{t('Pompanı tanıtırsan plan senin pompana göre hesaplanır. Elektrik faturandaki kWh’i yazınca kuyudan ne kadar su çektiğini görürsün. Kuyu derinliğini ara sıra yazarsan suyun ne hızla indiğini takip edersin.', 'Tell it your pump and the plan fits your pump. Type the kWh on your bill to see how much water you pumped. Note your well depth now and then to see how fast the water drops.')}</p>
        </Feature>
      </section>

      {/* Find your field (sign in) */}
      <section id="tarlan" className="scroll-mt-16 bg-stone-50">
        <div className="mx-auto flex max-w-screen-2xl flex-col lg:h-[calc(100dvh-3.5rem)] lg:max-h-[820px] lg:min-h-[640px]">{children}</div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-16 lg:py-20">
        <h2 className="text-3xl font-bold tracking-tight text-stone-900">{t('Sık sorulanlar', 'Questions')}</h2>
        <div className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold text-stone-900">
                {q}
                <ChevronDown size={20} className="shrink-0 text-stone-400 transition group-open:rotate-180" />
              </summary>
              <p className="mt-2 leading-relaxed text-stone-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="border-t border-stone-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-stone-500 lg:px-8">
          <span>SunWater · {t('Selçuk Üniversitesi öğrenci projesi', 'A Selçuk University student project')}</span>
          <a href="/planla" className="hover:underline">
            {t('Pilot alanın dışında mısın? Tarlanı çiz', 'Outside the pilot area? Draw your field')}
          </a>
        </div>
      </footer>
    </main>
  );
}
