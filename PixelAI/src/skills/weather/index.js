/**
 * Weather Skill — Current conditions & 3-day forecast via OpenWeatherMap.
 *
 * Triggers: weather, forecast, temperature, how hot, how cold, rain, sunny, climate
 * Requires: OPENWEATHER_API_KEY environment variable
 */

const BASE_URL = 'https://api.openweathermap.org/data/2.5';

const WEATHER_EMOJIS = {
    '01d': '☀️', '01n': '🌙',
    '02d': '🌤️', '02n': '🌤️',
    '03d': '☁️', '03n': '☁️',
    '04d': '☁️', '04n': '☁️',
    '09d': '🌧️', '09n': '🌧️',
    '10d': '🌦️', '10n': '🌦️',
    '11d': '⛈️', '11n': '⛈️',
    '13d': '❄️', '13n': '❄️',
    '50d': '🌫️', '50n': '🌫️',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const LOCATION_PATTERNS = [
    /weather\s+(?:in|for|at)\s+(.+)/i,
    /forecast\s+(?:in|for|at)\s+(.+)/i,
    /temperature\s+(?:in|for|at)\s+(.+)/i,
    /how\s+(?:hot|cold|warm)\s+(?:is\s+)?(?:it\s+)?(?:in|for|at)\s+(.+)/i,
    /(?:will\s+)?(?:it\s+)?(?:rain|snow|be\s+sunny|be\s+cloudy)\s+(?:in|for|at)\s+(.+)/i,
    /climate\s+(?:in|for|at)\s+(.+)/i,
];

/**
 * Extract location from the user message.
 * Supports patterns like "weather in Nairobi", "forecast for London", etc.
 * Returns null if no location is found.
 */
function extractLocation(message) {
    const trimmed = message.trim();

    for (const pattern of LOCATION_PATTERNS) {
        const match = trimmed.match(pattern);
        if (match && match[1]) {
            let location = match[1].trim();
            location = location.replace(/[?.!]+$/, '').trim();
            if (location.length > 0) return location;
        }
    }

    const lower = trimmed.toLowerCase();
    if (lower.includes('my location') || lower.includes('here') || lower.includes('current location')) {
        return '__CURRENT_LOCATION__';
    }

    return null;
}

/**
 * Resolve a human-friendly location label from context when "my location" is used.
 * Falls back to null if no geo data is available.
 */
function resolveCurrentLocation(context) {
    if (context?.location?.city) return context.location.city;
    if (context?.location?.lat && context?.location?.lon) {
        return `${context.location.lat},${context.location.lon}`;
    }
    return null;
}

/**
 * Fetch JSON from a URL. Throws on non-2xx responses.
 */
async function fetchJSON(url) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
        const msg = data?.message || `HTTP ${res.status}`;
        const err = new Error(msg);
        err.cod = data?.cod;
        throw err;
    }
    return data;
}

/**
 * Map an OpenWeatherMap icon code to a WhatsApp-friendly emoji.
 */
function weatherEmoji(iconCode) {
    return WEATHER_EMOJIS[iconCode] || '🌤️';
}

/**
 * Group forecast entries by date and return an array of daily summaries.
 * Skips today (index 0) since we use the current-weather endpoint for that.
 */
function groupForecastByDay(list) {
    const byDate = new Map();

    for (const entry of list) {
        const date = entry.dt_txt.split(' ')[0];
        if (!byDate.has(date)) {
            byDate.set(date, {
                entries: [],
                temps: [],
                icons: [],
                descriptions: [],
            });
        }
        const bucket = byDate.get(date);
        bucket.entries.push(entry);
        bucket.temps.push(entry.main.temp_min, entry.main.temp_max);
        bucket.icons.push(entry.weather[0].icon);
        bucket.descriptions.push(entry.weather[0].description);
    }

    const today = new Date().toISOString().split('T')[0];
    const days = [];

    for (const [date, bucket] of byDate) {
        if (date === today) continue;
        if (days.length >= 2) break;

        const min = Math.round(Math.min(...bucket.temps));
        const max = Math.round(Math.max(...bucket.temps));

        const iconCounts = new Map();
        for (const icon of bucket.icons) {
            iconCounts.set(icon, (iconCounts.get(icon) || 0) + 1);
        }
        const dominantIcon = [...iconCounts.entries()]
            .sort((a, b) => b[1] - a[1])[0][0];

        const descCounts = new Map();
        for (const desc of bucket.descriptions) {
            descCounts.set(desc, (descCounts.get(desc) || 0) + 1);
        }
        const dominantDesc = [...descCounts.entries()]
            .sort((a, b) => b[1] - a[1])[0][0];

        const dayDate = new Date(date + 'T12:00:00');
        const dayName = DAY_NAMES[dayDate.getUTCDay()];

        days.push({ date, dayName, min, max, icon: dominantIcon, description: dominantDesc });
    }

    return days;
}

