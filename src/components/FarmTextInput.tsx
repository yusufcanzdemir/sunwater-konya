import { useState } from 'react';
import { requestParseFarm } from '../ai/client';
import { MAX_FARM_TEXT_LENGTH, type ParsedFarm } from '../ai/parseFarm';
import { inputClass } from './ui';

const EXAMPLE =
  "Karapınar'da 100 dönüm pancarım var, nisan sonu ektim, salma sulama yapıyorum, kuyu 120 metre, 50 kilovat panelim var, her gün 20 saat sularım";

export function FarmTextInput({ onParsed }: { onParsed: (parsed: ParsedFarm) => void }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      onParsed(await requestParseFarm(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Metin yorumlanamadı.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full rounded-2xl border border-black/5 bg-stone-50 p-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-soil-700">Tarlanızı kendi cümlelerinizle anlatın</span>
        <textarea
          className={`${inputClass} min-h-20`}
          value={text}
          maxLength={MAX_FARM_TEXT_LENGTH}
          placeholder={`ör. ${EXAMPLE}`}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={loading || text.trim() === ''}
          onClick={() => void submit()}
          className="rounded-md bg-emerald-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-950 disabled:opacity-50"
        >
          {loading ? 'Okunuyor…' : 'Metinden formu doldur'}
        </button>
        <button type="button" onClick={() => setText(EXAMPLE)} className="text-sm text-emerald-900 underline">
          Örnek metni kullan
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
