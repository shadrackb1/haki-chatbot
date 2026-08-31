import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMenuRequest, buildInteractiveMenu, buildTextMenu, handleMenuAction, parseMenuSelection, parseNumericMenu } from '../src/quick-menu.js';

test('isMenuRequest detects trigger words and ignores noise', () => {
  assert.equal(isMenuRequest('menu'), true);
  assert.equal(isMenuRequest('Rights'), true);
  assert.equal(isMenuRequest('haki'), true);
  assert.equal(isMenuRequest('nambari'), true);
  assert.equal(isMenuRequest('register'), true);
  assert.equal(isMenuRequest('jiunge'), true);
  assert.equal(isMenuRequest('help'), true);
  assert.equal(isMenuRequest('numbers'), true);
  assert.equal(isMenuRequest('contacts'), true);
  assert.equal(isMenuRequest('  Menu  '), true);
  assert.equal(isMenuRequest('menu_items'), false);
  assert.equal(isMenuRequest('my rights are important'), false);
  assert.equal(isMenuRequest('I need help with wages'), false);
  assert.equal(isMenuRequest(''), false);
  assert.equal(isMenuRequest(null), false);
});

test('buildInteractiveMenu returns nativeFlowMessage payload', () => {
  const en = buildInteractiveMenu('en');
  assert.ok(en.interactiveMessage);
  assert.ok(en.interactiveMessage.body.text.includes('Pick one'));
  assert.ok(en.interactiveMessage.nativeFlowMessage);
  assert.ok(Array.isArray(en.interactiveMessage.nativeFlowMessage.buttons));
  assert.equal(en.interactiveMessage.nativeFlowMessage.buttons.length, 4);

  const first = en.interactiveMessage.nativeFlowMessage.buttons[0];
  assert.equal(first.name, 'quick_reply');
  const params = JSON.parse(first.buttonParamsJson);
  assert.equal(params.id, 'menu_rights');
  assert.equal(params.display_text, 'My rights');

  const sw = buildInteractiveMenu('sw');
  assert.ok(sw.interactiveMessage.body.text.includes('Chagua'));
  const swFirst = JSON.parse(sw.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson);
  assert.equal(swFirst.display_text, 'Haki zangu');
});

test('buildTextMenu returns formatted text with 4 options', () => {
  const en = buildTextMenu('en');
  assert.ok(en.includes('My rights'));
  assert.ok(en.includes('Help numbers'));
  assert.ok(en.includes('Register'));
  assert.ok(en.includes('My case'));
  assert.ok(en.includes('1'));

  const sw = buildTextMenu('sw');
  assert.ok(sw.includes('Haki zangu'));
  assert.ok(sw.includes('Nambari za msaada'));
  assert.ok(sw.includes('Jisajili'));
  assert.ok(sw.includes('Hali ya kesi'));
});

test('handleMenuAction returns rights, numbers, register, case', () => {
  const rights = handleMenuAction('menu_rights', 'en');
  assert.equal(rights.kind, 'text');
  assert.ok(rights.reply.includes('Employment Act'));
  assert.equal(rights.action, 'rights');

  const numbers = handleMenuAction('menu_numbers', 'en');
  assert.equal(numbers.kind, 'text');
  assert.ok(numbers.reply.includes('0800 720 640'));
  assert.ok(numbers.reply.includes('116'));
  assert.equal(numbers.action, 'numbers');

  const reg = handleMenuAction('menu_register', 'en');
  assert.equal(reg.kind, 'action');
  assert.equal(reg.action, 'register');
  assert.equal(reg.reply, null);

  const kase = handleMenuAction('menu_case', 'en');
  assert.equal(kase.kind, 'text');
  assert.ok(kase.reply.includes('AGRI-2026-0001'));

  assert.equal(handleMenuAction('unknown_action', 'en'), null);
});

test('handleMenuAction respects language choice', () => {
  const swRights = handleMenuAction('menu_rights', 'sw');
  assert.ok(swRights.reply.includes('Employment Act'));
  assert.ok(swRights.reply.includes('mfanyikazi'));
  const swNums = handleMenuAction('menu_numbers', 'sw');
  assert.ok(swNums.reply.includes('bure'));
});

test('parseMenuSelection extracts id from nativeFlowResponseMessage', () => {
  const nativeFlow = { message: { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{"id":"menu_rights"}' } } } };
  assert.equal(parseMenuSelection(nativeFlow), 'menu_rights');

  const legacy = { message: { buttonsResponseMessage: { selectedButtonId: 'menu_numbers' } } };
  assert.equal(parseMenuSelection(legacy), 'menu_numbers');

  assert.equal(parseMenuSelection({ message: { conversation: 'hi' } }), null);
  assert.equal(parseMenuSelection(null), null);
  assert.equal(parseMenuSelection({ message: { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: 'invalid json' } } } }), null);
});

test('parseNumericMenu maps 1-4 to action ids', () => {
  assert.equal(parseNumericMenu('1', 'en'), 'menu_rights');
  assert.equal(parseNumericMenu('2', 'en'), 'menu_numbers');
  assert.equal(parseNumericMenu('3', 'en'), 'menu_register');
  assert.equal(parseNumericMenu('4', 'en'), 'menu_case');
  assert.equal(parseNumericMenu('5', 'en'), null);
  assert.equal(parseNumericMenu(' 2 ', 'en'), 'menu_numbers');
  assert.equal(parseNumericMenu('abc', 'en'), null);
  assert.equal(parseNumericMenu('', 'en'), null);
  assert.equal(parseNumericMenu(null, 'en'), null);
});
