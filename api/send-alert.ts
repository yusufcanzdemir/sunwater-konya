import { sendAlertEndpoint } from './_lib/telegramHandlers';

export function GET(request: Request): Promise<Response> {
  return sendAlertEndpoint(request);
}

export function POST(request: Request): Promise<Response> {
  return sendAlertEndpoint(request);
}
