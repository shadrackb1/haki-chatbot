# Weather Skill

Real-time weather conditions and multi-day forecasts for any city worldwide, powered by OpenWeatherMap.

## Overview

| Property     | Value                                                              |
| ------------ | ------------------------------------------------------------------ |
| **Name**     | `weather`                                                          |
| **Triggers** | weather, forecast, temperature, how hot, how cold, rain, sunny, climate |
| **API**      | OpenWeatherMap (Current Weather + 5-Day Forecast)                  |
| **Units**    | Metric (°C, m/s)                                                   |
| **Requires** | `OPENWEATHER_API_KEY` environment variable                         |

## Examples

| User message                        | Response                          |
| ----------------------------------- | --------------------------------- |
| `weather in Nairobi`                | Current + 2-day forecast          |
| `forecast for London`               | Current + 2-day forecast          |
| `temperature in Tokyo`              | Current + 2-day forecast          |
| `how hot is it in Dubai`            | Current + 2-day forecast          |
| `will it rain in Mumbai`            | Current + 2-day forecast          |
| `weather` (no location)             | Prompts for a location            |
| `weather in Mytown` (unknown city)  | "City not found" error            |

## Setup

1. Get a free API key at [openweathermap.org/api](https://openweathermap.org/api)
2. Add to your `.env`:
   ```
   OPENWEATHER_API_KEY=your_api_key_here
   ```
3. The skill auto-activates when the key is present.

## Location Support

- **City names**: `weather in Nairobi`, `forecast for New York`
- **City + country code**: `weather in Paris, FR`
- **Coordinates** (via context): latitude/longitude fallback
- **Current location**: `weather my location` (requires `context.location`)

## Response Format

```
🌤️ *Weather in Nairobi, KE*

📅 *Now:*
🌡️ 24°C (feels like 23°C)
🌤️ partly cloudy
💧 Humidity: 65%
🌬️ Wind: 3.2 m/s

📅 *Tuesday:*
🌡️ 18°C - 27°C
🌧️ light rain

📅 *Wednesday:*
🌡️ 17°C - 26°C
☁️ overcast clouds
```

## Weather Emojis

| Condition      | Emoji  |
| -------------- | ------ |
| Clear sky      | ☀️     |
| Partly cloudy  | 🌤️     |
| Cloudy         | ☁️     |
| Rain           | 🌧️ / 🌦️ |
| Thunderstorm   | ⛈️     |
| Snow           | ❄️     |
| Fog / Mist     | 🌫️     |

## Error Handling

| Error              | Message                                             |
| ------------------ | --------------------------------------------------- |
| Missing API key    | "Weather skill is not configured..."                |
| City not found     | "City not found: {location}. Check spelling..."     |
| Invalid API key    | "Weather API key is invalid or missing..."          |
| Rate limited       | "Too many weather requests..."                      |
| No user location   | "I don't have your location. Please share a city..." |

## API Details

- **Current weather**: `GET /data/2.5/weather?q={location}&appid={key}&units=metric`
- **5-day forecast**: `GET /data/2.5/forecast?q={location}&appid={key}&units=metric`
- Free tier: 1,000 calls/day, 60 calls/min
- Forecast entries are grouped by day; dominant icon/description used per day
- Only the next 2 days after today are displayed (3-day total including today)
