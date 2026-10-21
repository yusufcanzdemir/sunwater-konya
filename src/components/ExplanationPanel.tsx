import { useState } from 'react';
import { requestExplanation, type Explanation } from '../ai/client';
import type { ExplainPayload } from '../ai/explain';

/** Mount with a `key` derived from the payload so a new plan clears the old text. */
export function ExplanationPanel({ payload }: { payload: ExplainPayload }) {
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [loading, setLoading] = useState(false);

  async function explain() {
    setLoading(true);
    setExplanation(await requestExplanation(payload));
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      {explanation ? (
        <>
          <p className="text-base leading-relaxed text-slate-800">{explanation.text}</p>
          <p className="text-xs text-slate-500">
            {explanation.source === 'gemini'
              ? 'Yapay zekâ ile yazıldı; içindeki her sayının hesap motorunun sonucunda geçtiği kontrol edildi.'
              : 'Hazır şablon metin (yapay zekâ yanıtı alınamadı veya kontrolden geçmedi). Sayılar hesap motorundan.'}
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-600">Planı ve geçen sezonun sonucunu birkaç cümleyle, sade Türkçe özetler.</p>
      )}
      <button
        type="button"
        disabled={loading}
        onClick={() => void explain()}
        className="rounded-md border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
      >
        {loading ? 'Yazılıyor…' : explanation ? 'Yeniden anlat' : 'Sade Türkçeyle anlat'}
      </button>
    </div>
  );
}
