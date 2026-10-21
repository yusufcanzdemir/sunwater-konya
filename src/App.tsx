import { useMemo, useState } from 'react';
import { AssumptionsPanel } from './components/AssumptionsPanel';
import { FarmFormView } from './components/FarmFormView';
import { SummaryCards } from './components/SummaryCards';
import { AssumptionBadge } from './components/ui';
import { WaterBalanceChart } from './components/WaterBalanceChart';
import { fetchArchive, fetchForecast, geocode, pickBestGeoResult, type GeoResult, type WeatherSeries } from './data/openMeteo';
import { seasonLength } from './engine/crops';
import { archiveSeasonWindow } from './engine/season';
import { runWaterBalance } from './engine/waterBalance';
import { defaultAssumptions, type Assumptions } from './state/assumptions';
import { EMPTY_FORM, demoForm, validateFarmForm, type FarmForm, type FarmInput, type FormErrors } from './state/farm';

type Source = 'archive' | 'forecast';

interface Run {
  input: FarmInput;
  geo: GeoResult;
  source: Source;
  weather: WeatherSeries;
  /** Planting date the simulation uses (archive runs may move it to the last complete season). */
  plantingDate: string;
  shiftedYears: number;
  seasonLengthAtFetch: number;
}

const todayIstanbul = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const trDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export default function App() {
  const [form, setForm] = useState<FarmForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [source, setSource] = useState<Source>('archive');
  const [assumptions, setAssumptions] = useState<Assumptions>(defaultAssumptions);
  const [geoCandidates, setGeoCandidates] = useState<GeoResult[]>([]);
  const [selectedGeo, setSelectedGeo] = useState<GeoResult | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateForm = (patch: Partial<FarmForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    if (patch.locationText !== undefined) {
      setSelectedGeo(null);
      setGeoCandidates([]);
    }
  };

  async function calculate(geoOverride?: GeoResult) {
    const { input, errors } = validateFarmForm(form);
    setErrors(errors);
    if (!input) return;

    setLoading(true);
    setError(null);
    try {
      let geo = geoOverride ?? selectedGeo;
      if (!geo) {
        const results = await geocode(input.locationText);
        setGeoCandidates(results);
        geo = pickBestGeoResult(results);
        if (!geo) throw new Error(`"${input.locationText}" için konum bulunamadı. Başka bir yer adı deneyin.`);
        setSelectedGeo(geo);
      }

      const crop = assumptions.crops[input.crop];
      if (source === 'archive') {
        const window = archiveSeasonWindow(input.plantingDate, crop, todayIstanbul());
        const weather = await fetchArchive(geo.latitude, geo.longitude, window.start, window.end);
        setRun({
          input,
          geo,
          source,
          weather,
          plantingDate: window.plantingDate,
          shiftedYears: window.shiftedYears,
          seasonLengthAtFetch: seasonLength(crop),
        });
      } else {
        const weather = await fetchForecast(geo.latitude, geo.longitude);
        setRun({ input, geo, source, weather, plantingDate: input.plantingDate, shiftedYears: 0, seasonLengthAtFetch: seasonLength(crop) });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Beklenmeyen bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }

  const result = useMemo(() => {
    if (!run) return null;
    return runWaterBalance({
      weather: run.weather.daily,
      plantingDate: run.plantingDate,
      crop: assumptions.crops[run.input.crop],
      soil: assumptions.soils[run.input.soil],
      efficiency: assumptions.efficiency[run.input.irrigationMethod],
      areaDecare: run.input.areaDecare,
      rainRule: assumptions.rainRule,
      lookaheadDays: assumptions.lookaheadDays,
      initialDepletionMm: run.source === 'forecast' ? assumptions.forecastInitialDepletionMm : 0,
    });
  }, [run, assumptions]);

  // The panel follows the calculated field, or the form before the first calculation.
  const panelCrop = run?.input.crop ?? (form.crop || null);
  const panelSoil = run?.input.soil ?? (form.soil || null);
  const panelMethod = run?.input.irrigationMethod ?? (form.irrigationMethod || null);

  const seasonLengthChanged =run != null && seasonLength(assumptions.crops[run.input.crop]) !== run.seasonLengthAtFetch;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <h1 className="text-2xl font-bold text-emerald-800">Güneşli Sulama Asistanı</h1>
          <p className="text-sm text-slate-600">
            Tarlanızın günlük su ihtiyacı – FAO-56 yöntemi ve Open-Meteo'nun gerçek hava verisiyle.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">1) Tarlanı anlat</h2>
            <button
              type="button"
              onClick={() => {
                updateForm(demoForm(new Date().getFullYear()));
                setErrors({});
              }}
              className="rounded-md border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              Demo tarla yükle
            </button>
          </div>

          <FarmFormView form={form} errors={errors} onChange={updateForm} />

          {geoCandidates.length > 1 && selectedGeo && (
            <div className="mt-4 text-sm">
              <label className="flex flex-wrap items-center gap-2">
                <span className="text-slate-600">Bulunan konum:</span>
                <select
                  className="rounded-md border border-slate-300 px-2 py-1"
                  value={selectedGeo.id}
                  onChange={(e) => {
                    const geo = geoCandidates.find((g) => g.id === Number(e.target.value)) ?? null;
                    setSelectedGeo(geo);
                    if (geo) void calculate(geo);
                  }}
                >
                  {geoCandidates.map((g) => (
                    <option key={g.id} value={g.id}>
                      {[g.name, g.admin2, g.admin1].filter(Boolean).join(', ')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={source === 'archive'} onChange={() => setSource('archive')} />
                Geçmiş sezon (gerçek arşiv verisi)
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={source === 'forecast'} onChange={() => setSource('forecast')} />
                Önümüzdeki 16 gün (tahmin)
              </label>
            </fieldset>
            <button
              type="button"
              disabled={loading}
              onClick={() => void calculate()}
              className="ml-auto rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? 'Hava verisi alınıyor…' : 'Su ihtiyacını hesapla'}
            </button>
          </div>

          {Object.keys(errors).length > 0 && (
            <p className="mt-3 text-sm text-red-600">Lütfen işaretli alanları düzeltin.</p>
          )}
          {error && (
            <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error} Formu elle düzenleyip tekrar deneyebilirsiniz.
            </p>
          )}
        </section>

        {run && result && (
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold">Su ihtiyacı</h2>
              <p className="text-sm text-slate-600">
                {[run.geo.name, run.geo.admin1].filter(Boolean).join(', ')} ({run.geo.latitude.toFixed(2)},{' '}
                {run.geo.longitude.toFixed(2)}) · {assumptions.crops[run.input.crop].name} ·{' '}
                {run.source === 'archive' ? 'Open-Meteo arşiv verisi' : 'Open-Meteo tahmini'}
                {result.days.length > 0 && (
                  <> · {trDate(result.days[0].date)} – {trDate(result.days[result.days.length - 1].date)}</>
                )}
              </p>
              {run.shiftedYears !== 0 && (
                <p className="mt-1 text-sm text-amber-800">
                  Bu yılın sezonu henüz tamamlanmadığı için en son tamamlanan sezon kullanıldı (ekim:{' '}
                  {trDate(run.plantingDate)}).
                </p>
              )}
              {run.source === 'forecast' && result.days.length > 0 && (
                <p className="mt-1 text-sm text-slate-600">
                  Tahminin ilk gününde toprak eksikliği {assumptions.forecastInitialDepletionMm} mm kabul edildi{' '}
                  <AssumptionBadge />
                </p>
              )}
              {run.weather.missingDates.length > 0 && (
                <p className="mt-1 text-sm text-amber-800">
                  {run.weather.missingDates.length} gün için hava verisi eksik olduğundan hesaba katılmadı.
                </p>
              )}
              {seasonLengthChanged && (
                <p className="mt-1 text-sm text-amber-800">
                  Dönem süreleri değişti; tüm sezonun verisini almak için yeniden hesaplayın.
                </p>
              )}
            </div>

            {result.days.length === 0 ? (
              <p className="rounded-md bg-sky-50 p-4 text-sky-900">
                {run.source === 'forecast'
                  ? 'Sulama sezonu dışındasınız: önümüzdeki 16 gün bu ürünün sulama dönemine denk gelmiyor. Geçen sezonun gerçek verisiyle hesaplamak için "Geçmiş sezon" seçeneğini kullanın.'
                  : 'Seçilen dönem için hava verisi bulunamadı.'}
              </p>
            ) : (
              <>
                <SummaryCards result={result} />
                <WaterBalanceChart result={result} />
              </>
            )}
          </section>
        )}

        {panelCrop && panelSoil && panelMethod && (
          <AssumptionsPanel
            assumptions={assumptions}
            cropId={panelCrop}
            soilId={panelSoil}
            method={panelMethod}
            onChange={setAssumptions}
            onReset={() => setAssumptions(defaultAssumptions())}
          />
        )}
      </main>
    </div>
  );
}
