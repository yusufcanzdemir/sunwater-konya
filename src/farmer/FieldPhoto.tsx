// The farmer's own field: a satellite snapshot with the field outline on top (same picture the Telegram bot sends).

import { useState } from 'react';
import { t } from '../i18n';
import { fieldBbox, fieldOutlineSvg, imageryUrl } from './pilot';

const SIZE = 640;

export default function FieldPhoto({ rings }: { rings: [number, number][][] | null }) {
  const [loaded, setLoaded] = useState(false);
  if (!rings) return <div className="aspect-square w-full animate-pulse rounded-3xl bg-stone-200" />;
  const bbox = fieldBbox(rings, 0.45);
  // The outline is drawn in snapshot pixels; a viewBox lets it scale with the photo on any screen
  const outline = fieldOutlineSvg(rings, bbox, SIZE).replace('<svg ', `<svg viewBox="0 0 ${SIZE} ${SIZE}" preserveAspectRatio="none" `);
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-stone-200 shadow-sm">
      <img
        src={imageryUrl(bbox, SIZE)}
        alt={t('Tarlanın uydu fotoğrafı', 'Satellite photo of your field')}
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
      <div className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: outline }} />
      <span className="absolute bottom-2 right-3 text-[10px] text-white/80 drop-shadow">Esri World Imagery</span>
    </div>
  );
}
