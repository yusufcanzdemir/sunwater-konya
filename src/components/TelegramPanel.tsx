import { Send, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { GeoResult } from '../data/openMeteo';
import type { Assumptions } from '../state/assumptions';
import type { FarmInput } from '../state/farm';

interface LinkInfo {
  configured: boolean;
  farmId?: string;
  botUsername?: string;
  startUrl?: string;
  demoChat?: boolean;
  storage?: 'redis' | 'memory';
  error?: string;
}

interface Props {
  input: FarmInput;
  geo: GeoResult;
  assumptions: Assumptions;
}

/** Mount with a `key` per field/assumptions so a changed plan links a fresh field. */
export function TelegramPanel({ input, geo, assumptions }: Props) {
  const [link, setLink] = useState<LinkInfo | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/telegram-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input, geo: { latitude: geo.latitude, longitude: geo.longitude, name: geo.name }, assumptions }),
    })
      .then((r) => r.json() as Promise<LinkInfo>)
      .catch((): LinkInfo => ({ configured: true, error: 'Telegram bağlantısı şu an kurulamadı.' }))
      .then(async (info) => {
        if (cancelled) return;
        setLink(info);
        if (info.startUrl) setQr(await QRCode.toDataURL(info.startUrl, { margin: 1, width: 180, color: { dark: '#33241a' } }));
      });
    return () => {
      cancelled = true;
    };
  }, [input, geo, assumptions]);

  async function sendNow() {
    if (!link?.farmId) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/send-alert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ farmId: link.farmId }),
      });
      const body = (await res.json()) as { sent?: number; error?: string; errors?: string[] };
      setResult(
        res.ok && body.sent
          ? { ok: true, text: 'Bildirim gönderildi. Telegram’ı açın 📱' }
          : { ok: false, text: body.error ?? body.errors?.[0] ?? 'Bildirim gönderilemedi.' },
      );
    } catch {
      setResult({ ok: false, text: 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.' });
    } finally {
      setSending(false);
    }
  }

  if (!link) return <p className="text-sm text-soil-600">Telegram bağlantısı hazırlanıyor…</p>;
  if (!link.configured) {
    return <p className="text-sm text-soil-600">Telegram botu bu kurulumda yapılandırılmamış (TELEGRAM_BOT_TOKEN).</p>;
  }
  if (link.error) return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{link.error}</p>;

  return (
    <div className="grid items-center gap-5 sm:grid-cols-[auto_1fr]">
      {qr && (
        <img src={qr} alt="Telegram botunu başlatmak için QR kod" className="mx-auto h-44 w-44 rounded-lg border border-soil-200 bg-white p-1" />
      )}
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-soil-800">
          <Smartphone size={20} className="mt-0.5 shrink-0 text-water-600" />
          <span>
            QR kodu telefonunuzla okutun veya{' '}
            <a href={link.startUrl} target="_blank" rel="noreferrer" className="font-semibold text-water-600 underline">
              @{link.botUsername}
            </a>{' '}
            botunu açıp "Başlat"a basın. Her sabah 07:00'de bu tarlanın planı gelir; sulayınca "Suladım"
            butonuyla hesabı güncellersiniz (yağmuru hava verisinden takip ediyoruz).
          </span>
        </p>
        <button
          type="button"
          disabled={sending}
          onClick={() => void sendNow()}
          className="inline-flex items-center gap-2 rounded-xl bg-water-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-water-700 disabled:opacity-60"
        >
          <Send size={18} />
          {sending ? 'Gönderiliyor…' : "Telegram'a bildirim gönder"}
        </button>
        {result && <p className={`text-sm ${result.ok ? 'text-soil-800' : 'text-red-700'}`}>{result.text}</p>}
        {link.storage === 'memory' && (
          <p className="text-xs text-soil-500">
            Not: kalıcı depolama (Upstash Redis / Vercel KV) kurulu değil; bot kayıtları sunucu yeniden başlayınca sıfırlanır.
          </p>
        )}
      </div>
    </div>
  );
}
