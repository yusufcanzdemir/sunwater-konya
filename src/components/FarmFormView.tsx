import { CROP_IDS, CROPS, type CropId } from '../engine/crops';
import { SOIL_IDS, SOILS, type SoilId } from '../engine/soil';
import { IRRIGATION_METHOD_NAMES, IRRIGATION_METHODS, type IrrigationMethod } from '../engine/waterBalance';
import {
  ENERGY_SOURCE_NAMES,
  KONYA_DISTRICTS,
  defaultPlantingDate,
  type EnergySource,
  type FarmForm,
  type FormErrors,
} from '../state/farm';
import { Field, inputClass } from './ui';

interface Props {
  form: FarmForm;
  errors: FormErrors;
  onChange: (patch: Partial<FarmForm>) => void;
}

export function FarmFormView({ form, errors, onChange }: Props) {
  const text = (key: keyof FarmForm, label: string, unit?: string, placeholder?: string) => (
    <Field label={unit ? `${label} (${unit})` : label} error={errors[key]}>
      <input
        className={inputClass}
        inputMode="decimal"
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => onChange({ [key]: e.target.value })}
      />
    </Field>
  );

  const changeCrop = (crop: CropId | '') => {
    const patch: Partial<FarmForm> = { crop };
    // Keep the planting date in step with the crop unless the user picked a custom one.
    const year = Number(form.plantingDate.slice(0, 4)) || new Date().getFullYear();
    const wasDefault =
      form.plantingDate === '' || (form.crop !== '' && form.plantingDate === defaultPlantingDate(form.crop, year));
    if (crop !== '' && wasDefault) patch.plantingDate = defaultPlantingDate(crop, year);
    onChange(patch);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Konum (Konya ilçeleri önerilir)" error={errors.locationText}>
        <input
          className={inputClass}
          list="konya-districts"
          value={form.locationText}
          placeholder="ör. Karapınar"
          onChange={(e) => onChange({ locationText: e.target.value })}
        />
        <datalist id="konya-districts">
          {KONYA_DISTRICTS.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </Field>

      <Field label="Ürün" error={errors.crop}>
        <select className={inputClass} value={form.crop} onChange={(e) => changeCrop(e.target.value as CropId | '')}>
          <option value="">Seçin…</option>
          {CROP_IDS.map((id) => (
            <option key={id} value={id}>
              {CROPS[id].name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Ekim (veya sulama dönemi başlangıç) tarihi" error={errors.plantingDate}>
        <input
          type="date"
          className={inputClass}
          value={form.plantingDate}
          onChange={(e) => onChange({ plantingDate: e.target.value })}
        />
      </Field>

      {text('areaDecare', 'Alan', 'dekar')}

      <Field label="Sulama yöntemi" error={errors.irrigationMethod}>
        <select
          className={inputClass}
          value={form.irrigationMethod}
          onChange={(e) => onChange({ irrigationMethod: e.target.value as IrrigationMethod | '' })}
        >
          <option value="">Seçin…</option>
          {IRRIGATION_METHODS.map((m) => (
            <option key={m} value={m}>
              {IRRIGATION_METHOD_NAMES[m]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Toprak tipi" error={errors.soil}>
        <select className={inputClass} value={form.soil} onChange={(e) => onChange({ soil: e.target.value as SoilId | '' })}>
          <option value="">Seçin…</option>
          {SOIL_IDS.map((id) => (
            <option key={id} value={id}>
              {SOILS[id].name}
            </option>
          ))}
        </select>
      </Field>

      {text('wellHeadM', 'Kuyu toplam basma yüksekliği', 'm')}
      {text('pumpFlowM3h', 'Pompa debisi', 'm³/saat')}
      {text('pumpEfficiency', 'Pompa-motor verimi', '0–1', '0,50')}

      <Field label="Enerji kaynağı" error={errors.energySource}>
        <select
          className={inputClass}
          value={form.energySource}
          onChange={(e) => onChange({ energySource: e.target.value as EnergySource | '' })}
        >
          <option value="">Seçin…</option>
          {(Object.keys(ENERGY_SOURCE_NAMES) as EnergySource[]).map((s) => (
            <option key={s} value={s}>
              {ENERGY_SOURCE_NAMES[s]}
            </option>
          ))}
        </select>
      </Field>

      {text('pvKwp', 'GES gücü', 'kWp')}

      <div className="grid grid-cols-2 gap-2">
        {text('habitIntervalDays', 'Mevcut: kaç günde bir', 'gün')}
        {text('habitHours', 'Kaç saat', 'saat')}
      </div>

      {text('electricityPriceTlKwh', 'Elektrik birim fiyatı', 'TL/kWh', 'kendiniz girin')}
      {text('dieselPriceTlL', 'Dizel fiyatı', 'TL/L', 'kendiniz girin')}
    </div>
  );
}
