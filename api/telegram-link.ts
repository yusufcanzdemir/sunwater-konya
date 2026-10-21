import { telegramLink } from './_lib/telegramHandlers';

export function POST(request: Request): Promise<Response> {
  return telegramLink(request);
}