/**
 * Format the current weather + forecast into a WhatsApp message.
 */
function formatResponse(current, forecastDays) {
    const { name: city, sys, main, weather, wind } = current;
    const country = sys?.country || '';
    const locationLabel = country ? `${city}, ${country}` : city;

    const currentEmoji = weatherEmoji(weather[0].icon);
    const temp = Math.round(main.temp);
    const feelsLike = Math.round(main.feels_like);
    const humidity = main.humidity;
    const windSpeed = (wind.speed || 0).toFixed(1);
    const description = weather[0].description;

    let msg = `🌤️ *Weather in ${locationLabel}*\n\n`;

    msg += `📅 *Now:*\n`;
    msg += `🌡️ ${temp}°C (feels like ${feelsLike}°C)\n`;
    msg += `${currentEmoji} ${description}\n`;
    msg += `💧 Humidity: ${humidity}%\n`;
    msg += `🌬️ Wind: ${windSpeed} m/s\n`;

    for (const day of forecastDays) {
        const emoji = weatherEmoji(day.icon);
        msg += `\n📅 *${day.dayName}:*\n`;
        msg += `🌡️ ${day.min}°C - ${day.max}°C\n`;
        msg += `${emoji} ${day.description}\n`;
    }

    return msg.trim();
}

/**
 * Build a user-friendly error message from an API error.
 */
function formatError(error, location) {
    const msg = error.message || 'Unknown error';

    if (error.cod === '404' || msg.toLowerCase().includes('not found')) {
        return `❌ City not found: "${location}". Please check the spelling and try again.`;
    }

    if (error.cod === '401' || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('invalid api key')) {
        return '🔑 Weather API key is invalid or missing. Please check the OPENWEATHER_API_KEY configuration.';
    }

    if (error.cod === '429') {
        return '⏳ Too many weather requests. Please try again in a few minutes.';
    }

    return `⚠️ Couldn't fetch weather for "${location}". ${msg}`;
}

export default {
    name: 'weather',
    description: 'Current weather conditions and forecasts for any location',
    triggers: ['weather', 'forecast', 'temperature', 'how hot', 'how cold', 'rain', 'sunny', 'climate'],

    async execute(message, context) {
        const apiKey = process.env.OPENWEATHER_API_KEY;

        if (!apiKey) {
            return {
                response: '🔑 Weather skill is not configured. The OPENWEATHER_API_KEY environment variable is missing.',
            };
        }

        let location = extractLocation(message);

        if (location === '__CURRENT_LOCATION__') {
            location = resolveCurrentLocation(context);
            if (!location) {
                return {
                    response: '📍 I don\'t have your location. Please share a city name, e.g. "weather in Nairobi".',
                };
            }
        }

        if (!location) {
            return {
                response: '🌍 Which location would you like the weather for? For example: "weather in Nairobi" or "forecast for London".',
            };
        }

        const encoded = encodeURIComponent(location);

        try {
            const [current, forecast] = await Promise.all([
                fetchJSON(`${BASE_URL}/weather?q=${encoded}&appid=${apiKey}&units=metric`),
                fetchJSON(`${BASE_URL}/forecast?q=${encoded}&appid=${apiKey}&units=metric`),
            ]);

            const forecastDays = groupForecastByDay(forecast.list);
            const response = formatResponse(current, forecastDays);

            return { response };
        } catch (error) {
            return { response: formatError(error, location) };
        }
    },

    isAvailable() {
        return !!process.env.OPENWEATHER_API_KEY;
    },
};
