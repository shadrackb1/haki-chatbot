/**
 * Calculator Skill — math expressions, unit conversions, and currency exchange.
 *
 * No external API required for math and unit conversions.
 * Currency rates fetched from open.er-api.com and cached for 1 hour.
 */

// ---------------------------------------------------------------------------
// Currency rate cache
// ---------------------------------------------------------------------------

let currencyCache = { rates: null, timestamp: 0 };
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const CURRENCY_API = 'https://open.er-api.com/v6/latest/USD';

async function fetchCurrencyRates() {
    const now = Date.now();
    if (currencyCache.rates && now - currencyCache.timestamp < CACHE_TTL_MS) {
        return currencyCache.rates;
    }

    const res = await fetch(CURRENCY_API);
    if (!res.ok) throw new Error(`Currency API responded with ${res.status}`);

    const data = await res.json();
    if (data.result !== 'success') throw new Error('Currency API returned failure');

    currencyCache = { rates: data.rates, timestamp: now };
    return data.rates;
}

// ---------------------------------------------------------------------------
// Unit conversion tables
// ---------------------------------------------------------------------------

const UNIT_CONVERSIONS = {
    // Temperature — special handling needed (non-multiplicative)
    temperature: {
        units: ['c', 'f', 'k', 'celsius', 'fahrenheit', 'kelvin'],
        normalize: (u) => {
            if (u.startsWith('c')) return 'c';
            if (u.startsWith('f')) return 'f';
            if (u.startsWith('k')) return 'k';
            return null;
        },
        convert: (value, from, to) => {
            // Convert to Celsius first
            let celsius;
            switch (from) {
                case 'c': celsius = value; break;
                case 'f': celsius = (value - 32) * 5 / 9; break;
                case 'k': celsius = value - 273.15; break;
                default: return null;
            }
            // Convert from Celsius to target
            switch (to) {
                case 'c': return celsius;
                case 'f': return celsius * 9 / 5 + 32;
                case 'k': return celsius + 273.15;
                default: return null;
            }
        },
        symbol: (u) => {
            const map = { c: '°C', f: '°F', k: 'K' };
            return map[u] ?? u;
        },
    },

    weight: {
        units: ['kg', 'g', 'mg', 'lbs', 'lb', 'oz', 'ton', 'tonne'],
        // All relative to kilograms
        toBase: { kg: 1, g: 0.001, mg: 0.000001, lbs: 0.453592, lb: 0.453592, oz: 0.0283495, ton: 907.185, tonne: 1000 },
        symbol: (u) => {
            const map = { kg: 'kg', g: 'g', mg: 'mg', lbs: 'lbs', lb: 'lb', oz: 'oz', ton: 'tons', tonne: 'tonnes' };
            return map[u] ?? u;
        },
    },

    distance: {
        units: ['km', 'm', 'cm', 'mm', 'mi', 'mile', 'miles', 'ft', 'in', 'inches'],
        toBase: { km: 1000, m: 1, cm: 0.01, mm: 0.001, mi: 1609.344, mile: 1609.344, miles: 1609.344, ft: 0.3048, in: 0.0254, inches: 0.0254 },
        symbol: (u) => {
            const map = { km: 'km', m: 'm', cm: 'cm', mm: 'mm', mi: 'mi', mile: 'mi', miles: 'mi', ft: 'ft', in: 'in', inches: 'in' };
            return map[u] ?? u;
        },
    },

    volume: {
        units: ['l', 'ml', 'gal', 'gallon', 'gallons', 'cup', 'cups', 'fl oz', 'floz', 'tbsp', 'tsp'],
        toBase: { l: 1, ml: 0.001, gal: 3.78541, gallon: 3.78541, gallons: 3.78541, cup: 0.236588, cups: 0.236588, 'fl oz': 0.0295735, floz: 0.0295735, tbsp: 0.0147868, tsp: 0.00492892 },
        symbol: (u) => {
            const map = { l: 'L', ml: 'mL', gal: 'gal', gallon: 'gal', gallons: 'gal', cup: 'cup', cups: 'cups', 'fl oz': 'fl oz', floz: 'fl oz', tbsp: 'tbsp', tsp: 'tsp' };
            return map[u] ?? u;
        },
    },

    data: {
        units: ['kb', 'mb', 'gb', 'tb', 'pb', 'bytes', 'b'],
        toBase: { b: 1, bytes: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4, pb: 1024 ** 5 },
        symbol: (u) => {
            const map = { b: 'B', bytes: 'B', kb: 'KB', mb: 'MB', gb: 'GB', tb: 'TB', pb: 'PB' };
            return map[u] ?? u;
        },
    },

    speed: {
        units: ['kmh', 'km/h', 'mph', 'ms', 'm/s', 'knot', 'knots'],
        toBase: { kmh: 1 / 3.6, 'km/h': 1 / 3.6, mph: 0.44704, ms: 1, 'm/s': 1, knot: 0.514444, knots: 0.514444 },
        symbol: (u) => {
            const map = { kmh: 'km/h', 'km/h': 'km/h', mph: 'mph', ms: 'm/s', 'm/s': 'm/s', knot: 'knots', knots: 'knots' };
            return map[u] ?? u;
        },
    },

    area: {
        units: ['sqm', 'sqkm', 'sqft', 'sqmi', 'acre', 'acres', 'hectare', 'hectares', 'sqin', 'sqyds'],
        toBase: { sqm: 1, sqkm: 1e6, sqft: 0.092903, sqmi: 2.59e6, acre: 4046.86, acres: 4046.86, hectare: 10000, hectares: 10000, sqin: 0.00064516, sqyds: 0.836127 },
        symbol: (u) => {
            const map = { sqm: 'm²', sqkm: 'km²', sqft: 'ft²', sqmi: 'mi²', acre: 'acres', acres: 'acres', hectare: 'ha', hectares: 'ha', sqin: 'in²', sqyds: 'yd²' };
            return map[u] ?? u;
        },
    },
};

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Try to parse a unit conversion request from the message.
 * Returns { value, from, to } or null.
 *
 * Matches patterns like:
 *   "convert 5 kg to lbs"
 *   "5 kg in lbs"
 *   "100 celsius to fahrenheit"
 *   "what is 72 f in c"
 */
