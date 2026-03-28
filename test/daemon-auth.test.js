import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { extractClientIp, authorizeRequest } from '../src/daemon/auth.js';

const originalConfig = {
  daemonToken: config.daemonToken,
  daemonAllowedIps: [...(config.daemonAllowedIps || [])],
};

test.afterEach(() => {
  config.daemonToken = originalConfig.daemonToken;
  config.daemonAllowedIps = [...originalConfig.daemonAllowedIps];
});

function makeReq({ remoteAddress = '127.0.0.1', headers = {} } = {}) {
  return {
    headers,
    socket: { remoteAddress },
  };
}

test('extractClientIp: 非 loopback 来源不信任 x-forwarded-for', () => {
  const req = makeReq({
    remoteAddress: '10.0.0.8',
    headers: { 'x-forwarded-for': '1.2.3.4' },
  });
  assert.equal(extractClientIp(req), '10.0.0.8');
});

test('extractClientIp: loopback 来源允许使用 x-forwarded-for', () => {
  const req = makeReq({
    remoteAddress: '::1',
    headers: { 'x-forwarded-for': '192.168.1.55, 10.0.0.9' },
  });
  assert.equal(extractClientIp(req), '192.168.1.55');
});

test('extractClientIp: 规范化 IPv4-mapped IPv6', () => {
  const req = makeReq({ remoteAddress: '::ffff:127.0.0.1' });
  assert.equal(extractClientIp(req), '127.0.0.1');
});

test('authorizeRequest: token 或 IP 不匹配时拒绝', () => {
  config.daemonToken = '1234567890abcdef';
  config.daemonAllowedIps = ['127.0.0.1'];

  const deniedByIp = authorizeRequest(makeReq({
    remoteAddress: '10.0.0.8',
    headers: { 'x-daemon-token': '1234567890abcdef' },
  }));
  assert.equal(deniedByIp.ok, false);
  assert.equal(deniedByIp.reason, 'ip_not_allowed');

  const deniedByToken = authorizeRequest(makeReq({
    remoteAddress: '127.0.0.1',
    headers: { 'x-daemon-token': 'wrong-token' },
  }));
  assert.equal(deniedByToken.ok, false);
  assert.equal(deniedByToken.reason, 'invalid_token');
});

test('authorizeRequest: token + IP 均匹配时放行', () => {
  config.daemonToken = '1234567890abcdef';
  config.daemonAllowedIps = ['127.0.0.1'];

  const ok = authorizeRequest(makeReq({
    remoteAddress: '127.0.0.1',
    headers: { authorization: 'Bearer 1234567890abcdef' },
  }));
  assert.equal(ok.ok, true);
  assert.equal(ok.reason, null);
});
