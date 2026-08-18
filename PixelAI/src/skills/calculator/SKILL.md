# Calculator Skill

## What it does

Handles math expressions, unit conversions, and currency exchange queries from WhatsApp users. No external API key is required for math or unit conversions. Currency rates are fetched from a free API and cached for 1 hour.

**Capabilities:**

- **Math expressions** — basic arithmetic, exponents (`^`), and common math functions (`sqrt`, `log`, `sin`, `cos`, `pow`, `abs`, `ceil`, `floor`, `min`, `max`, etc.)
- **Unit conversions** — temperature, weight, distance, volume, data, speed, and area
- **Currency conversion** — 160+ currencies via open.er-api.com with automatic caching

## Triggers

| Trigger | Example message |
|---------|----------------|
| `calculate` | "calculate 15% of 240" |
| `math` | "math: 2^10" |
| `solve` | "solve 3x + 5 = 20" |
| `equation` | "what is the equation for..." |
| `convert` | "convert 100 kg to lbs" |
| `how much is` | "how much is 50 USD in KES" |
| `what is` | "what is 72 F in C" |
| `currency` | "currency conversion 100 EUR to GBP" |
| `exchange rate` | "exchange rate USD to KES" |

## Examples

### Math

| User sends | Bot responds |
|------------|--------------|
| `calculate 2 + 3 * 4` | `2 + 3 * 4 = 14` |
| `sqrt(144)` | `sqrt(144) = 12` |
| `2^10` | `2^10 = 1,024` |
| `sin(PI/2)` | `sin(PI/2) = 1` |
| `log(100)` | `log(100) = 4.60517` |
| `min(10, 5, 8)` | `min(10, 5, 8) = 5` |

### Unit conversions

| User sends | Bot responds |
|------------|--------------|
| `convert 100 kg to lbs` | `100 kg = 220.462 lbs` |
| `5 km in miles` | `5 km = 3.10686 mi` |
| `72 F in C` | `72 °F = 22.2222 °C` |
| `1.5 L to gal` | `1.5 L = 0.396258 gal` |
| `500 MB to GB` | `500 MB = 0.488281 GB` |
| `100 kmh to mph` | `100 km/h = 62.1371 mph` |

**Supported unit categories:**

| Category | Units |
|----------|-------|
| Temperature | °C, °F, K |
| Weight | kg, g, mg, lbs, lb, oz, tons, tonnes |
| Distance | km, m, cm, mm, mi, miles, ft, in |
| Volume | L, mL, gal, cups, fl oz, tbsp, tsp |
| Data | KB, MB, GB, TB, PB, bytes |
| Speed | km/h, mph, m/s, knots |
| Area | m², km², ft², mi², acres, hectares, in², yd² |

### Currency

| User sends | Bot responds |
|------------|--------------|
| `100 USD to KES` | `100 USD = 15,400 KES (US Dollar → Kenyan Shilling)` |
| `50 EUR in GBP` | `50 EUR = 43.12 GBP (Euro → British Pound)` |
| `convert 1000 JPY to USD` | `1,000 JPY = 6.67 USD (Japanese Yen → US Dollar)` |

**Supported currencies:** USD, EUR, GBP, KES, UGX, TZS, NGN, ZAR, GHS, JPY, CNY, INR, CAD, AUD, CHF, and 140+ more.

## API Requirements

| Service | Required | Details |
|---------|----------|---------|
| Math evaluation | No | Local sandboxed `Function()` evaluation |
| Unit conversions | No | Built-in conversion tables |
| Currency rates | Yes (free) | `https://open.er-api.com/v6/latest/USD` — no API key needed, rates cached for 1 hour |

**No paid API keys or external services are required for core functionality.** Currency rates are fetched from a free, public API with no rate limits for reasonable usage.

## Security

- Math expressions are evaluated with a strict allowlist of characters (digits, operators, parentheses, and whitelisted `Math.*` functions)
- No `eval()` — uses `new Function()` with explicit parameter injection
- Dangerous patterns (variable access, `this`, prototype pollution) are blocked by the character allowlist
- Currency data is fetched over HTTPS only
