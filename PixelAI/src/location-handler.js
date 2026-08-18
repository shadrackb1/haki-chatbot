import https from "https";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const OVERPASS_BASE = "https://overpass-api.de/api/interpreter";

const CATEGORY_ICONS = {
  hospital: "🏥",
  clinic: "🏥",
  pharmacy: "💊",
  doctor: "⚕️",
  school: "🏫",
  university: "🎓",
  restaurant: "🍽️",
  cafe: "☕",
  bar: "🍸",
  supermarket: "🛒",
  shop: "🛍️",
  market: "🏪",
  bank: "🏦",
  atm: "🏧",
  hotel: "🏨",
  motel: "🏨",
  gas_station: "⛽",
  parking: "🅿️",
  bus_station: "🚌",
  railway_station: "🚉",
  airport: "✈️",
  park: "🌳",
  playground: "🎠",
  cinema: "🎬",
  theatre: "🎭",
  church: "⛪",
  mosque: "🕌",
  temple: "🛕",
  police: "👮",
  fire_station: "🚒",
  post_office: "📮",
  library: "📚",
  gym: "💪",
  salon: "💇",
  dentist: "🦷",
  default: "📍",
};

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout: 15000 }, (res) => {
      if (res.statusCode === 429) {
        return reject(new Error("RATE_LIMITED"));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("TIMEOUT"));
    });
  });
}

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
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function getCategoryIcon(category) {
  if (!category) return CATEGORY_ICONS.default;
  const lower = category.toLowerCase();
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return CATEGORY_ICONS.default;
}

function interpolateUrl(url) {
  return encodeURI(url);
}

export class LocationHandler {
  constructor() {
    this._lastRequestTime = 0;
    this._MIN_INTERVAL_MS = 1100;
  }

  async _waitForRateLimit() {
    const now = Date.now();
    const elapsed = now - this._lastRequestTime;
    if (elapsed < this._MIN_INTERVAL_MS) {
      await new Promise((r) =>
        setTimeout(r, this._MIN_INTERVAL_MS - elapsed)
      );
    }
    this._lastRequestTime = Date.now();
  }

  async processLocation(locationMessage, context = {}) {
    const lat =
      locationMessage.degreesLatitude ??
      locationMessage.lat ??
      locationMessage.latitude;
    const lng =
      locationMessage.degreesLongitude ??
      locationMessage.lng ??
      locationMessage.longitude;

    if (lat == null || lng == null) {
      return {
        success: false,
        text: "⚠️ Could not read coordinates from the shared location.",
      };
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return {
        success: false,
        text: "⚠️ Invalid coordinates received.",
      };
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return {
        success: false,
        text: "⚠️ Coordinates are out of valid range.",
      };
    }

    try {
      const [geocode, nearby] = await Promise.all([
        this.reverseGeocode(latitude, longitude).catch(() => null),
        this.findNearby(latitude, longitude).catch(() => []),
      ]);

      const text = this.formatLocationResponse(geocode, nearby, latitude, longitude);

      return { success: true, text, geocode, nearby, latitude, longitude };
    } catch (err) {
      return {
        success: false,
        text: "⚠️ Failed to process location. Please try again.",
        error: err.message,
      };
    }
  }

  async reverseGeocode(lat, lng) {
    await this._waitForRateLimit();

    const url = interpolateUrl(
      `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18`
    );

    const body = await httpsGet(url, {
      "User-Agent": "PixelAI/1.0 (contact@pixel-bot)",
      Accept: "application/json",
    });

    const data = JSON.parse(body);

    if (!data || data.error) {
      throw new Error(data?.error || "No results from reverse geocoding");
    }

    return {
      displayName: data.display_name || "Unknown location",
      address: data.address || {},
      type: data.type || data.class || "unknown",
    };
  }

  async findNearby(lat, lng, radius = 1000, category = null) {
    let filter = "";
    if (category) {
      filter = `["amenity"="${category}"]`;
    }

    const query = `[out:json][timeout:10];node(around:${radius},${lat},${lng})${filter}["name"];out body;`;

    const encoded = encodeURIComponent(query);
    const url = `${OVERPASS_BASE}?data=${encoded}`;

    const body = await httpsGet(url, {
      "User-Agent": "PixelAI/1.0 (contact@pixel-bot)",
      Accept: "application/json",
    });

    const data = JSON.parse(body);

    if (!data || !data.elements || data.elements.length === 0) {
      return [];
    }

    const places = data.elements.map((el) => {
      const distance = haversineDistance(lat, lng, el.lat, el.lon);
      const amenity = el.tags?.amenity || el.tags?.shop || el.tags?.tourism || el.tags?.leisure || "";
      return {
        name: el.tags?.name || "Unnamed place",
        type: amenity,
        distance,
        lat: el.lat,
        lng: el.lon,
        icon: getCategoryIcon(amenity),
      };
    });

    places.sort((a, b) => a.distance - b.distance);

    return places.slice(0, 10);
  }

  async geocode(query) {
    await this._waitForRateLimit();

    const url = interpolateUrl(
      `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=1`
    );

    const body = await httpsGet(url, {
      "User-Agent": "PixelAI/1.0 (contact@pixel-bot)",
      Accept: "application/json",
    });

    const data = JSON.parse(body);

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`No results found for "${query}"`);
    }

    const result = data[0];

    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      displayName: result.display_name || query,
    };
  }

  formatDistance(lat1, lng1, lat2, lng2) {
    return formatDistance(haversineDistance(lat1, lng1, lat2, lng2));
  }

  formatLocationResponse(geocode, nearby = [], lat, lng) {
    const address = geocode?.displayName || "Location received";
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

    let response = `📍 *Location:* ${address}\n`;

    if (nearby.length > 0) {
      response += "\n*Nearby places:*\n";
      for (const place of nearby) {
        const dist = formatDistance(place.distance);
        response += `${place.icon} *${place.name}* - ${dist}\n`;
      }
    } else {
      response += "\n_No notable places found nearby._\n";
    }

    response += `\n🗺️ [View on Maps](${mapsUrl})`;

    return response;
  }
}

export default LocationHandler;
