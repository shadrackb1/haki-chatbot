import skill from './src/skills/legal-research/index.js';
import { classifyViolation } from './src/skills/legal-research/classifier.js';

console.log('=== Legal Research Skill Test ===');
console.log('name:', skill.name);
console.log('triggers:', skill.triggers.length);
console.log('isAvailable:', skill.isAvailable());
console.log('');

// Trigger matching (same logic as SkillRegistry.getSkillForMessage)
const lower = 'i was fired without notice, what are my rights?'.toLowerCase();
const matched = skill.triggers.filter((t) => lower.includes(t.toLowerCase()));
console.log('trigger match for "fired without notice":', matched);
console.log('');

// Violation classification
const v = classifyViolation('My employer fired me without any notice and refused to pay my last month wages');
console.log('classified violation:', v ? `${v.id} (score ${v.score.toFixed(2)})` : 'null');
console.log('');

// BM25 retrieval
const { default: KnowledgeRetriever } = await import('./src/skills/legal-research/retriever.js');
const fs = await import('fs');
const corpus = JSON.parse(fs.readFileSync('./data/legal/legal-corpus.json', 'utf8'));
const r = new KnowledgeRetriever(corpus);
const hits = r.search('terminated without notice pay in lieu', 3);
console.log('BM25 top hits:', hits.map((h) => `${h.id} (${h.score.toFixed(2)})`));
console.log('');

// Full execute (LLM off → KB fallback path)
const result = await skill.execute(
  'They fired me without notice and kept my last salary',
  { phoneNumber: 'test-user' }
);
console.log('--- RESPONSE ---');
console.log(result.response);
console.log('--- METADATA ---');
console.log(result.metadata);
