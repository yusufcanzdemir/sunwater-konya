import { MapPin } from 'lucide-react';
import { Suspense, lazy, useMemo, useState, type ReactNode } from 'react';
import { buildExplainPayload } from './ai/explain';
import { parsedFarmToForm, type ParsedFarm } from './ai/parseFarm';
import { AppSwitch } from './components/AppSwitch';
import { OpenMeteoCredit } from './components/attribution';
import { AssumptionsPanel } from './components/AssumptionsPanel';
import { ExplanationPanel } from './components/ExplanationPanel';
import { FarmFormView } from './components/FarmFormView';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { DrawnField } from './components/FieldMap';
import { FarmTextInput } from './components/FarmTextInput';
import { StepNav, type Step } from './components/Presentation';
import { Retrospective } from './components/Retrospective';
import { SolarPumpDay } from './components/SolarPumpDay';
import { SummaryCards } from './components/SummaryCards';
import { TelegramPanel } from './components/TelegramPanel';
import { fmt } from './components/ui';
import { WaterBalanceChart } from './components/WaterBalanceChart';
import { WeeklyPlan } from './components/WeeklyPlan';
import { fetchArchive, fetchForecast, geocode, pickBestGeoResult, type GeoResult, type WeatherSeries } from './data/openMeteo';
import { seasonLength } from './engine/crops';
import { analyzeSeason } from './engine/plan';
import { archiveSeasonWindow, intersectWindows, seasonWindow } from './engine/season';
import { pumpingDates } from './engine/visuals';
import { IRRIGATION_METHOD_NAMES } from './engine/waterBalance';
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
  /** Form as it was when calculated, to notice later edits. */
  formSnapshot: string;
  geo: GeoResult;
  archive: Loaded<ArchiveRun>;
  forecast: Loaded<WeatherSeries>;
  seasonLengthAtFetch: number;
}

const FORECAST_DAYS = 16;
const DRAWN_FIELD_NAME = 'Haritada çizilen tarla';
const FieldMap = lazy(() => import('./components/FieldMap'));
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
    <section className="space-y-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <div className="text-sm text-soil-600">{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

/** A data source failed: say so in Turkish and offer the way back to manual input. */
function LoadError({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
      <p>{message}</p>
      <button type="button" onClick={onBack} className="mt-1 font-medium underline">
        Tarla bilgilerine dön ve tekrar dene
      </button>
    </div>
  );
}

