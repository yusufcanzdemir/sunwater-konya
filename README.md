# SunWater Konya

**AI-powered irrigation planning for sustainable groundwater management.**

SunWater Konya is a data-driven irrigation planning project designed to help farmers in the Konya Closed Basin, Türkiye, make better irrigation decisions while reducing unnecessary groundwater extraction.

The project combines crop water requirement estimation, weather forecasts, rainfall data, and solar energy availability to generate practical irrigation recommendations tailored to individual fields.

## The Problem

Groundwater over-abstraction in the Konya Closed Basin raises concerns about declining groundwater levels, agricultural sustainability, and sinkhole formation. Solar-powered irrigation can reduce pumping costs, but without effective water management, low marginal energy costs may weaken incentives to conserve groundwater.

## Our Approach

- **Crop water requirements:** Estimate reference evapotranspiration (ET₀) and crop evapotranspiration (ETc) using FAO-56 principles.
- **Weather-aware irrigation:** Incorporate rainfall forecasts and weather data into irrigation planning.
- **Solar-aware scheduling:** Align pumping recommendations with expected solar energy availability.
- **Accessible recommendations:** Use AI to translate structured calculations into clear, farmer-friendly guidance.
- **Impact estimation:** Track estimated water savings, pumping energy use, and associated emissions under explicitly stated assumptions.

## Technology Stack

- React and TypeScript
- Open-Meteo weather and evapotranspiration APIs
- FAO-56 crop water requirement methodology
- Gemini API for natural-language interaction

## Project Goals

The long-term goal is to support more efficient agricultural water use, reduce avoidable groundwater extraction, and contribute to sustainable irrigation practices in the Konya Closed Basin.

**Important:** Water savings, emissions reductions, and impacts on sinkhole risk are targets to be evaluated through field measurements and validated data. They are not yet established outcomes of the project.

## Telegram bot

The bot sends the field's plan to the farmer's phone and takes feedback ("✅ Suladım", "🌧 Yağmur yağdı", "📅 Haftalık plan"). The feedback is written into the water balance as observed records, so the next plan starts from the real field state. All numbers come from the engine; Gemini only rewords the message and is checked.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/telegram-webhook` | Telegram updates: `/start <fieldId>` links a chat to a field, button presses add records |
| `POST /api/telegram-link` | Web app saves the current field and gets the `t.me/<bot>?start=<fieldId>` link (shown as QR) |
| `POST /api/send-alert` | Web "Telegram'a bildirim gönder": alert to the chats linked to the field and `TELEGRAM_DEMO_CHAT_ID` |
| `GET /api/send-alert` | Daily cron 07:00 Europe/Istanbul (`0 4 * * *` UTC in `vercel.json`); silent out of season, adds a "Plan değişti" note when the plan moved |

### Environment

`TELEGRAM_BOT_TOKEN` (BotFather), `TELEGRAM_DEMO_CHAT_ID` (your user id), optional `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`, and `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`). Without Redis/KV the bot keeps chats and records in memory, which is fine locally but is lost on serverless cold starts.

A bot cannot write first: open the bot in Telegram and press **Start** once.

### Local development

`npm run dev` long-polls Telegram (`getUpdates`) and feeds updates to the webhook handler, so no public URL is needed. Polling is skipped when a webhook is set; set `TELEGRAM_POLLING=0` to turn it off. Only one process may poll a bot at a time.

### Webhook (after deploying)

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://<your-app>.vercel.app/api/telegram-webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  -d 'allowed_updates=["message","callback_query"]'

# check / remove
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"
```

Assumptions used by the bot: rain buttons "az / orta / çok" = 5 / 15 / 30 mm; a typed duration ("6 saat") is converted to `Q × hours / area × efficiency` mm; "Suladım" without a duration records the planned net amount of the current round.
