# WhatsApp Bot - Baileys (Open Source)

Baileys is a **100% open-source, free** WhatsApp Web API library. It is NOT the official Meta/WhatsApp Business API.

## How It Works
- Connects directly to WhatsApp Web via WebSocket
- You scan a QR code with your phone (just like WhatsApp Web on desktop)
- No API keys, no Meta approval, no monthly fees
- Fully open-source under MIT License

## How It Differs from Official API

| Feature | Baileys (Open Source) | Official Meta API |
|---------|----------------------|-------------------|
| Cost | FREE | Paid ($0.05-0.10 per conversation) |
| Approval | None needed | Requires Meta Business verification |
| Setup | Scan QR code, done | Complex onboarding |
| Phone Number | Your existing number | Dedicated business number |
| Limits | None (use responsibly) | Rate limits apply |
| License | MIT (open source) | Proprietary |

## How ChatGPT/Meta AI Work on WhatsApp

ChatGPT and Meta AI on WhatsApp use the **official WhatsApp Business API** (paid, requires Meta approval). 

Our approach is different but achieves the same result:
- **Baileys** connects to WhatsApp Web (free, open source)
- **AI Engine** processes messages and generates responses
- **User Experience** is identical — user texts, bot responds

The user cannot tell the difference. The conversation feels the same.

## Setup Instructions

1. Install dependencies: `npm install`
2. Run: `npm start`
3. Scan the QR code with your phone (WhatsApp > Linked Devices > Link a Device)
4. Start texting the bot!

## Important Notes

- This connects to YOUR WhatsApp account (or a dedicated number)
- Use a secondary number for the bot, not your personal number
- Baileys is unofficial — use at your own discretion
- WhatsApp may restrict accounts that behave like bots (rare but possible)
