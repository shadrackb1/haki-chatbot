import fs from 'fs';
import SkillRegistry from './src/skill-registry.js';
import MessageRouter from './src/message-router.js';
import LLMReasoningEngine from './src/llm-reasoning.js';

const reg = new SkillRegistry();
await reg.loadSkills();
console.log('skills:', reg.getAllSkills().length);

// Router match check for a docgen request
const matches = reg.getSkillForMessage('generate a case summary document about unfair dismissal in Kenya');
console.log('router match:', matches.map((m) => m.name));

// Full route through MessageRouter (exercises array + file passthrough fixes)
const router = new MessageRouter(reg, new LLMReasoningEngine(), null, null);
const res = await router.route(
    'generate a case summary about unfair dismissal without notice',
    { chatId: 'test-chat', senderId: '254746053175', phoneNumber: '254746053175' }
);

console.log('source:', res.source, '| skill:', res.skillName);
console.log('caption:', res.response);
console.log('file:', res.file ? `${res.file.fileName} (${res.file.mimetype}, ${res.file.buffer.length} bytes)` : 'NONE');

if (res.file) {
    const out = `./temp-test-output.pdf`;
    fs.writeFileSync(out, res.file.buffer);
    const magic = res.file.buffer.subarray(0, 5).toString();
    console.log('saved to', out, '| PDF magic bytes:', magic === '%PDF-' ? 'VALID ✓' : 'INVALID ✗');
}
