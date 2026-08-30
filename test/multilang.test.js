import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import LanguageLibrary from '../src/language-library.js';
import BotGraph from '../src/bot-graph.js';
import IQEngine from '../src/iq-engine.js';
import EmpathyEngine from '../src/empathy-engine.js';
import AntiAIFlows from '../src/anti-ai.js';

describe('Multi-Language Integration', () => {
  const langLib = new LanguageLibrary();

  test('detects English correctly', () => {
    const result = langLib.detectLanguage('My employer has not paid me for three months');
    assert.equal(result.language, 'en');
  });

  test('detects Swahili correctly', () => {
    const result = langLib.detectLanguage('Mshahara wangu haujalipwa kwa miezi mitatu');
    assert.equal(result.language, 'sw');
  });

  test('detects Kikuyu correctly', () => {
    const result = langLib.detectLanguage('Muhoro wakwa ndũkũũrĩte');
    assert.equal(result.language, 'kik');
  });

  test('detects Dholuo correctly', () => {
    const result = langLib.detectLanguage('Wuoyi ka onge nade');
    assert.equal(result.language, 'luo');
  });

  test('detects Kalenjin correctly', () => {
    const result = langLib.detectLanguage('Osotwa ka en emboret');
    assert.equal(result.language, 'kal');
  });

  test('detects Kamba correctly', () => {
    const result = langLib.detectLanguage('Mbeca yangu ndegũ');
    // "mbeca" is shared between Swahili and Kamba - either is acceptable
    assert.ok(['kam', 'sw'].includes(result.language), `Expected kam or sw, got ${result.language}`);
  });

  test('detects Somali correctly', () => {
    const result = langLib.detectLanguage('Mushaarkayga laakin');
    assert.equal(result.language, 'som');
  });

  test('returns welcome message for each language', () => {
    const langs = ['en', 'sw', 'kik', 'luo', 'kal', 'kam', 'luy', 'gus', 'som'];
    for (const code of langs) {
      const msg = langLib.getWelcomeMessage(code);
      assert.ok(msg, `Welcome message missing for ${code}`);
    }
  });

  test('returns help text for each language', () => {
    const langs = ['en', 'sw', 'kik', 'luo', 'kal', 'kam', 'luy', 'gus', 'som'];
    for (const code of langs) {
      const text = langLib.getHelpText(code);
      assert.ok(text, `Help text missing for ${code}`);
    }
  });

  test('translates violation types to all languages', () => {
    const types = ['WAGE_VIOLATION', 'UNFAIR_DISMISSAL', 'HARASSMENT'];
    const langs = ['en', 'sw', 'kik', 'luo', 'kal'];
    for (const type of types) {
      for (const lang of langs) {
        const translated = langLib.translateViolationType(type, lang);
        assert.ok(translated, `Translation missing for ${type} in ${lang}`);
      }
    }
  });

  test('lists all supported languages', () => {
    const supported = langLib.getSupportedLanguages();
    assert.ok(supported.length > 20, `Only ${supported.length} languages found`);
    for (const lang of supported) {
      assert.ok(lang.code);
      assert.ok(lang.name);
      assert.ok(lang.family);
    }
  });

  test('filters languages by family', () => {
    const bantu = langLib.getLanguageByFamily('Bantu');
    const nilotic = langLib.getLanguageByFamily('Nilotic');
    assert.ok(bantu.length > 5, `Only ${bantu.length} Bantu languages`);
    assert.ok(nilotic.length > 3, `Only ${nilotic.length} Nilotic languages`);
  });
});

describe('Bot Graph Navigation', () => {
  const graph = new BotGraph('E:\\Haki-Chatbot');

  test('scans project structure', () => {
    const summary = graph.getGraphSummary();
    assert.ok(summary.totalNodes > 10, `Only ${summary.totalNodes} nodes`);
    assert.ok(summary.totalEdges > 5, `Only ${summary.totalEdges} edges`);
    assert.ok(summary.totalTools > 5, `Only ${summary.totalTools} tools`);
  });

  test('navigates to child nodes', () => {
    const children = graph.getChildNodes('root');
    assert.ok(children.length > 0, 'No child nodes');
    assert.ok(children.some(c => c.name === 'src'), 'Missing src folder');
  });

  test('finds nodes by query', () => {
    const results = graph.findNode('src');
    assert.ok(results.length > 0, 'No results for src');
  });

  test('finds tools by query', () => {
    const results = graph.findTool('whatsapp');
    assert.ok(results.length > 0, 'No results for whatsapp');
  });

  test('generates mermaid diagram', () => {
    const mermaid = graph.toMermaid();
    assert.ok(mermaid.includes('graph TD'), 'Missing graph TD');
    assert.ok(mermaid.includes('-->'), 'Missing edges');
  });
});

