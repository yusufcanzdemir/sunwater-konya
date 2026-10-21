import type { CropId, CropParams, CropStages } from '../engine/crops';
import type { SoilId, SoilParams } from '../engine/soil';
import { IRRIGATION_METHOD_NAMES, type IrrigationMethod } from '../engine/waterBalance';
import type { Assumptions } from '../state/assumptions';
import { AssumptionBadge, NumberField } from './ui';

interface Props {
  assumptions: Assumptions;
  cropId: CropId;
  soilId: SoilId;
  method: IrrigationMethod;
  onChange: (next: Assumptions) => void;
  onReset: () => void;
}

const STAGE_LABELS: Record<keyof CropStages, string> = {
  ini: 'Başlangıç',
  dev: 'Gelişme',
  mid: 'Orta',
  late: 'Geç',
};

export function AssumptionsPanel({ assumptions, cropId, soilId, method, onChange, onReset }: Props) {
  const crop = assumptions.crops[cropId];
  const soil = assumptions.soils[soilId];

  const setCrop = (patch: Partial<CropParams>) =>
    onChange({ ...assumptions, crops: { ...assumptions.crops, [cropId]: { ...crop, ...patch } } });
  const setStage = (key: keyof CropStages, days: number) => setCrop({ stages: { ...crop.stages, [key]: days } });
  const setSoil = (patch: Partial<SoilParams>) =>
    onChange({ ...assumptions, soils: { ...assumptions.soils, [soilId]: { ...soil, ...patch } } });

  return (
    <details className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <summary className="cursor-pointer font-semibold text-slate-800">
        Varsayımlar <AssumptionBadge />
        <span className="ml-2 text-sm font-normal text-slate-500">
          (FAO-56'dan yaklaşık değerler – düzenleyebilirsiniz, sonuç anında güncellenir)
        </span>
      </summary>

      <div className="mt-4 space-y-5">
        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">
            Ürün katsayıları: {crop.name} <AssumptionBadge />
          </h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <NumberField label="Kc başlangıç" value={crop.kcIni} min={0} max={2} onChange={(kcIni) => setCrop({ kcIni })} />
            <NumberField label="Kc orta" value={crop.kcMid} min={0} max={2} onChange={(kcMid) => setCrop({ kcMid })} />
            <NumberField label="Kc son" value={crop.kcEnd} min={0} max={2} onChange={(kcEnd) => setCrop({ kcEnd })} />
            <NumberField label="Kök derinliği Zr (m)" value={crop.rootDepthM} min={0.1} max={3} onChange={(rootDepthM) => setCrop({ rootDepthM })} />
            <NumberField label="p (izin verilen tükenme)" value={crop.p} min={0.05} max={0.95} onChange={(p) => setCrop({ p })} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.keys(STAGE_LABELS) as (keyof CropStages)[]).map((key) => (
              <NumberField
                key={key}
                label={`${STAGE_LABELS[key]} dönemi (gün)`}
                value={crop.stages[key]}
                min={1}
                max={200}
                integer
                onChange={(d) => setStage(key, d)}
              />
            ))}
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">
            Toprak: {soil.name} <AssumptionBadge />
          </h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumberField label="θ tarla kapasitesi" value={soil.thetaFc} min={0.01} max={0.7} onChange={(thetaFc) => setSoil({ thetaFc })} />
            <NumberField label="θ solma noktası" value={soil.thetaWp} min={0} max={0.6} onChange={(thetaWp) => setSoil({ thetaWp })} />
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">
            Sulama ve yağış <AssumptionBadge />
          </h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            <NumberField
              label={`${IRRIGATION_METHOD_NAMES[method]} randımanı`}
              value={assumptions.efficiency[method]}
              min={0.1}
              max={1}
              onChange={(e) => onChange({ ...assumptions, efficiency: { ...assumptions.efficiency, [method]: e } })}
            />
            <NumberField
              label="Etkili yağış eşiği (mm)"
              value={assumptions.rainRule.thresholdMm}
              min={0}
              max={50}
              onChange={(thresholdMm) => onChange({ ...assumptions, rainRule: { ...assumptions.rainRule, thresholdMm } })}
            />
            <NumberField
              label="Etkili yağış oranı"
              value={assumptions.rainRule.factor}
              min={0}
              max={1}
              onChange={(factor) => onChange({ ...assumptions, rainRule: { ...assumptions.rainRule, factor } })}
            />
            <NumberField
              label="Yağış bekleme (gün)"
              value={assumptions.lookaheadDays}
              min={0}
              max={7}
              integer
              onChange={(lookaheadDays) => onChange({ ...assumptions, lookaheadDays })}
            />
            <NumberField
              label="Tahmin başında toprak eksikliği (mm)"
              value={assumptions.forecastInitialDepletionMm}
              min={0}
              max={500}
              onChange={(forecastInitialDepletionMm) => onChange({ ...assumptions, forecastInitialDepletionMm })}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Geçmiş sezon hesabında "yağış bekleme", o günlerde gerçekten yağan yağışa bakar (yağışın önceden
            bilindiği varsayılır). Sezon başında toprağın tarla kapasitesinde olduğu varsayılır.
          </p>
        </section>

        <button type="button" onClick={onReset} className="text-sm text-amber-800 underline hover:text-amber-950">
          Varsayılan değerlere dön
        </button>
      </div>
    </details>
  );
}
