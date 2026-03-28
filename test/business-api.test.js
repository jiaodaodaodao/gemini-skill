import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { parseBusinessAccount, businessHealthCheck, businessChat } from '../src/business-api.js';

const originalFetch = global.fetch;
const originalConfig = {
  businessMode: config.businessMode,
  businessBaseUrl: config.businessBaseUrl,
  businessApiKey: config.businessApiKey,
  businessModel: config.businessModel,
  businessImageModel: config.businessImageModel,
  businessAccount: config.businessAccount,
};

function restoreConfig() {
  Object.assign(config, originalConfig);
}

test.after(() => {
  global.fetch = originalFetch;
  restoreConfig();
});

test('parseBusinessAccount: 支持 cfmail 格式', () => {
  const parsed = parseBusinessAccount('cfmail----demo@example.com----jwtToken');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.provider, 'cfmail');
  assert.equal(parsed.email, 'demo@example.com');
  assert.equal(parsed.jwtToken, 'jwtToken');
});

test('parseBusinessAccount: 支持 email+jwt 的 fallback 格式', () => {
  const parsed = parseBusinessAccount('demo@example.com----jwtToken');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.provider, 'generic');
  assert.equal(parsed.email, 'demo@example.com');
  assert.equal(parsed.jwtToken, 'jwtToken');
});

test('parseBusinessAccount: 支持其他 provider 的临时邮箱格式', () => {
  const parsed = parseBusinessAccount('mailtm----demo@example.com----jwt----token');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.provider, 'mailtm');
  assert.equal(parsed.email, 'demo@example.com');
  assert.equal(parsed.jwtToken, 'jwt----token');
});

test('parseBusinessAccount: 缺失 jwt 时返回失败', () => {
  const parsed = parseBusinessAccount('cfmail----demo@example.com----');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'missing_cfmail_jwt');
});

test('parseBusinessAccount: 非法输入返回失败', () => {
  const parsed = parseBusinessAccount('bad-value');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'unsupported_account_format');
});

test('parseBusinessAccount: 非法 provider 返回失败', () => {
  const parsed = parseBusinessAccount('***----demo@example.com----jwtToken');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'invalid_provider');
});

test('businessHealthCheck: 缺少 BUSINESS_BASE_URL 时返回 missing_business_base_url', async () => {
  config.businessBaseUrl = '';
  const result = await businessHealthCheck(50);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'missing_business_base_url');
});

test('businessHealthCheck: /v1/models 可用时返回 ok=true', async () => {
  config.businessMode = true;
  config.businessBaseUrl = 'https://example.com';
  config.businessApiKey = 'dummy';
  config.businessModel = 'gemini-2.5-flash';
  config.businessImageModel = 'gemini-imagen';
  config.businessAccount = 'cfmail----demo@example.com----jwtToken';

  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }),
  });

  const result = await businessHealthCheck(200);
  assert.equal(result.ok, true);
  assert.equal(result.modelCount, 2);
  assert.equal(result.businessMode, true);
  assert.equal(result.checks.accountParse.ok, true);
  assert.equal('email' in result.checks.accountParse, false);
});

test('businessHealthCheck: 非法 BUSINESS_BASE_URL 时返回 connect_failed', async () => {
  config.businessBaseUrl = 'file:///tmp/bad';
  const result = await businessHealthCheck(100);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'connect_failed');
  assert.match(result.detail, /仅支持 http\/https/);
});

test('businessChat: 非法 BUSINESS_BASE_URL 直接抛错', async () => {
  config.businessBaseUrl = 'not-a-url';
  await assert.rejects(
    () => businessChat('hello', 100),
    /不是合法 URL/
  );
});