function parseUnitConversion(message) {
    const cleaned = message
        .replace(/,/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Patterns (order matters — more specific first)
    const patterns = [
        // "convert <val> <from> to <to>"
        /convert\s+([-\d.]+)\s+(\S+)\s+to\s+(\S+)/i,
        // "<val> <from> in <to>"
        /([-\d.]+)\s+(\S+)\s+in\s+(\S+)/i,
        // "<val> <from> to <to>"
        /([-\d.]+)\s+(\S+)\s+to\s+(\S+)/i,
        // "how much is <val> <from> in <to>"
        /how\s+much\s+is\s+([-\d.]+)\s+(\S+)\s+in\s+(\S+)/i,
        // "what is <val> <from> in <to>"
        /what\s+is\s+([-\d.]+)\s+(\S+)\s+in\s+(\S+)/i,
    ];

    for (const pattern of patterns) {
        const match = cleaned.match(pattern);
        if (match) {
            return {
                value: parseFloat(match[1]),
                from: match[2].toLowerCase(),
                to: match[3].toLowerCase(),
            };
        }
    }

    return null;
}

/**
 * Try to parse a currency conversion request.
 * Returns { value, from, to } or null.
 *
 * Matches patterns like:
 *   "100 USD to KES"
 *   "convert 50 usd to eur"
 *   "how much is 1000 kes in usd"
 */
function parseCurrencyConversion(message) {
    const cleaned = message
        .replace(/,/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const CURRENCY_CODES = new Set([
        'usd', 'eur', 'gbp', 'kes', 'ugx', 'tzs', 'ngn', 'zar', 'ghs', 'egp',
        'jpy', 'cny', 'inr', 'cad', 'aud', 'chf', 'sek', 'nok', 'dkk', 'pln',
        'brl', 'mxn', 'ars', 'clp', 'cop', 'pen', 'idr', 'myr', 'php', 'sgd',
        'hkd', 'thb', 'vnd', 'krw', 'aed', 'sar', 'qar', 'bhd', 'kwd', 'omr',
        'jod', 'lbp', 'pkr', 'bdt', 'lkr', 'npr', 'mmk', 'khr', 'lak', 'mnt',
        'rub', 'try', 'huf', 'czk', 'ron', 'bgn', 'hrk', 'rsd', 'uah', 'kzt',
        'uzs', 'azn', 'gel', 'amd', 'byn', 'mdl', 'isk', 'all', 'mkd', 'bam',
        'xcd', 'bsd', 'crc', 'gtq', 'hnl', 'nio', 'pab', 'pyg', 'uyu', 'ves',
        'djf', 'etb', 'gmd', 'kes', 'mga', 'mru', 'mwk', 'mzn', 'rwf', 'sc',
        'scr', 'sdg', 'sll', 'sos', 'ssp', 'stn', 'szl', 'ttd', 'btn', 'fjd',
        'pgk', 'wst', 'top', 'vuv', 'xaf', 'xof', 'xpf', 'cad', 'bsd',
    ]);

    const patterns = [
        // "convert <val> <from> to <to>"
        /convert\s+([-\d.]+)\s+(\S+)\s+to\s+(\S+)/i,
        // "<val> <from> to <to>"
        /([-\d.]+)\s+(\S+)\s+to\s+(\S+)/i,
        // "how much is <val> <from> in <to>"
        /how\s+much\s+is\s+([-\d.]+)\s+(\S+)\s+(?:in|to)\s+(\S+)/i,
        // "what is <val> <from> in <to>"
        /what\s+is\s+([-\d.]+)\s+(\S+)\s+(?:in|to)\s+(\S+)/i,
    ];

    for (const pattern of patterns) {
        const match = cleaned.match(pattern);
        if (match) {
            const from = match[2].toUpperCase();
            const to = match[3].toUpperCase();

            // Only accept known 3-letter currency codes
            if (CURRENCY_CODES.has(from.toLowerCase()) && CURRENCY_CODES.has(to.toLowerCase())) {
                return {
                    value: parseFloat(match[1]),
                    from,
                    to,
                };
            }
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// Math evaluation (sandboxed)
// ---------------------------------------------------------------------------

/**
 * Allowed identifiers that can be referenced inside the eval expression.
 */
const SAFE_MATH_CONTEXT = {
    PI: Math.PI,
    E: Math.E,
    abs: Math.abs,
    ceil: Math.ceil,
    floor: Math.floor,
    round: Math.round,
    trunc: Math.trunc,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    pow: Math.pow,
    log: Math.log,
    log2: Math.log2,
    log10: Math.log10,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    min: Math.min,
    max: Math.max,
    sign: Math.sign,
    random: Math.random,
    hypot: Math.hypot,
};

// Check whether a string contains only safe math characters.
// Allowed: digits, operators (+-*/%), parentheses, decimal, spaces,
//          commas (for function args), dots, and valid identifier chars.
function isSafeMathExpression(expr) {
    // Strip out known safe function names and constants, then verify
    // only safe characters remain.
    let stripped = expr;

    // Remove known identifiers (functions/constants)
    stripped = stripped.replace(/\b(PI|E|abs|ceil|floor|round|trunc|sqrt|cbrt|pow|log|log2|log10|sin|cos|tan|asin|acos|atan|atan2|min|max|sign|random|hypot)\b/g, '');

    // Remove everything that isn't a math character
    stripped = stripped.replace(/[\d+\-*/%().,\s^]/g, '');

    // If anything remains, it's an unknown identifier — reject
    return stripped.length === 0;
}

/**
 * Safely evaluate a math expression string.
 * Returns { result: number } or { error: string }.
 */
function evaluateMathExpression(expr) {
    // Normalize common notations
    let normalized = expr
        .replace(/\^/g, '**')          // caret → exponentiation
        .replace(/×/g, '*')            // unicode multiply
        .replace(/÷/g, '/')            // unicode divide
        .replace(/x/g, '*')            // "x" as multiply (careful — only standalone)
        .replace(/\b(\d+)\s*x\s*(\d+)\b/gi, '$1*$2')  // "5 x 3" → "5*3"
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) {
        return { error: 'Empty expression' };
    }

    if (!isSafeMathExpression(normalized)) {
        return { error: 'Expression contains disallowed characters' };
    }

    try {
        const keys = Object.keys(SAFE_MATH_CONTEXT);
        const values = Object.values(SAFE_MATH_CONTEXT);
        const fn = new Function(...keys, `"use strict"; return (${normalized});`);
        const result = fn(...values);

        if (typeof result !== 'number' || !isFinite(result)) {
            return { error: 'Result is not a finite number' };
        }

        return { result };
    } catch (err) {
        return { error: `Invalid math expression: ${err.message}` };
    }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a number for display — strip unnecessary trailing zeros but keep
 * reasonable precision.
 */
function formatNumber(n) {
    if (Number.isInteger(n)) return n.toLocaleString('en-US');

    // Round to 8 significant figures to avoid floating-point noise
    const rounded = parseFloat(n.toPrecision(8));
    return rounded.toLocaleString('en-US');
}

/**
 * Determine the best currency display label from a code.
 */
function currencyLabel(code) {
    const labels = {
        USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound',
        KES: 'Kenyan Shilling', UGX: 'Ugandan Shilling',
        TZS: 'Tanzanian Shilling', NGN: 'Nigerian Naira',
        ZAR: 'South African Rand', GHS: 'Ghanaian Cedi',
        JPY: 'Japanese Yen', CNY: 'Chinese Yuan',
        INR: 'Indian Rupee', CAD: 'Canadian Dollar',
        AUD: 'Australian Dollar', CHF: 'Swiss Franc',
    };
    return labels[code] ?? code;
}

// ---------------------------------------------------------------------------
// Main skill export
// ---------------------------------------------------------------------------

export default {
    name: 'calculator',
    description: 'Math expressions, unit conversions, and currency conversion',
    triggers: [
        'calculate', 'math', 'convert', 'how much is', 'what is',
        'solve', 'equation', 'currency', 'exchange rate',
    ],

    /**
     * @param {string} message — incoming WhatsApp message text
     * @param {object} context — chat context (may contain user info, etc.)
     * @returns {Promise<{ response: string, metadata?: object }>}
     */
    async execute(message, context) {
        const raw = (message || '').trim();
        if (!raw) {
            return { response: 'Please provide a math expression, unit conversion, or currency query to calculate.' };
        }

        // --- 1. Currency conversion ---
        const currency = parseCurrencyConversion(raw);
        if (currency) {
            try {
                const rates = await fetchCurrencyRates();
                const fromRate = rates[currency.from];
                const toRate = rates[currency.to];

                if (!fromRate || !toRate) {
                    return {
                        response: `I don't recognise one of those currencies. Try common codes like USD, EUR, KES, GBP, JPY, etc.`,
                    };
                }

                // Convert: amount in fromCurrency → USD → toCurrency
                const inUSD = currency.value / fromRate;
                const result = inUSD * toRate;

                return {
                    response: `${formatNumber(currency.value)} ${currency.from} = ${formatNumber(result)} ${currency.to}\n\n(${currencyLabel(currency.from)} → ${currencyLabel(currency.to)})`,
                    metadata: {
                        type: 'currency',
                        from: currency.from,
                        to: currency.to,
                        input: currency.value,
                        output: result,
                        rate: toRate / fromRate,
                    },
                };
            } catch (err) {
                return {
                    response: `I couldn't fetch the latest exchange rates right now. Please try again in a moment.`,
                    metadata: { type: 'currency', error: err.message },
                };
            }
        }

        // --- 2. Unit conversion ---
        const unit = parseUnitConversion(raw);
        if (unit) {
            // Find which conversion table this pair belongs to
            for (const [, table] of Object.entries(UNIT_CONVERSIONS)) {
                const fromKey = table.normalize ? table.normalize(unit.from) : unit.from;
                const toKey = table.normalize ? table.normalize(unit.to) : unit.to;

                if (!fromKey || !toKey) continue;
                if (!table.toBase && !table.convert) continue;

                let result;
                if (table.convert) {
                    // Special converter (temperature)
                    result = table.convert(unit.value, fromKey, toKey);
                } else if (table.toBase[fromKey] && table.toBase[toKey]) {
                    const baseValue = unit.value * table.toBase[fromKey];
                    result = baseValue / table.toBase[toKey];
                }

                if (result !== null && result !== undefined) {
                    const fromSymbol = table.symbol(fromKey);
                    const toSymbol = table.symbol(toKey);
                    return {
                        response: `${formatNumber(unit.value)} ${fromSymbol} = ${formatNumber(result)} ${toSymbol}`,
                        metadata: {
                            type: 'unit_conversion',
                            from: fromKey,
                            to: toKey,
                            input: unit.value,
                            output: result,
                        },
                    };
                }
            }

            return {
                response: `I couldn't find a conversion between "${unit.from}" and "${unit.to}". Supported units include temperature (C/F/K), weight (kg/lb/g/oz), distance (km/mi/m/ft), volume (L/mL/gal/cup), data (KB/MB/GB/TB), and speed (km/h/mph).`,
            };
        }

        // --- 3. Pure math expression ---
        // Strip common prefixes that trigger matching but aren't part of the math
        const mathInput = raw
            .replace(/^(calculate|math|solve|what is|compute|evaluate)\s*/i, '')
            .trim();

        // Quick sanity: must contain at least one digit and one operator/function
        const hasDigit = /\d/.test(mathInput);
        const hasOperator = /[+\-*/%^÷×]|sqrt|pow|log|sin|cos|tan|abs|ceil|floor|min|max|PI|E/i.test(mathInput);

        if (hasDigit && hasOperator) {
            const evalResult = evaluateMathExpression(mathInput);

            if (evalResult.error) {
                return { response: `I couldn't understand that math expression. Try something like "2 + 3 * 4" or "sqrt(144)".` };
            }

            return {
                response: `${mathInput.replace(/\s+/g, ' ')} = ${formatNumber(evalResult.result)}`,
                metadata: {
                    type: 'math',
                    expression: mathInput,
                    result: evalResult.result,
                },
            };
        }

        // --- 4. No pattern matched ---
        return {
            response: `I can help with:\n• Math: "2 + 3 * 4", "sqrt(144)", "sin(PI/2)"\n• Conversions: "5 kg to lbs", "100 F to C"\n• Currency: "100 USD to KES", "50 EUR in GBP"`,
        };
    },

    isAvailable() {
        return true;
    },
};
