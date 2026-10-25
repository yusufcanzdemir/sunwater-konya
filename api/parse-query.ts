import { parseQuery } from './_lib/handlers.js';

export function POST(request: Request): Promise<Response> {
  return parseQuery(request);
}
