import { telegramLink } from './_lib/telegramHandlers.js';

export function GET(request: Request): Promise<Response> {
  return telegramLink(request);
}

export function POST(request: Request): Promise<Response> {
  return telegramLink(request);
}
