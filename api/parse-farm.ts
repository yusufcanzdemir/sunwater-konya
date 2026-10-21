import { parseFarm } from './_lib/handlers';

export function POST(request: Request): Promise<Response> {
  return parseFarm(request);
}