function StepButtons({ prev, next, onSelect }: { prev?: [Step, string]; next?: [Step, string]; onSelect: (s: Step) => void }) {
  return (
    <div className="flex justify-between gap-3">
      {prev ? (
        <button type="button" onClick={() => onSelect(prev[0])} className="text-sm font-medium text-emerald-900 hover:underline">
          ← {prev[1]}
        </button>
      ) : (
        <span />
      )}
      {next && (
        <button
          type="button"
          onClick={() => onSelect(next[0])}
          className="rounded-md bg-emerald-900 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900"
        >
          {next[1]} →
        </button>
      )}
    </div>
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
  const [highlighted, setHighlighted] = useState<Set<keyof FarmForm>>(new Set());
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [drawn, setDrawn] = useState<DrawnField | null>(null);
  /** Where the map should look: set by geocoding, not by drawing (that would jump the map). */
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);

  const onFieldDrawn = (field: DrawnField | null) => {
    setDrawn(field);
    if (!field) return;
    updateForm({ locationText: DRAWN_FIELD_NAME, areaDecare: String(Math.round(field.areaDecare * 10) / 10).replace('.', ',') });
    // Set after updateForm, which clears the geocoded location when the location text changes.
    setSelectedGeo({ id: 0, name: DRAWN_FIELD_NAME, latitude: field.latitude, longitude: field.longitude });
  };

  const goTo = (s: Step) => {
    setStep(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateForm = (patch: Partial<FarmForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    if (patch.locationText !== undefined) {
      setSelectedGeo(null);
      setGeoCandidates([]);
    }
    // A field the user touches no longer needs attention.
    setHighlighted((h) => {
      const next = new Set(h);
      (Object.keys(patch) as (keyof FarmForm)[]).forEach((k) => next.delete(k));
      return next;
    });
  };

  const applyParsed = (parsed: ParsedFarm) => {
    const { patch, missing } = parsedFarmToForm(parsed);
    updateForm(patch);
    // Not part of the text schema – only flag them if still empty.
    const alsoNeeded = (['soil', 'pumpEfficiency'] as const).filter((k) => form[k].trim() === '' && patch[k] == null);
    setHighlighted(new Set([...missing, ...alsoNeeded]));
    setFollowUp(parsed.follow_up_question || null);
    setErrors({});
    setRun(null);
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
        setMapCenter([geo.latitude, geo.longitude]);
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
      if (!archive.ok && !forecast.ok) throw new Error(archive.error);

      setRun({ input, formSnapshot: JSON.stringify(form), geo, archive, forecast, seasonLengthAtFetch: seasonLength(crop) });

      // Out of season the forecast has nothing to plan, so the retrospective is the main screen.
      const inSeason =
        forecast.ok &&
        forecast.value.daily.length > 0 &&
        intersectWindows(seasonWindow(input.plantingDate, crop), {
          start: forecast.value.daily[0].date,
          end: forecast.value.daily.at(-1)!.date,
        }) != null;
      goTo(inSeason || !archive.ok ? 2 : 3);
    } catch (e) {
      setError(errorMessage(e));
      setStep(1);
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

  const explainPayload = useMemo(
    () => (run ? buildExplainPayload(week, retro, run.input.energySource === 'solar_grid') : null),
    [run, week, retro],
  );

  // This week's pumping days if there are any; out of season, example days from last season.
  const solarDaySource = useMemo(() => {
    if (week && pumpingDates(week).length > 0) return { analysis: week, caption: 'Bu haftanın planından' };
    if (retro && pumpingDates(retro).length > 0) return { analysis: retro, caption: 'Geçen sezondan örnek gün' };
    return null;
  }, [week, retro]);

  // The panel follows the calculated field, or the form before the first calculation.
  const panelCrop = run?.input.crop ?? (form.crop || null);
  const panelSoil = run?.input.soil ?? (form.soil || null);
  const panelMethod = run?.input.irrigationMethod ?? (form.irrigationMethod || null);

  const seasonLengthChanged = run != null && seasonLength(assumptions.crops[run.input.crop]) !== run.seasonLengthAtFetch;
  const formChanged = run != null && JSON.stringify(form) !== run.formSnapshot;
  const place = run ? [run.geo.name, run.geo.admin1].filter(Boolean).join(', ') : '';
  const fieldSummary = run
    ? `${place} · ${assumptions.crops[run.input.crop].name} · ${fmt(run.input.areaDecare)} dekar · ${
        IRRIGATION_METHOD_NAMES[run.input.irrigationMethod]
      }`
    : '';

  const staleNotice = (formChanged || seasonLengthChanged) && (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <span>
        {formChanged
          ? 'Tarla bilgilerini değiştirdiniz; sonuçlar eski bilgilere göre.'
          : 'Dönem süreleri değişti; tüm sezonun verisini almak için yeniden hesaplayın.'}
      </span>
      <button
        type="button"
        disabled={loading}
        onClick={() => void calculate()}
        className="rounded-md bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-700 disabled:opacity-60"
      >
        {loading ? 'Hesaplanıyor…' : 'Yeniden hesapla'}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50 text-soil-900">
      <AppSwitch current="/planla" />

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Tarlanı çiz, planını al</h1>
          <p className="mt-1 text-stone-600">Haritada tarlanı çiz ya da birkaç cümleyle anlat; sulama planın hazır.</p>
        </div>
        <StepNav current={step} enabled={run != null} onSelect={goTo} />

        {step !== 1 && run && (
          <p className="text-sm text-soil-600">
            <span className="font-medium text-soil-800">Tarla:</span> {fieldSummary}
          </p>
        )}
        {step !== 1 && staleNotice}

        {step === 1 && (
          <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">1) Tarlanı göster</h2>
              <button
                type="button"
                onClick={() => {
                  updateForm(demoForm(new Date().getFullYear()));
                  setErrors({});
                  setFollowUp(null);
                }}
                className="rounded-md border border-emerald-900 px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
              >
                Demo tarla yükle
              </button>
            </div>

            <div className="mb-5 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 flex items-start gap-2 text-sm text-soil-700">
                  <MapPin size={18} className="mt-0.5 shrink-0 text-emerald-800" />
                  Haritada sol üstteki çizim aracıyla tarlanızın köşelerine tıklayın. Alan ve konum forma kendiliğinden
                  yazılır.
                </p>
                <ErrorBoundary
                  fallback={
                    <div className="rounded-lg bg-soil-100 p-4 text-sm text-soil-700">
                      Harita şu an yüklenemedi. Konumu ve alanı aşağıdaki forma elle yazabilirsiniz.
                    </div>
                  }
                >
                  <Suspense fallback={<div className="h-80 rounded-lg bg-soil-100 p-4 text-sm text-soil-600">Harita yükleniyor…</div>}>
                    <FieldMap center={mapCenter} onChange={onFieldDrawn} />
                  </Suspense>
                </ErrorBoundary>
                {drawn && (
                  <p className="mt-2 text-sm font-medium text-soil-900">
                    Çizilen tarla: {fmt(drawn.areaDecare, 1)} dekar · {drawn.latitude.toFixed(4)}, {drawn.longitude.toFixed(4)}
                  </p>
                )}
              </div>
              <FarmTextInput onParsed={applyParsed} />
            </div>

            {highlighted.size > 0 && (
              <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p>
                  Metinden alınan bilgiler forma yazıldı. Sarı çerçeveli alanlar metinde yoktu; lütfen doldurun veya
                  kontrol edin, sonra "Planı hesapla"ya basın.
                </p>
                {followUp && <p className="mt-1 font-medium">{followUp}</p>}
              </div>
            )}

            <FarmFormView form={form} errors={errors} highlighted={highlighted} onChange={updateForm} />

            {geoCandidates.length > 1 && selectedGeo && (
              <div className="mt-4 text-sm">
                <label className="flex flex-wrap items-center gap-2">
                  <span className="text-soil-600">Bulunan konum:</span>
                  <select
                    className="rounded-md border border-soil-300 px-2 py-1"
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

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-soil-100 pt-4">
              {run && !formChanged && (
                <button type="button" onClick={() => goTo(2)} className="text-sm font-medium text-emerald-900 hover:underline">
                  Sonuçlara git →
                </button>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={() => void calculate()}
                className="rounded-2xl bg-emerald-900 px-6 py-3 text-lg font-semibold text-white shadow-sm hover:bg-emerald-900 disabled:opacity-60"
              >
                {loading ? 'Hava verisi alınıyor…' : 'Planı hesapla'}
              </button>
            </div>

            {Object.keys(errors).length > 0 && <p className="mt-3 text-sm text-red-600">Lütfen işaretli alanları düzeltin.</p>}
            {error && (
              <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error} Formu elle düzenleyip tekrar deneyebilirsiniz.
              </p>
            )}
          </section>
        )}

        {step === 2 && run && (
          <>
            {explainPayload && (
              <Section title="Planın, sade Türkçeyle">
                <ExplanationPanel key={JSON.stringify(explainPayload)} payload={explainPayload} />
              </Section>
            )}
            {run.input.energySource === 'solar_grid' && solarDaySource && (
              <Section title="Güneş ve pompa, saat saat">
                <SolarPumpDay
                  key={solarDaySource.caption}
                  analysis={solarDaySource.analysis}
                  caption={solarDaySource.caption}
                />
              </Section>
            )}
            <Section title="2) Bu haftanın planı" subtitle={`Open-Meteo ${FORECAST_DAYS} günlük tahmin`}>
              {!run.forecast.ok ? (
                <LoadError message={run.forecast.error} onBack={() => goTo(1)} />
              ) : (
                week && (
                  <WeeklyPlan
                    analysis={week}
                    energySource={run.input.energySource}
                    forecastDays={FORECAST_DAYS}
                    onShowRetrospective={() => goTo(3)}
                  />
                )
              )}
            </Section>
            <Section title="Telefonuna gelsin: Telegram uyarıları">
              <TelegramPanel input={run.input} geo={run.geo} assumptions={assumptions} />
            </Section>
            <StepButtons prev={[1, 'Tarla bilgileri']} next={[3, 'Etkin: geriye dönük test']} onSelect={goTo} />
          </>
        )}

        {step === 3 && run && (
          <>
            <Section
              title="3) Etkin – geriye dönük test"
              subtitle={
                run.archive.ok && (
                  <>
                    Open-Meteo arşiv verisi · {trDate(run.archive.value.plantingDate)} ekimli sezon
                    {run.archive.value.shiftedYears !== 0 &&
                      ' (bu yılın sezonu henüz tamamlanmadığı için en son tamamlanan sezon)'}
                  </>
                )
              }
            >
              {!run.archive.ok ? (
                <LoadError message={run.archive.error} onBack={() => goTo(1)} />
              ) : retro && retro.balance.days.length > 0 ? (
                <Retrospective
                  analysis={retro}
                  energySource={run.input.energySource}
                  seasonLabel={`${trDate(retro.balance.days[0].date)} – ${trDate(retro.balance.days.at(-1)!.date)}`}
                  maxRotationDays={assumptions.maxRotationDays}
                />
              ) : (
                <p className="text-sm text-soil-600">Seçilen dönem için hava verisi bulunamadı.</p>
              )}
            </Section>

            {retro && retro.balance.days.length > 0 && (
              <Section title="Günlük su dengesi (geriye dönük sezon)">
                {run.archive.ok && run.archive.value.weather.missingDates.length > 0 && (
                  <p className="text-sm text-amber-800">
                    {run.archive.value.weather.missingDates.length} gün için hava verisi eksik olduğundan hesaba katılmadı.
                  </p>
                )}
                <SummaryCards result={retro.balance} />
                <WaterBalanceChart result={retro.balance} />
              </Section>
            )}
            <StepButtons prev={[2, 'Planın']} onSelect={goTo} />
          </>
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

      <footer className="mx-auto max-w-6xl px-4 pb-6 text-xs text-stone-500">
        <OpenMeteoCredit />
      </footer>
    </div>
  );
}
