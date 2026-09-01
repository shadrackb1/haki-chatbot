// Violation classification: TF-IDF-like scoring of free text against
// legal-knowledge-base.json categories, with morphological token variants.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kb = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'data', 'legal', 'legal-knowledge-base.json'), 'utf8')
);

export function tokenizeText(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}

// Workers write "wages", "injured", "evicted" — the KB stores "wage",
// "injure", "evict". Generate morphological variants so inflected forms match.
export function tokenVariants(token) {
  const variants = new Set([token]);
  if (token.length > 3) {
    if (token.endsWith('ies')) variants.add(token.slice(0, -3) + 'y');
    if (token.endsWith('es')) variants.add(token.slice(0, -2));
    if (token.endsWith('s')) variants.add(token.slice(0, -1));
    if (token.endsWith('ing')) {
      variants.add(token.slice(0, -3));
      variants.add(token.slice(0, -3) + 'e');
    }
    if (token.endsWith('ed')) {
      variants.add(token.slice(0, -2));
      variants.add(token.slice(0, -1));
    }
  }
  return [...variants];
}

export function calculateRelevanceScore(query, category) {
  const queryTokens = tokenizeText(query);
  if (queryTokens.length === 0) return 0;

  const allKeywords = [
    ...category.keywords_sw,
    ...category.keywords_en,
    ...Object.values(category.keywords_local || {}).flat(),
  ].map((keyword) => keyword.toLowerCase());

  let score = 0;
  queryTokens.forEach((token) => {
    const matches = tokenVariants(token).some((v) => allKeywords.includes(v));
    if (matches) {
      score += 1;
      if (queryTokens.length > 1) {
        for (let i = 0; i < queryTokens.length - 1; i++) {
          const bigram = queryTokens.slice(i, i + 2).join(' ');
          if (allKeywords.includes(bigram)) {
            score += 0.5;
          }
        }
      }
    }
  });

  return score / Math.sqrt(queryTokens.length);
}

export function classifyViolation(text) {
  const lower = text.toLowerCase();
  const violations = [];

  for (const category of kb.violation_categories) {
    const score = calculateRelevanceScore(lower, category);
    if (score > 0) {
      violations.push({ id: category.id, score, data: category });
    }
  }

  violations.sort((a, b) => b.score - a.score);

  const bestMatch = violations.length > 0 ? violations[0] : null;
  return bestMatch && bestMatch.score > 0.3 ? bestMatch : null;
}

export default classifyViolation;
