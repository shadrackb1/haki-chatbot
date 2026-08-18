# Location Skill

Find nearby places, get walking directions, and look up any location — powered entirely by free OpenStreetMap APIs. No API key required.

## Overview

| Property     | Value                                                                                  |
| ------------ | -------------------------------------------------------------------------------------- |
| **Name**     | `location`                                                                             |
| **Triggers** | near me, nearby, directions to, how to get to, where is, locate, find places, map, close to me |
| **APIs**     | Nominatim (geocoding), Overpass (places), OSRM (routing)                              |
| **Requires** | Nothing — all APIs are free with no key                                               |

## Examples

| User message                          | Intent      | Response                                    |
| ------------------------------------- | ----------- | ------------------------------------------- |
| `near me`                             | Nearby      | Top 10 named places within 1 km            |
| `what's around here`                  | Nearby      | Top 10 named places within 1 km            |
| `find restaurants near me`            | Nearby      | Top 10 named places within 1 km            |
| `directions to Nairobi Hospital`      | Directions  | Walking route with distance, time, steps   |
| `how do I get to the city centre`     | Directions  | Walking route with distance, time, steps   |
| `take me to JKIA`                     | Directions  | Walking route with distance, time, steps   |
| `where is Times Square`               | Geocode     | Name, address, coordinates, map link       |
| `locate Mombasa`                      | Geocode     | Name, address, coordinates, map link       |
| `find me the address of State House`  | Geocode     | Name, address, coordinates, map link       |
| `near me` (no location shared)        | Nearby      | Prompts user to share location              |

## APIs Used

All three APIs are free and require no API keys:

| API        | Purpose                 | Endpoint                                                | Rate Limit         |
| ---------- | ----------------------- | ------------------------------------------------------- | ------------------ |
| **Nominatim** | Geocoding / reverse geocoding | `nominatim.openstreetmap.org/search`                | 1 request/second   |
| **Overpass**   | Nearby POI search       | `overpass-api.de/api/interpreter`                        | Generous (free)    |
| **OSRM**       | Foot routing            | `router.project-osrm.org/route/v1/foot`                 | Free public instance |

The skill enforces a 1.1-second delay between Nominatim requests to comply with the rate limit.

## How It Works

### Nearby Places

1. Takes user's coordinates from `context.location`
2. Queries Overpass for named nodes within a 1 km radius
3. Sorts by distance, returns top 10
4. Each result includes: name, type (emoji-labeled), distance, map link

### Directions

1. Geocodes the destination via Nominatim
2. Routes from user's location to destination via OSRM (foot profile)
3. Returns: total distance, estimated walking time, turn-by-turn instructions
4. Maneuvers are emoji-formatted (turn left ➡️, roundabout 🔄, arrive 🏁)

### Geocoding ("where is X")

1. Queries Nominatim with the place name
2. Returns: name, full display name, address components, coordinates, Google Maps link

## Response Formats

### Nearby Places

```
📍 *Places near you*
🌐 https://www.google.com/maps?q=-1.2863,36.8172

1. *Java House*
   ☕ Cafe • 120 m
   📍 https://www.google.com/maps?q=-1.2864,36.8173

2. *Nairobi Hospital*
   🏥 Hospital • 340 m
   📍 https://www.google.com/maps?q=-1.2890,36.8120
```

### Directions

```
🚶 *Directions to Nairobi Hospital*

📍 From: Nairobi
📍 To: Nairobi Hospital

📏 Distance: 2.4 km
⏱️ Estimated time: 30 min

*Turn-by-turn:*
1. 🚀 Start on Kenyatta Avenue (200 m)
2. ➡️ Turn right on Moi Avenue (350 m)
3. ↗️ Continue on Hospital Road (500 m)
4. 🏁 Arrive at Nairobi Hospital (0 m)
```

### Geocode

```
📍 *Times Square*

📌 Times Square, Manhattan, New York, NY 10036, United States

🏠 Address: Broadway, New York, New York, United States

🌐 Coordinates: 40.758000, -73.985500
🔗 View on map: https://www.google.com/maps?q=40.758000,-73.985500
```

## Context Location

The skill reads user coordinates from `context.location`:

```js
{
  lat: -1.2863,   // Latitude
  lng: 36.8172,   // Longitude (or 'lon')
  city: 'Nairobi' // Optional city label
}
```

If no location is available, the user is prompted to share their location via WhatsApp's attachment menu (📎 → Location).

## Error Handling

| Error                   | Response                                                       |
| ----------------------- | -------------------------------------------------------------- |
| No user location        | "I need your location. Please share it on WhatsApp..."        |
| Place not found         | "I couldn't find [place]. Check the spelling..."              |
| No nearby places        | "I couldn't find named places near your location..."          |
| Route not found         | "I couldn't find a walking route..."                          |
| Nominatim rate limit    | "Too many location requests. Please wait..."                  |
| API timeout             | "The mapping service is taking too long..."                   |
| Unknown intent          | Shows help with example commands                               |

## File Structure

```
src/skills/location/
├── index.js      # Skill implementation
└── SKILL.md      # This documentation
```
