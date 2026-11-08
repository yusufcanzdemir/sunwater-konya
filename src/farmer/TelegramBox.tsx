// What the Telegram assistant does, shown on the home screen and on a field. Lists only what the bot does today.

import { CalendarCheck, CircleCheck, CloudRain, Leaf, Send } from 'lucide-react';
import { t } from '../i18n';

const FEATURES = [
  { Icon: CalendarCheck, text: t('Her sabah: bugün ne zaman, kaç saat sulayacağın', 'Every morning: when and how long to irrigate today') },
  { Icon: CircleCheck, text: t('“Suladım” de, plan tarlanın gerçek durumuna göre güncellensin', 'Tap “Irrigated” and the plan follows your field') },
  { Icon: CloudRain, text: t('Yağmuru hava verisinden kendisi takip eder', 'Rain is tracked from the weather data') },
  { Icon: Leaf, text: t('Tarlanın sezon özeti tek dokunuşla', 'Your field’s season summary in one tap') },
];

/**
 * `url`: the bot link for a selected field; without it the box tells the farmer to pick a field first.
 * `compact`: one button and one line, for the home screen of a field.
 */
export default function TelegramBox({ url, compact = false }: { url?: string | null; compact?: boolean }) {
  if (compact && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-2xl bg-sky-500 px-4 py-3 text-white shadow-sm transition hover:bg-sky-600"
      >
        <Send size={22} className="shrink-0" />
        <span>
          <span className="block font-semibold">{t('Planı her sabah Telegram’dan al', 'Get the plan on Telegram every morning')}</span>
          <span className="block text-xs text-sky-50">{t('“Suladım” kaydı · yağmur takibi · sezon özeti', '“Irrigated” log · rain tracking · season summary')}</span>
        </span>
      </a>
    );
  }
  return (
    <section className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
      <h3 className="flex items-center gap-2 font-semibold text-sky-950">
        <Send size={18} className="text-sky-600" /> {t('Telegram’da sulama asistanın', 'Your irrigation assistant on Telegram')}
      </h3>
      <ul className="mt-3 space-y-2">
        {FEATURES.map(({ Icon, text }) => (
          <li key={text} className="flex items-start gap-2.5 text-sm text-stone-700">
            <Icon size={17} className="mt-0.5 shrink-0 text-sky-600" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-sky-600"
        >
          <Send size={17} /> {t('Telegram’da aç', 'Open in Telegram')}
        </a>
      ) : (
        <p className="mt-3 text-xs text-stone-500">{t('Tarlanı seçince Telegram’a bağlayabilirsin.', 'Pick your field to connect it to Telegram.')}</p>
      )}
    </section>
  );
}
