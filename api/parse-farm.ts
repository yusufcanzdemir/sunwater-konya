import { parseFarm } from './_lib/handlers.js';

export function POST(request: Request): Promise<Response> {
  return parseFarm(request);
}
