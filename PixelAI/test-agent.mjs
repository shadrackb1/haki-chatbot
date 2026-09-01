import Agent from './src/agent.js';
import LLMReasoningEngine from './src/llm-reasoning.js';
import SkillRegistry from './src/skill-registry.js';

const reg = new SkillRegistry();
await reg.loadSkills();
const agent = new Agent(new LLMReasoningEngine(), reg);

console.log('=== AGENT TEST: legal question (forced research + citation check) ===');
const t0 = Date.now();
try {
  const res = await agent.run(
    'I was fired last week without any notice. What are my rights under Kenyan law?',
    { phoneNumber: 'test-agent-user' }
  );
  console.log(`\n(${Math.round((Date.now() - t0) / 1000)}s)`);
  console.log('tools used:', res.metadata.toolsUsed.join(' -> ') || '(none!)');
  console.log('file:', res.file ? res.file.fileName : 'none');
  console.log('\n--- ANSWER ---');
  console.log(res.response);
} catch (e) {
  console.log('AGENT ERROR:', e.message);
}
