import { telegramLink } from './_lib/telegramHandlers.js';

export function POST(request: Request): Promise<Response> {
  return telegramLink(request);
}
