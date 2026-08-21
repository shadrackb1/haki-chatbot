import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toWhatsApp } from '../src/whatsapp-format.js';

test('converts **bold** to WhatsApp single asterisks', () => {
  assert.equal(toWhatsApp('this is **important**'), 'this is *important*');
});

test('converts __italic__ to underscores', () => {
  assert.equal(toWhatsApp('__note__'), '_note_');
});

test('converts markdown headers to bold lines', () => {
  assert.equal(toWhatsApp('### Step One'), '*Step One*');
  assert.equal(toWhatsApp('## Step Two'), '*Step Two*');
});

test('converts list dashes and asterisks to bullets, preserving indent', () => {
  assert.equal(toWhatsApp('- first item'), '• first item');
  assert.equal(toWhatsApp('* second item'), '• second item');
  assert.equal(
    toWhatsApp('Steps:\n- top\n    - nested'),
    'Steps:\n• top\n    • nested'
  );
});

test('leaves content inside code fences untouched', () => {
  const input = '```\n**not bold**\n```';
  assert.equal(toWhatsApp(input), input);
});

test('collapses three or more newlines into two', () => {
  assert.equal(toWhatsApp('a\n\n\n\nb'), 'a\n\nb');
});

test('trims surrounding whitespace', () => {
  assert.equal(toWhatsApp('\n\n  hello **world**  \n'), 'hello *world*');
});

test('non-strings: null passes through, undefined becomes empty string', () => {
  assert.equal(toWhatsApp(''), '');
  assert.equal(toWhatsApp(null), null);
  assert.equal(toWhatsApp(undefined), '');
});