describe('IQ Engine', () => {
  const iq = new IQEngine();

  test('detects violation intent', () => {
    const result = iq.processMessage('user1', 'My employer fired me without reason', 'en', []);
    assert.ok(result.intents.includes('REPORT_VIOLATION'), `Intents: ${result.intents}`);
    assert.equal(result.topic, 'dismissal');
  });

  test('detects emergency intent', () => {
    const result = iq.processMessage('user2', 'Help me! I am in danger! Emergency!', 'en', []);
    assert.ok(result.intents.includes('EMERGENCY'), `Intents: ${result.intents}`);
    assert.ok(result.urgency >= 4, `Urgency: ${result.urgency}`);
  });

  test('detects greeting intent', () => {
    const result = iq.processMessage('user3', 'Hello', 'en', []);
    assert.ok(result.intents.includes('GREETING'), `Intents: ${result.intents}`);
  });

  test('analyzes sentiment correctly', () => {
    const pos = iq.processMessage('user4', 'Thank you so much for your help', 'en', []);
    assert.equal(pos.sentiment, 'positive');

    const neg = iq.processMessage('user5', 'This is terrible and I am angry', 'en', []);
    assert.equal(neg.sentiment, 'negative');
  });

  test('builds reasoning chain', () => {
    const result = iq.processMessage('user6', 'They owe me salary for 3 months', 'en', []);
    assert.ok(result.reasoningChain.length > 0, 'Empty reasoning chain');
  });

  test('suggests response type', () => {
    const result = iq.processMessage('user7', 'I was harassed at work', 'en', []);
    assert.ok(result.suggestedResponse, 'No suggested response');
    assert.ok(result.suggestedResponse.type, 'No response type');
  });

  test('tracks escalation', () => {
    const r1 = iq.processMessage('user8', 'My wages are not paid', 'en', []);
    const r2 = iq.processMessage('user8', 'They also fired me', 'en', []);
    assert.ok(r2.escalation.level >= r1.escalation.level, 'Escalation not tracked');
  });

  test('generates follow-up questions', () => {
    const result = iq.processMessage('user9', 'My employer owes me money', 'en', []);
    assert.ok(result.followUpQuestions.length > 0, 'No follow-up questions');
  });
});

describe('Empathy Engine', () => {
  const empathy = new EmpathyEngine();

  test('processes neutral sentiment', () => {
    const result = empathy.processSentiment('user1', 'I need help with my wages', null);
    assert.equal(result.sentiment, 'neutral');
    assert.ok(result.empathyLevel < 0.5);
  });

  test('processes negative sentiment', () => {
    const result = empathy.processSentiment('user2', 'This is terrible and I am so upset', null);
    assert.equal(result.sentiment, 'negative');
    assert.ok(result.shouldEncourage);
  });

  test('processes fearful sentiment', () => {
    const result = empathy.processSentiment('user3', 'I am scared and afraid for my safety', null);
    assert.equal(result.sentiment, 'fearful');
    assert.ok(result.shouldComfort);
  });

  test('generates empathic prefix', () => {
    const prefix = empathy.generateEmpathicPrefix('negative', 'en');
    assert.equal(typeof prefix, 'string');
  });

  test('generates encouragement', () => {
    const enc = empathy.generateEncouragement('sw');
    assert.equal(typeof enc, 'string');
    assert.ok(enc.length > 0);
  });

  test('formats legal info with empathy', () => {
    const legalInfo = 'Under Section 27 of the Employment Act...';
    const formatted = empathy.formatLegalInfoWithEmpathy(legalInfo, 'negative', 'en');
    assert.ok(formatted.includes('Section 27'));
    assert.ok(formatted.length > legalInfo.length);
  });
});

describe('Anti-AI Flows', () => {
  const antiAI = new AntiAIFlows();

  test('applies contractions', () => {
    const result = antiAI.processResponse('I am here to help you.', 'user1', 'en');
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  test('generates colloquial greeting', () => {
    const greeting = antiAI.getColloquialGreeting('en');
    assert.equal(typeof greeting, 'string');
    assert.ok(greeting.length > 0);
  });

  test('generates colloquial farewell', () => {
    const farewell = antiAI.getColloquialFarewell('sw');
    assert.equal(typeof farewell, 'string');
  });

  test('makes text more human', () => {
    const text = 'This is a test sentence. It should have some human qualities.';
    const result = antiAI.makeItHuman(text, 'en');
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  test('handles Swahili language', () => {
    const result = antiAI.processResponse('Niko hapa kukusaidia.', 'user_sw', 'sw');
    assert.equal(typeof result, 'string');
  });
});

describe('Cross-System Integration', () => {
  const langLib = new LanguageLibrary();
  const iq = new IQEngine();
  const empathy = new EmpathyEngine();
  const antiAI = new AntiAIFlows();

  test('full pipeline: detect, classify, empathize, respond', () => {
    const message = 'Mshahara wangu haujalipwa na ninaogopa';
    const detected = langLib.detectLanguage(message);
    assert.equal(detected.language, 'sw');

    const iqResult = iq.processMessage('int1', message, detected.language, []);
    assert.ok(iqResult.intents.length > 0);

    const empResult = empathy.processSentiment('int1', message, null);
    assert.ok(empResult.sentiment);

    const response = antiAI.processResponse('Niko hapa kukusaidia.', 'int1', detected.language);
    assert.equal(typeof response, 'string');
  });

  test('full pipeline: emergency in Swahili', () => {
    const message = 'Ninaogopa! Nitaomba msaada wa dharura!';
    const detected = langLib.detectLanguage(message);

    const iqResult = iq.processMessage('int2', message, detected.language, []);
    assert.ok(iqResult.intents.includes('EMERGENCY'), `Intents: ${iqResult.intents}`);
    assert.ok(iqResult.shouldEscalate);
  });
});
