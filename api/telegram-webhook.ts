import { telegramWebhook } from './_lib/telegramHandlers.js';

export function POST(request: Request): Promise<Response> {
  return telegramWebhook(request);
}
