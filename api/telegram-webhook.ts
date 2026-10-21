import { telegramWebhook } from './_lib/telegramHandlers';

export function POST(request: Request): Promise<Response> {
  return telegramWebhook(request);
}
