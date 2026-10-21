import { useMemo, useState, type ReactNode } from 'react';
import { AssumptionsPanel } from './components/AssumptionsPanel';
import { FarmFormView } from './components/FarmFormView';
import { Retrospective } from './components/Retrospective';
import { SummaryCards } from './components/SummaryCards';
import { WaterBalanceChart } from './components/WaterBalanceChart';
import { WeeklyPlan } from './components/WeeklyPlan';
import { fetchArchive, fetchForecast, geocode, pickBestGeoResult, type GeoResult, type WeatherSeries } from './data/openMeteo';
import { seasonLength } from './engine/crops';
import { analyzeSeason } from './engine/plan';
import { archiveSeasonWindow } from './engine/season';
import { defaultAssumptions, modelSettings, type Assumptions } from './state/assumptions';
import {
  EMPTY_FORM,
  demoForm,
  toFarmParams,
  validateFarmForm,
  type FarmForm,
  type FarmInput,
  type FormErrors,
} from './state/farm';

interface ArchiveRun {
  weather: WeatherSeries;
  /** Planting date of the last complete season. */
  plantingDate: string;
  shiftedYears: number;
}

type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };

interface Run {
  input: FarmInput;
  geo: GeoResult;
  archive: Loaded<ArchiveRun>;
  forecast: Loaded<WeatherSeries>;
  seasonLengthAtFetch: number;
}

const FORECAST_DAYS = 16;
const todayIstanbul = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const trDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Beklenmeyen bir hata oluştu.');

async function load<T>(p: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

function Section({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <div className="text-sm text-slate-600">{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

export default function App() {
  const [form, setForm] = useState<FarmForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
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
      const window = archiveSeasonWindow(input.plantingDate, crop, todayIstanbul());
      const [archive, forecast] = await Promise.all([
        load(
          fetchArchive(geo.latitude, geo.longitude, window.start, window.end).then((weather) => ({
            weather,
            plantingDate: window.plantingDate,
            shiftedYears: window.shiftedYears,
          })),
        ),
        load(fetchForecast(geo.latitude, geo.longitude)),
      ]);
      setRun({ input, geo, archive, forecast, seasonLengthAtFetch: seasonLength(crop) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const retro = useMemo(() => {
    if (!run?.archive.ok) return null;
    const { weather, plantingDate } = run.archive.value;
    return analyzeSeason(weather, plantingDate, toFarmParams(run.input, assumptions), modelSettings(assumptions, 0));
  }, [run, assumptions]);

  const week = useMemo(() => {
    if (!run?.forecast.ok) return null;
    return analyzeSeason(
      run.forecast.value,
      run.input.plantingDate,
      toFarmParams(run.input, assumptions),
      modelSettings(assumptions, assumptions.forecastInitialDepletionMm),
    );
  }, [run, assumptions]);

  // The panel follows the calculated field, or the form before the first calculation.
  const panelCrop = run?.input.crop ?? (form.crop || null);
  const panelSoil = run?.input.soil ?? (form.soil || null);
  const panelMethod = run?.input.irrigationMethod ?? (form.irrigationMethod || null);

  const seasonLengthChanged = run != null && seasonLength(assumptions.crops[run.input.crop]) !== run.seasonLengthAtFetch;
  const place = run ? [run.geo.name, run.geo.admin1].filter(Boolean).join(', ') : '';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <h1 className="text-2xl font-bold text-emerald-800">Güneşli Sulama Asistanı</h1>
          <p className="text-sm text-slate-600">
            Tarlanızın su ihtiyacı ve güneşe göre sulama planı – FAO-56 yöntemi ve Open-Meteo'nun gerçek hava verisiyle.
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
            <button
              type="button"
              disabled={loading}
              onClick={() => void calculate()}
              className="ml-auto rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? 'Hava verisi alınıyor…' : 'Planı hesapla'}
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
          {seasonLengthChanged && (
            <p className="mt-3 text-sm text-amber-800">
              Dönem süreleri değişti; tüm sezonun verisini almak için yeniden hesaplayın.
            </p>
          )}
        </section>

        {run && (
          <Section
            title="2) Geriye dönük test"
            subtitle={
              run.archive.ok && (
                <>
                  {place} · {assumptions.crops[run.input.crop].name} · Open-Meteo arşiv verisi ·{' '}
                  {trDate(run.archive.value.plantingDate)} ekimli sezon
                  {run.archive.value.shiftedYears !== 0 && ' (bu yılın sezonu henüz tamamlanmadığı için en son tamamlanan sezon)'}
                </>
              )
            }
          >
            {!run.archive.ok ? (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{run.archive.error}</p>
            ) : retro && retro.balance.days.length > 0 ? (
              <Retrospective
                analysis={retro}
                energySource={run.input.energySource}
                seasonLabel={`${trDate(retro.balance.days[0].date)} – ${trDate(retro.balance.days.at(-1)!.date)}`}
                maxRotationDays={assumptions.maxRotationDays}
              />
            ) : (
              <p className="text-sm text-slate-600">Seçilen dönem için hava verisi bulunamadı.</p>
            )}
          </Section>
        )}

        {run && (
          <Section title="3) Bu haftanın planı" subtitle={`${place} · Open-Meteo ${FORECAST_DAYS} günlük tahmin`}>
            {!run.forecast.ok ? (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{run.forecast.error}</p>
            ) : (
              week && (
                <WeeklyPlan
                  analysis={week}
                  energySource={run.input.energySource}
                  initialDepletionMm={assumptions.forecastInitialDepletionMm}
                  forecastDays={FORECAST_DAYS}
                />
              )
            )}
          </Section>
        )}

        {retro && retro.balance.days.length > 0 && (
          <Section title="Günlük su dengesi (geriye dönük sezon)">
            {run?.archive.ok && run.archive.value.weather.missingDates.length > 0 && (
              <p className="text-sm text-amber-800">
                {run.archive.value.weather.missingDates.length} gün için hava verisi eksik olduğundan hesaba katılmadı.
              </p>
            )}
            <SummaryCards result={retro.balance} />
            <WaterBalanceChart result={retro.balance} />
          </Section>
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
