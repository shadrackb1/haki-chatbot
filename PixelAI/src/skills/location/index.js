/**
 * Location Skill — Nearby places, directions, and geocoding via free OpenStreetMap APIs.
 *
 * Triggers: near me, nearby, directions to, how to get to, where is, locate, find places, map, close to me
 * APIs: Nominatim (geocoding), Overpass (nearby places), OSRM (routing)
 * No API key required — respects Nominatim 1 req/s rate limit.
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OVERPASS_BASE = 'https://overpass-api.de/api/interpreter';
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/foot';

const USER_AGENT = 'HakiChatbot/1.0 (location-skill)';
const NOMINATIM_DELAY_MS = 1100;

let lastNominatimCall = 0;

// ─── Intent Detection ────────────────────────────────────────────────

const NEARBY_PATTERNS = [
    /near\s*by/i,
    /near\s*me/i,
    /close\s*to\s*me/i,
    /find\s+places?\s+(?:near|around|close)/i,
    /(?:any|some)\s+\w+\s+(?:near|around)\s+(?:me|here)/i,
    /what(?:'s| is| are)\s+(?:near|around)\s+(?:me|here)/i,
    /places?\s+(?:near|around)\s+(?:me|here)/i,
    /things?\s+(?:near|around)\s+(?:me|here)/i,
];

const DIRECTIONS_PATTERNS = [
    /directions?\s+(?:to|from|for)\s+(.+)/i,
    /how\s+(?:do\s+)?(?:i|we)\s+(?:get|go|drive|walk)\s+(?:to|from)\s+(.+)/i,
    /(?:get|go|drive|walk)\s+(?:me\s+)?(?:to|from)\s+(.+)/i,
    /(?:route|path)\s+(?:to|from)\s+(.+)/i,
    /navigate\s+(?:to|from)\s+(.+)/i,
    /take\s+me\s+(?:to|from)\s+(.+)/i,
];

const GEOCODE_PATTERNS = [
    /where\s+(?:is|are)\s+(.+)/i,
    /locate\s+(.+)/i,
    /(?:find|show|get)\s+(?:me\s+)?(?:the\s+)?(?:location|address)\s+(?:of\s+)?(.+)/i,
    /(?:what|where)\s+(?:is|are)\s+(?:the\s+)?(?:address|location)\s+(?:of\s+)?(.+)/i,
    /(?:search|look)\s+(?:for\s+)?(.+)\s+(?:on\s+)?(?:the\s+)?map/i,
];

/**
 * Classify the user's intent from the message text.
 * Returns { type: 'nearby'|'directions'|'geocode', query?: string }
 */
function detectIntent(message) {
    const trimmed = message.trim();

    for (const pattern of NEARBY_PATTERNS) {
        if (pattern.test(trimmed)) {
            return { type: 'nearby' };
        }
    }

    for (const pattern of DIRECTIONS_PATTERNS) {
        const match = trimmed.match(pattern);
        if (match && match[1]) {
            return { type: 'directions', query: cleanDestination(match[1]) };
        }
    }

    for (const pattern of GEOCODE_PATTERNS) {
        const match = trimmed.match(pattern);
        if (match && match[1]) {
            return { type: 'geocode', query: match[1].replace(/[?.!]+$/, '').trim() };
        }
    }

    return null;
}

/**
 * Strip trailing phrases like "from here", "from my location" from a destination string.
 */
function cleanDestination(raw) {
    let dest = raw.replace(/[?.!]+$/, '').trim();
    dest = dest.replace(/\s*,?\s*(from\s+(?:here|my\s+location))$/i, '').trim();
    return dest || null;
}

// ─── Rate-Limited Fetch ──────────────────────────────────────────────

async function rateLimitedFetch(url) {
    const now = Date.now();
    const elapsed = now - lastNominatimCall;
    if (elapsed < NOMINATIM_DELAY_MS) {
        await sleep(NOMINATIM_DELAY_MS - elapsed);
    }
    lastNominatimCall = Date.now();

    const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
    }
    return res.json();
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// ─── Distance Helpers ────────────────────────────────────────────────

function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters) {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds) {
    if (seconds < 60) return 'under a minute';
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function mapLink(lat, lng) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
}

// ─── Nominatim Geocoding ─────────────────────────────────────────────

async function geocode(query) {
    const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;
    const results = await rateLimitedFetch(url);
    if (!results || results.length === 0) return null;

    const r = results[0];
    return {
        name: r.display_name?.split(',')[0] || query,
        displayName: r.display_name || query,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        type: r.type || r.class || '',
        address: r.address || {},
    };
}

// ─── Overpass Nearby Places ──────────────────────────────────────────

