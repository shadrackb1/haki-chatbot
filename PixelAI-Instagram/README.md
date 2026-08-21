# Pixel AI Instagram Bot

A full-featured Instagram automation bot that provides human-like interactions through direct messages. The bot can comment, like, follow, unfollow, repost to stories, search hashtags/users, and more - all controllable via simple DM commands.

## ⚠️ IMPORTANT WARNING

**This bot uses unofficial Instagram APIs (instagrapi). Using this bot carries significant risks:**

- **Permanent account ban** - Instagram actively bans accounts using automation
- **Terms of Service violation** - This is against Instagram's ToS
- **Account restrictions** - Temporary blocks, challenge verifications, etc.
- **Instability** - Breaks when Instagram updates their API
- **Rate limits** - Instagram imposes strict limits on automated actions

**Use at your own risk. Consider using official platforms like WhatsApp or Telegram instead.**

If you proceed:
- Use a **secondary/test account** (not your main personal/professional account)
- Start with **low frequency** actions
- Be prepared to **lose access** to the account
- Enable **two-factor authentication** for recovery

## Features

### Natural Conversation
- Responds to casual chat in English and Kiswahili
- Human-like responses with varied sentence length and personality
- Remembers conversation context
- Help command shows available features

### Instagram Controls (Owner-only)
All Instagram control commands must be sent by the account owner (configured via `PIXEL_OWNER_ID`):

- **Feed & Stories**
  - `feed` - See recent posts from your feed
  - `story` - See recent stories from followed users

- **Interactions**
  - `follow @username` - Follow a user
  - `unfollow @username` - Unfollow a user
  - `like @username's latest` - Like user's most recent post
  - `comment on @username's latest: [text]` - Comment on user's latest post
  - `repost @username's latest to story` - Share user's latest post to your story

- **Search & Discovery**
  - `search for #hashtag` - Search recent posts by hashtag
  - `search @username` - Search for users by name/username
  - `info @username` - Get detailed profile information

- **Messaging**
  - `dm @username [message]` - Send a direct message to a user

## Setup

### 1. Prerequisites
- Python 3.8+
- Instagram account (use a secondary/test account recommended)

### 2. Installation
```bash
# Clone or copy this directory
cd PixelAI-Instagram

# Install dependencies
pip install -r requirements.txt

# Copy example env and configure
cp .env.example .env
# Edit .env with your Instagram credentials
```

### 3. Configuration
Edit `.env` file:
```env
PIXEL_INSTAGRAM_USERNAME=your_instagram_username
PIXEL_INSTAGRAM_PASSWORD=your_instagram_password
# Optional: Get your numeric user ID from https://www.instagram.com/username/?__a=1
PIXEL_OWNER_ID=1234567890
```

### 4. First Run
```bash
python pixel_instagram_bot.py
```
- On first run, you'll need to enter your credentials
- If 2FA is enabled, you'll be prompted for the code
- A session file (`pixel_session.json`) will be created for future logins

## Usage

### Starting the Bot
```bash
python pixel_instagram_bot.py
```
Or use the launch script:
```bash
Launch-Pixel-Instagram.cmd
```

### Interacting with the Bot
Send direct messages to the Instagram account running the bot:

**Casual Chat:**
```
Hey Pixel!
What's up?
Help
```

**Instagram Commands (Owner only):**
```
feed
story
follow @natgeo
like @natgeo's latest
comment on @natgeo's latest: Amazing photo!
repost @natgeo's latest to story
search for #photography
search @natgeo
info @natgeo
dm @natgeo Love your content!
```

## How It Works

1. **Login** - Uses instagrapi to login to Instagram (with session persistence)
2. **Monitoring** - Periodically checks for new DMs (every 30 seconds by default)
3. **Processing** - 
   - Ignores non-owner messages for Instagram commands
   - Processes casual chat with natural responses
   - Executes Instagram actions based on commands
4. **Rate Limiting** - Built-in delays to avoid detection (configurable)
5. **Session Management** - Saves login session to avoid frequent re-authentication

## Safety Features

- **Owner Restriction** - Instagram commands only work from the configured owner account
- **Rate Limiting** - Configurable delays between actions to avoid spam detection
- **Human-like Delays** - Randomized action timing (2-5 seconds) to mimic human behavior
- **Error Handling** - Graceful degradation when Instagram returns errors
- **Session Persistence** - Reduces login frequency, lowering risk of challenge locks

## Customization

### Adjusting Delays
Modify in `.env`:
- `PIXEL_RATE_LIMIT_DELAY` - Seconds between DM checks (default: 30)
- `PIXEL_ACTION_DELAY` - Seconds between Instagram actions (default: 5)

### Changing Responses
Edit the `get_response()` method in `pixel_instagram_bot.py` to customize:
- Welcome message
- Help text
- Casual chat responses
- Add LLM integration for smarter responses

## Troubleshooting

### Common Issues

**"Login failed"**
- Check username/password in .env
- Verify account isn't banned or restricted
- Check for 2FA requirement

**"Challenge required"**
- Instagram suspects automated behavior
- Solution: Complete challenge in Instagram app, then restart bot
- Consider using a different IP/network

**"Feedback required"**
- Rate limited by Instagram
- Solution: Wait 15-60 minutes before restarting
- Increase `PIXEL_ACTION_DELAY` in .env

**"No session file"**
- Delete `pixel_session.json` and relogin
- Ensures fresh login credentials

### Logs
Check console output for detailed logging. The bot logs:
- Login attempts and successes
- Action execution (follows, likes, comments, etc.)
- Errors and warnings
- Rate limiting events

## Disclaimer

This tool is for educational purposes only. The author is not responsible for any account bans, restrictions, or losses resulting from the use of this software. Users assume all risks associated with automating Instagram interactions.

By using this bot, you acknowledge that:
1. You understand the risks of account termination
2. You are violating Instagram's Terms of Service
3. You accept full responsibility for any consequences
4. You will use a secondary/test account, not your primary account