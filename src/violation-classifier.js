import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const legalKB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'legal-knowledge-base.json'), 'utf8'));
const localLangs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'local-languages.json'), 'utf8'));

const allViolationKeywords = localLangs.violation_keywords_multilingual || {};

export function tokenizeText(text) {
  return text.toLowerCase().match(/[a-z0-9\u00C0-\u024F]+/g) || [];
}

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
    if (token.endsWith('a')) variants.add(token.slice(0, -1));
    if (token.endsWith('o')) variants.add(token.slice(0, -1));
    if (token.endsWith('u')) variants.add(token.slice(0, -1));
    if (token.endsWith('i')) variants.add(token.slice(0, -1));
  }
  return [...variants];
}

function getKeywordsForCategory(categoryId) {
  const keywords = [];

  const category = legalKB.violation_categories.find(c => c.id === categoryId);
  if (category) {
    keywords.push(...(category.keywords_sw || []).map(k => k.toLowerCase()));
    keywords.push(...(category.keywords_en || []).map(k => k.toLowerCase()));
    Object.values(category.keywords_local || {}).forEach(langKeywords => {
      keywords.push(...langKeywords.map(k => k.toLowerCase()));
    });
  }

  if (allViolationKeywords[categoryId]) {
    Object.values(allViolationKeywords[categoryId]).forEach(langKeywords => {
      keywords.push(...langKeywords.map(k => k.toLowerCase()));
    });
  }

  return [...new Set(keywords)];
}

export function calculateRelevanceScore(query, category) {
  const queryTokens = tokenizeText(query);
  if (queryTokens.length === 0) return 0;

  let allKeywords;
  if (category && typeof category.id === 'string') {
    allKeywords = getKeywordsForCategory(category.id);
  } else if (category) {
    allKeywords = [
      ...((category.keywords_sw || []).map(k => k.toLowerCase())),
      ...((category.keywords_en || []).map(k => k.toLowerCase())),
      ...Object.values(category.keywords_local || {}).flatMap(langKeywords =>
        langKeywords.map(k => k.toLowerCase())
      )
    ];
  } else {
    allKeywords = [];
  }
  allKeywords = [...new Set(allKeywords)];

  let score = 0;
  let matchCount = 0;

  queryTokens.forEach(token => {
    const variants = tokenVariants(token);
    const matched = variants.some(v => allKeywords.includes(v));
    if (matched) {
      score += 1;
      matchCount++;
    }
  });

  if (queryTokens.length > 1) {
    for (let i = 0; i < queryTokens.length - 1; i++) {
      const bigram = queryTokens.slice(i, i + 2).join(' ');
      if (allKeywords.includes(bigram)) {
        score += 1;
      }
    }
  }

  const coverageBonus = matchCount > 1 ? matchCount * 0.3 : 0;
  score += coverageBonus;

  return score / Math.sqrt(queryTokens.length);
}

export function detectLanguage(text) {
  const lower = text.toLowerCase();
  const langScores = {};

  Object.entries(allViolationKeywords).forEach(([violationType, languages]) => {
    Object.entries(languages).forEach(([langCode, keywords]) => {
      if (!langScores[langCode]) langScores[langCode] = 0;
      keywords.forEach(kw => {
        if (lower.includes(kw.toLowerCase())) {
          langScores[langCode] += 1;
        }
      });
    });
  });

  const knownLangs = Object.keys(localLangs.languages || {});
  knownLangs.forEach(code => {
    const langData = localLangs.languages[code];
    if (langData?.work_keywords) {
      if (!langScores[code]) langScores[code] = 0;
      langData.work_keywords.forEach(kw => {
        if (lower.includes(kw.toLowerCase())) {
          langScores[code] += 0.5;
        }
      });
    }
    if (langData?.greetings) {
      Object.values(langData.greetings).forEach(g => {
        if (lower.startsWith(g.toLowerCase())) {
          langScores[code] = (langScores[code] || 0) + 3;
        }
      });
    }
  });

  let bestLang = 'en';
  let bestScore = 0;
  Object.entries(langScores).forEach(([lang, score]) => {
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  });

  return bestScore > 0 ? bestLang : 'en';
}

export function classifyViolation(text) {
  const lower = text.toLowerCase();
  const violations = [];
  const detectedLang = detectLanguage(lower);

  for (const category of legalKB.violation_categories) {
    const score = calculateRelevanceScore(lower, category);

    if (score > 0) {
      const multilingualKeywords = allViolationKeywords[category.id] || {};
      const langKeywords = multilingualKeywords[detectedLang] || [];

      violations.push({
        id: category.id,
        score: score,
        data: category,
        detectedLanguage: detectedLang,
        matchedLangKeywords: langKeywords.filter(kw => lower.includes(kw.toLowerCase()))
      });
    }
  }

  violations.sort((a, b) => b.score - a.score);

  const bestMatch = violations.length > 0 ? violations[0] : null;
  return bestMatch && bestMatch.score > 0.3 ? bestMatch : null;
}

export function classifyAllViolations(text) {
  const lower = text.toLowerCase();
  const violations = [];
  const detectedLang = detectLanguage(lower);

  for (const category of legalKB.violation_categories) {
    const score = calculateRelevanceScore(lower, category);
    if (score > 0) {
      violations.push({
        id: category.id,
        score: score,
        data: category,
        detectedLanguage: detectedLang
      });
    }
  }

  violations.sort((a, b) => b.score - a.score);
  return violations.filter(v => v.score > 0.3);
}

export default classifyViolation;
