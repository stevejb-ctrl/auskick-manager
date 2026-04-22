# Telegram notifications

Siren sends you a Telegram message whenever a new user signs up or a team is created.

## Setup (one-time)

### 1. Create a bot

1. Open Telegram and message **@BotFather**.
2. Send `/newbot` and follow the prompts — pick any name (e.g. "Siren Footy alerts") and a unique username ending in `bot`.
3. BotFather replies with your **bot token** — looks like `123456789:AAF...`. Copy it.

### 2. Get your chat ID

1. Send any message to your new bot (e.g. "hello").
2. Open this URL in a browser (replace `<TOKEN>` with your token):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
3. Find `"chat":{"id": ...}` in the JSON. That number is your **chat ID**.

### 3. Add env vars to Vercel

In your [Vercel project settings → Environment Variables](https://vercel.com/dashboard), add both variables for **Production** and **Preview**:

| Variable | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | The token from BotFather |
| `TELEGRAM_CHAT_ID` | Your chat ID (the number from step 2) |

For local development, add the same values to `.env.local`.

## What gets notified

| Event | Message |
|---|---|
| New signup | 🎉 New Siren Footy signup — email + timestamp |
| New team created | 🏉 New team created — name, age group, creator email + timestamp |

Notifications are fire-and-forget: a Telegram outage will never break signup or team creation, and missing env vars silently skip the notification (so local dev and PR previews work with no config).
