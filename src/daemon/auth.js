import { timingSafeEqual } from 'node:crypto';
import config from '../config.js';

function toSingleHeaderValue(value) {
  if (Array.isArray(value)) return value[0] || '';
  if (typeof value === 'string') return value;
  return '';
}

function normalizeIp(ip) {
  if (ip === '::1') return '127.0.0.1';
  // Node 在 IPv4-mapped IPv6 下可能返回 ::ffff:127.0.0.1
  if (ip?.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

export function extractClientIp(req) {
  const remoteAddr = normalizeIp(req.socket?.remoteAddress || '');
  // 仅在本机回环地址接入时信任 x-forwarded-for，避免被外部伪造绕过 IP 白名单
  const canTrustForwarded = remoteAddr === '127.0.0.1';
  const forwarded = canTrustForwarded ? toSingleHeaderValue(req.headers['x-forwarded-for']) : '';
  const candidate = (forwarded || remoteAddr || '').split(',')[0].trim();
  return normalizeIp(candidate);
}

function verifyToken(req) {
  if (!config.daemonToken) return true;

  const headerToken = toSingleHeaderValue(req.headers['x-daemon-token']).trim();
  const authHeader = toSingleHeaderValue(req.headers.authorization);
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const candidate = headerToken || bearerToken;
  if (!candidate) return false;

  const expected = Buffer.from(config.daemonToken, 'utf8');
  const provided = Buffer.from(candidate, 'utf8');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

function verifyIp(req) {
  const allowList = config.daemonAllowedIps || [];
  if (allowList.length === 0) return true;
  const clientIp = extractClientIp(req);
  return allowList.includes(clientIp);
}

export function authorizeRequest(req) {
  const ipOk = verifyIp(req);
  const tokenOk = verifyToken(req);
  return {
    ok: ipOk && tokenOk,
    reason: !ipOk ? 'ip_not_allowed' : (!tokenOk ? 'invalid_token' : null),
    clientIp: extractClientIp(req),
  };
}
