import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedImageUrl } from '../src/gemini-ops.js';

test('isAllowedImageUrl: 允许 blob/data URL', () => {
  assert.equal(isAllowedImageUrl('blob:https://gemini.google.com/abc'), true);
  assert.equal(isAllowedImageUrl('data:image/png;base64,AAAA'), true);
});

test('isAllowedImageUrl: 允许 Gemini 常见图片域名', () => {
  assert.equal(isAllowedImageUrl('https://lh3.googleusercontent.com/abc'), true);
  assert.equal(isAllowedImageUrl('https://foo.ggpht.com/abc'), true);
  assert.equal(isAllowedImageUrl('https://gemini.google.com/image.png'), true);
  assert.equal(isAllowedImageUrl('https://foo.gstatic.com/a.png'), true);
});

test('isAllowedImageUrl: 拒绝可疑协议/域名', () => {
  assert.equal(isAllowedImageUrl('file:///etc/passwd'), false);
  assert.equal(isAllowedImageUrl('http://127.0.0.1:8080/secret'), false);
  assert.equal(isAllowedImageUrl('https://evil.example.com/a.png'), false);
  assert.equal(isAllowedImageUrl('not-a-url'), false);
});
