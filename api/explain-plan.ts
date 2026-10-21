import { explainPlan } from './_lib/handlers';

export function POST(request: Request): Promise<Response> {
  return explainPlan(request);
}
