import { explainPlan } from './_lib/handlers.js';

export function POST(request: Request): Promise<Response> {
  return explainPlan(request);
}