const PLACE_TYPE_LABELS = {
    restaurant: '🍽️ Restaurant',
    cafe: '☕ Cafe',
    bar: '🍺 Bar / Pub',
    pub: '🍺 Pub',
    fast_food: '🍔 Fast Food',
    hospital: '🏥 Hospital',
    clinic: '🏥 Clinic',
    pharmacy: '💊 Pharmacy',
    supermarket: '🛒 Supermarket',
    marketplace: '🛒 Market',
    fuel: '⛽ Gas Station',
    bank: '🏦 Bank',
    atm: '🏧 ATM',
    hotel: '🏨 Hotel',
    motel: '🏨 Motel',
    bus_station: '🚌 Bus Station',
    taxi: '🚕 Taxi Stand',
    cinema: '🎬 Cinema',
    theatre: '🎭 Theater',
    school: '🏫 School',
    university: '🎓 University',
    parking: '🅿️ Parking',
    toilet: '🚻 Toilet',
    park: '🌳 Park',
    museum: '🏛️ Museum',
    church: '⛪ Church',
    mosque: '🕌 Mosque',
    library: '📚 Library',
    gym: '🏋️ Gym',
    shopping: '🛍️ Shopping',
};

function labelForPlace(tags) {
    const amenity = tags.amenity || tags.shop || tags.tourism || tags.leisure || tags.office || '';
    if (PLACE_TYPE_LABELS[amenity]) return PLACE_TYPE_LABELS[amenity];
    return '📍 ' + amenity.charAt(0).toUpperCase() + amenity.slice(1).replace(/_/g, ' ');
}

async function findNearbyPlaces(lat, lng, radiusMeters = 1000) {
    const query = `[out:json];node(around:${radiusMeters},${lat},${lng})["name"];out 50;`;
    const url = `${OVERPASS_BASE}?data=${encodeURIComponent(query)}`;

    const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) {
        throw new Error(`Overpass API HTTP ${res.status}`);
    }
    const data = await res.json();

    if (!data.elements || data.elements.length === 0) return [];

    const places = data.elements
        .map((el) => {
            const distance = haversineDistance(lat, lng, el.lat, el.lon);
            return {
                name: el.tags?.name || 'Unnamed place',
                type: labelForPlace(el.tags || {}),
                lat: el.lat,
                lng: el.lon,
                distance,
            };
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10);

    return places;
}

// ─── OSRM Directions ─────────────────────────────────────────────────

async function getDirections(startLat, startLng, endLat, endLng) {
    const url = `${OSRM_BASE}/${startLng},${startLat};${endLng},${endLat}?overview=full&steps=true`;
    const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) {
        throw new Error(`OSRM API HTTP ${res.status}`);
    }
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    const steps = route.legs?.[0]?.steps || [];

    return {
        distance: route.distance,
        duration: route.duration,
        steps,
    };
}

// ─── Formatters ──────────────────────────────────────────────────────

function formatNearbyResponse(places, lat, lng) {
    if (places.length === 0) {
        return `📍 I couldn't find any named places near your location. Try expanding the search or checking your coordinates.`;
    }

    let msg = `📍 *Places near you*\n`;
    msg += `🌐 ${mapLink(lat, lng)}\n\n`;

    places.forEach((place, i) => {
        msg += `${i + 1}. *${place.name}*\n`;
        msg += `   ${place.type} • ${formatDistance(place.distance)}\n`;
        msg += `   📍 ${mapLink(place.lat, place.lng)}\n`;
    });

    msg += `\n_Tip: Ask "directions to [place name]" for walking directions._`;
    return msg;
}

function formatDirectionsResponse(destination, directions, originLabel) {
    if (!directions) {
        return `❌ I couldn't find a walking route to "${destination}". The locations may be too far apart or inaccessible on foot.`;
    }

    let msg = `🚶 *Directions to ${destination}*\n\n`;
    msg += `📍 From: ${originLabel}\n`;
    msg += `📍 To: ${destination}\n\n`;
    msg += `📏 Distance: ${formatDistance(directions.distance)}\n`;
    msg += `⏱️ Estimated time: ${formatDuration(directions.duration)}\n\n`;

    msg += `*Turn-by-turn:*\n`;
    directions.steps.forEach((step, i) => {
        const instruction = step.maneuver?.type || 'continue';
        const modifier = step.maneuver?.modifier || '';
        const name = step.name && step.name !== '-' ? ` on ${step.name}` : '';
        const stepDist = formatDistance(step.distance || 0);
        msg += `${i + 1}. ${formatManeuver(instruction, modifier)}${name} (${stepDist})\n`;
    });

    return msg.trim();
}

function formatManeuver(type, modifier) {
    const map = {
        depart: '🚀 Start',
        arrive: '🏁 Arrive',
        turn: modifier ? `➡️ Turn ${modifier}` : '➡️ Turn',
        'new name': modifier ? `↗️ Continue ${modifier}` : '↗️ Continue',
        merge: '🔀 Merge',
        'on ramp': '🛣️ Enter ramp',
        'off ramp': '🛣️ Exit ramp',
        fork: modifier ? `🔀 Fork ${modifier}` : '🔀 Fork',
        'end of road': modifier ? `↩️ End of road, turn ${modifier}` : '↩️ End of road',
        continue: modifier ? `⬆️ Continue ${modifier}` : '⬆️ Continue',
        'roundabout': '🔄 Roundabout',
    };
    return map[type] || `➡️ ${type}`;
}

