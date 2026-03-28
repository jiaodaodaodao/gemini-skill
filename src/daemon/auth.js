import { timingSafeEqual } from 'node:crypto';
import config from '../config.js';

function toSingleHeaderValue(value) {
  if (Array.isArray(value)) return value[0] || '';
  if (typeof value === 'string') return value;
  return '';
}

function normalizeIp(ip) {
  return ip === '::1' ? '127.0.0.1' : ip;
}

export function extractClientIp(req) {
  const forwarded = toSingleHeaderValue(req.headers['x-forwarded-for']);
  const candidate = (forwarded || req.socket?.remoteAddress || '').split(',')[0].trim();
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
