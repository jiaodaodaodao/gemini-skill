/**
 * temp-email.js — 临时邮箱账号字符串解析
 *
 * 兼容 gemini-business2api 的导入格式：
 *   cfmail----you@example.com----jwtToken
 *
 * 也兼容常见变体（分隔符 : | , 空白），用于降低人工复制粘贴出错率。
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 解析临时邮箱导入字符串
 * @param {string} raw
 * @returns {{ok: boolean, provider?: string, email?: string, token?: string, normalized?: string, error?: string}}
 */
export function parseTempEmailCredential(raw) {
  const source = (raw || '').trim();
  if (!source) {
    return { ok: false, error: 'empty_input' };
  }

  // 先走 business2api 的标准格式：provider----email----token
  if (source.includes('----')) {
    const parts = source.split('----').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const [provider, email, ...tokenParts] = parts;
      const token = tokenParts.join('----').trim();
      if (!EMAIL_RE.test(email)) {
        return { ok: false, error: 'invalid_email' };
      }
      if (!token) {
        return { ok: false, error: 'empty_token' };
      }
      return {
        ok: true,
        provider: provider.toLowerCase(),
        email,
        token,
        normalized: `${provider.toLowerCase()}----${email}----${token}`,
      };
    }
  }

  // 兜底支持：provider:email:token / provider|email|token / provider,email,token
  const fallbackParts = source
    .split(/\s*[|,:]\s*/)
    .map(s => s.trim())
    .filter(Boolean);

  if (fallbackParts.length < 3) {
    return { ok: false, error: 'bad_format' };
  }

  const [provider, email, ...tokenParts] = fallbackParts;
  const token = tokenParts.join(':').trim();

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'invalid_email' };
  }
  if (!token) {
    return { ok: false, error: 'empty_token' };
  }

  return {
    ok: true,
    provider: provider.toLowerCase(),
    email,
    token,
    normalized: `${provider.toLowerCase()}----${email}----${token}`,
  };
}