function formatGeocodeResponse(place) {
    const parts = [
        `📍 *${place.name}*`,
        ``,
        `📌 ${place.displayName}`,
        ``,
        `🌐 Coordinates: ${place.lat.toFixed(6)}, ${place.lng.toFixed(6)}`,
        `🔗 View on map: ${mapLink(place.lat, place.lng)}`,
    ];

    const addr = place.address;
    if (addr) {
        const addrParts = [];
        if (addr.road) addrParts.push(addr.road);
        if (addr.city || addr.town || addr.village) addrParts.push(addr.city || addr.town || addr.village);
        if (addr.state) addrParts.push(addr.state);
        if (addr.country) addrParts.push(addr.country);
        if (addrParts.length > 0) {
            parts.splice(2, 0, `🏠 Address: ${addrParts.join(', ')}`);
        }
    }

    return parts.join('\n');
}

// ─── Location Resolution ─────────────────────────────────────────────

function resolveUserLocation(context) {
    if (context?.location?.lat != null && context?.location?.lng != null) {
        return { lat: context.location.lat, lng: context.location.lng };
    }
    if (context?.location?.lat != null && context?.location?.lon != null) {
        return { lat: context.location.lat, lng: context.location.lon };
    }
    return null;
}

// ─── Error Handling ──────────────────────────────────────────────────

function formatError(intent, error) {
    const msg = error.message || 'Unknown error';

    if (msg.includes('429') || msg.includes('Too Many')) {
        return '⏳ Too many location requests. Please wait a moment and try again.';
    }
    if (msg.includes('504') || msg.includes('502') || msg.includes('timeout')) {
        return '⏳ The mapping service is taking too long to respond. Please try again.';
    }

    switch (intent.type) {
        case 'nearby':
            return `⚠️ Couldn't search for nearby places. ${msg}`;
        case 'directions':
            return `⚠️ Couldn't get directions. ${msg}`;
        case 'geocode':
            return `⚠️ Couldn't look up that location. ${msg}`;
        default:
            return `⚠️ Location error: ${msg}`;
    }
}

// ─── Skill Export ────────────────────────────────────────────────────

export default {
    name: 'location',
    description: 'Find nearby places, get directions, and location info',
    triggers: [
        'near me',
        'nearby',
        'directions to',
        'how to get to',
        'where is',
        'locate',
        'find places',
        'map',
        'close to me',
    ],

    async execute(message, context) {
        const intent = detectIntent(message);

        if (!intent) {
            return {
                response:
                    '📍 I can help you with location tasks. Try:\n\n' +
                    '• *"near me"* — find nearby places\n' +
                    '• *"directions to [place]"* — get walking directions\n' +
                    '• *"where is [place]"* — look up a location on the map',
            };
        }

        const userLocation = resolveUserLocation(context);

        // ── NEARBY PLACES ──
        if (intent.type === 'nearby') {
            if (!userLocation) {
                return {
                    response:
                        '📍 I need your location to find nearby places.\n\n' +
                        'Please share your location on WhatsApp (tap the attachment icon 📎 → Location) and try again.',
                };
            }

            try {
                const places = await findNearbyPlaces(userLocation.lat, userLocation.lng);
                return { response: formatNearbyResponse(places, userLocation.lat, userLocation.lng) };
            } catch (error) {
                return { response: formatError(intent, error) };
            }
        }

        // ── DIRECTIONS ──
        if (intent.type === 'directions') {
            if (!intent.query) {
                return {
                    response: '📍 Where would you like directions to? For example: "directions to Nairobi Hospital"',
                };
            }

            if (!userLocation) {
                return {
                    response:
                        '📍 I need your starting location to give directions.\n\n' +
                        'Please share your location on WhatsApp and try again, or say "directions from [start] to [end]".',
                };
            }

            try {
                const destination = await geocode(intent.query);
                if (!destination) {
                    return {
                        response: `❌ I couldn't find "${intent.query}" on the map. Please check the spelling and try again.`,
                    };
                }

                const directions = await getDirections(
                    userLocation.lat,
                    userLocation.lng,
                    destination.lat,
                    destination.lng,
                );

                const originLabel = context?.location?.city || `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`;
                return {
                    response: formatDirectionsResponse(destination.name, directions, originLabel),
                };
            } catch (error) {
                return { response: formatError(intent, error) };
            }
        }

        // ── GEOCODE / LOOKUP ──
        if (intent.type === 'geocode') {
            if (!intent.query) {
                return { response: '📍 What location would you like me to look up?' };
            }

            try {
                const place = await geocode(intent.query);
                if (!place) {
                    return {
                        response: `❌ I couldn't find "${intent.query}" on the map. Please check the spelling and try again.`,
                    };
                }
                return { response: formatGeocodeResponse(place) };
            } catch (error) {
                return { response: formatError(intent, error) };
            }
        }

        return { response: '📍 I\'m not sure what you\'re looking for. Try "near me", "directions to X", or "where is X".' };
    },

    isAvailable() {
        return true;
    },
};
