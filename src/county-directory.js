// County labour-office / DOSHS officer directory lookup.
// Reads data/county-labour-offices.json (official ministry Sept 2022 list).
// Pure, synchronous, zero deps — matches case-insensitively and tolerates
// small spelling variants (Muranga/Murang'a, Taita Taveta/Taita-Taveta).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR_PATH = path.join(__dirname, '..', 'data', 'county-labour-offices.json');

function normalizeCounty(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const index = (() => {
  try {
    const data = JSON.parse(fs.readFileSync(DIR_PATH, 'utf8'));
    const map = new Map();
    for (const c of data.counties || []) {
      map.set(normalizeCounty(c.county), c);
      map.set(normalizeCounty(c.officer), c);
    }
    return { map, meta: data._meta || {} };
  } catch (err) {
    console.error(`[county-directory] failed to load: ${err.message}`);
    return { map: new Map(), meta: {} };
  }
})();

export function findCountyOffice(county) {
  const key = normalizeCounty(county);
  if (!key) return null;
  return index.map.get(key) || null;
}

export function lookupCounty(county) {
  return findCountyOffice(county);
}

export function equippedCountyMessage(county) {
  const off = findCountyOffice(county);
  if (!off) return '';
  return [
    `📍 Your county labour office (${off.county}): ${off.officer} — ${off.office_location}.`,
    off.mobile && `📞 ${off.mobile}${off.tel && off.mobile !== off.tel ? ` / ${off.tel}` : ''}`,
    off.email && `✉️ ${off.email}`
  ].filter(Boolean).join('\n');
}

export function countyMeta() {
  return index.meta;
}

export default findCountyOffice;