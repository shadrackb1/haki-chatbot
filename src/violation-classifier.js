import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load legal knowledge base once
const legalKB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'legal-knowledge-base.json'), 'utf8'));

export function tokenizeText(text) {
  // Convert to lowercase and split by non-alphanumeric characters
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}

// Workers write "wages", "injured", "evicted" — the KB stores "wage",
// "injure", "evict". Generate morphological variants so inflected forms
// still match instead of scoring zero.
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

// TF-IDF-like relevance score between a free-text query and a KB category.
export function calculateRelevanceScore(query, category) {
  const queryTokens = tokenizeText(query);
  if (queryTokens.length === 0) return 0;

  // Get all keywords for this category
  const allKeywords = [
    ...category.keywords_sw,
    ...category.keywords_en,
    ...Object.values(category.keywords_local || {}).flat()
  ].map(keyword => keyword.toLowerCase());

  // Calculate score based on keyword matches
  let score = 0;
  queryTokens.forEach(token => {
    const matches = tokenVariants(token).some(v => allKeywords.includes(v));
    if (matches) {
      // Basic match score
      score += 1;

      // Bonus for exact phrase matches (if query has multiple words)
      if (queryTokens.length > 1) {
        // Check for bigrams
        for (let i = 0; i < queryTokens.length - 1; i++) {
          const bigram = queryTokens.slice(i, i + 2).join(' ');
          if (allKeywords.includes(bigram)) {
            score += 0.5; // Bonus for phrase match
          }
        }
      }
    }
  });

  // Normalize by query length to prevent longer queries from always scoring higher
  return score / Math.sqrt(queryTokens.length);
}

// Enhanced violation classification: pick the best-scoring category above threshold
export function classifyViolation(text) {
  const lower = text.toLowerCase();
  const violations = [];

  for (const category of legalKB.violation_categories) {
    const score = calculateRelevanceScore(lower, category);

    if (score > 0) {
      violations.push({
        id: category.id,
        score: score,
        data: category
      });
    }
  }

  // Sort by score descending
  violations.sort((a, b) => b.score - a.score);

  // Return the best match if score is above threshold
  const bestMatch = violations.length > 0 ? violations[0] : null;
  return bestMatch && bestMatch.score > 0.3 ? bestMatch : null; // Threshold for relevance
}

export default classifyViolation;
