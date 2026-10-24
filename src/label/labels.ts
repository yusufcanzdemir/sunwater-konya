/** Crop labels as stored in pipeline/04_labels/labels.csv (one row per labelled field). */

export type Confidence = 'high' | 'medium';
export type Sampling = 'random' | 'targeted';
/** Non-class outcomes: the labeller could not decide, or the field polygon is wrong. */
export const SKIP_CLASSES = { unsure: 'Emin değilim', bad_segment: 'Segment hatalı' } as const;
export type SkipClass = keyof typeof SKIP_CLASSES;

export interface LabelRow {
  field_id: string;
  class: string;
  confidence: Confidence | '';
  sampling: Sampling;
  labeled_by: string;
  labeled_at: string;
  /** Field centroid, so labels can be re-linked if field ids change after re-segmentation. */
  lon: number;
  lat: number;
}

export const CSV_COLUMNS: (keyof LabelRow)[] = [
  'field_id',
  'class',
  'confidence',
  'sampling',
  'labeled_by',
  'labeled_at',
  'lon',
  'lat',
];

const quote = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV text with a header row; values containing separators or quotes are quoted. */
export function writeCsv<T extends object>(rows: T[], columns: (keyof T)[]): string {
  const lines = [columns.join(',')];
  for (const r of rows) lines.push(columns.map((c) => quote(String(r[c]))).join(','));
  return lines.join('\n') + '\n';
}

export const toCsv = (rows: LabelRow[]) => writeCsv(rows, CSV_COLUMNS);

/** Splits one CSV line, honouring double-quoted fields. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Rows of a CSV with a header line, as column -> text records. */
export function readCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return [];
  const header = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

export function fromCsv(text: string): LabelRow[] {
  return readCsv(text).map((r) => ({
    field_id: r.field_id ?? '',
    class: r.class ?? '',
    confidence: (r.confidence ?? '') as Confidence | '',
    sampling: r.sampling as Sampling,
    labeled_by: r.labeled_by ?? '',
    labeled_at: r.labeled_at ?? '',
    lon: Number(r.lon),
    lat: Number(r.lat),
  }));
}

/** Plausibility check of a proposed class (04_labels/checks.csv, PLAN.md D14). */
export type Verdict = 'agree' | 'disagree' | 'unsure';

export interface CheckRow {
  field_id: string;
  proposed: string;
  verdict: Verdict;
  /** Optional class the checker would choose instead, when they disagree. */
  correct_class: string;
  checked_by: string;
  checked_at: string;
}

export const CHECK_COLUMNS: (keyof CheckRow)[] = ['field_id', 'proposed', 'verdict', 'correct_class', 'checked_by', 'checked_at'];

export const checksToCsv = (rows: CheckRow[]) => writeCsv(rows, CHECK_COLUMNS);

export function checksFromCsv(text: string): CheckRow[] {
  return readCsv(text).map((r) => ({
    field_id: r.field_id ?? '',
    proposed: r.proposed ?? '',
    verdict: r.verdict as Verdict,
    correct_class: r.correct_class ?? '',
    checked_by: r.checked_by ?? '',
    checked_at: r.checked_at ?? '',
  }));
}

/** Labels per class, counting only real classes (not unsure / bad segment). */
export function classCounts(rows: LabelRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) if (!(r.class in SKIP_CLASSES)) counts[r.class] = (counts[r.class] ?? 0) + 1;
  return counts;
}
