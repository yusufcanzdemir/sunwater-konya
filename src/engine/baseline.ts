// Baseline = the farmer's current habit, for comparison with the model plan.

export interface Habit {
  intervalDays: number;
  hours: number;
}

export interface CumulativePoint {
  date: string;
  volumeM3: number;
}

export interface Baseline {
  /** 'habit' from the farmer's answer, or 'assumed' over-irrigation when no habit was given. */
  kind: 'habit' | 'assumed';
  volumeM3: number;
  irrigationCount: number | null;
  cumulative: CumulativePoint[];
}

/** Over-irrigation factor used when no habit is given (assumption). */
export const DEFAULT_OVER_IRRIGATION_FACTOR = 1.25;

/**
 * Habit: irrigate on season day 0, interval, 2 × interval, … for `hours` each.
 * Season volume = Q × hours × number of irrigations.
 */
export function habitBaseline(seasonDates: string[], habit: Habit, flowM3h: number): Baseline {
  const perIrrigation = flowM3h * habit.hours;
  let volume = 0;
  let count = 0;
  const cumulative = seasonDates.map((date, i) => {
    if (i % habit.intervalDays === 0) {
      volume += perIrrigation;
      count += 1;
    }
    return { date, volumeM3: volume };
  });
  return { kind: 'habit', volumeM3: volume, irrigationCount: count, cumulative };
}

/** No habit given: V_baseline = V_model_net / efficiency × factor (= model gross × factor). */
export function assumedBaseline(
  modelCumulative: CumulativePoint[],
  factor: number = DEFAULT_OVER_IRRIGATION_FACTOR,
): Baseline {
  const cumulative = modelCumulative.map((p) => ({ date: p.date, volumeM3: p.volumeM3 * factor }));
  return {
    kind: 'assumed',
    volumeM3: cumulative.at(-1)?.volumeM3 ?? 0,
    irrigationCount: null,
    cumulative,
  };
}
