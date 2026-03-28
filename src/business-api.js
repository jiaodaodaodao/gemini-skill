import config from './config.js';

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || '').replace(/\/+$/, '');
}

function buildAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (config.businessApiKey) {
    headers.Authorization = `Bearer ${config.businessApiKey}`;
  }
  return headers;
}

export function parseBusinessAccount(raw) {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, error: 'empty_account' };
  }

  const trimmed = raw.trim();
  const parts = trimmed.split('----').map(s => s.trim());
  if (parts.length >= 3) {
    const providerRaw = parts.shift();
    const provider = (providerRaw || '').toLowerCase();
    const email = parts.shift() || '';
    const jwtToken = parts.join('----').trim();

    if (!provider) {
      return { ok: false, error: 'missing_provider' };
    }
    if (!email || !email.includes('@')) {
      return { ok: false, error: `invalid_${provider}_email` };
    }
    if (!jwtToken) {
      return { ok: false, error: `missing_${provider}_jwt` };
    }

    return {
      ok: true,
      provider,
      email,
      jwtToken,
      raw: trimmed,
    };
  }

  if (trimmed.includes('@')) {
    return {
      ok: true,
      provider: 'generic',
      email: trimmed,
      raw: trimmed,
    };
  }

  return { ok: false, error: 'unsupported_account_format' };
}

async function requestJson(pathname, payload, timeoutMs) {
  const baseUrl = normalizeBaseUrl(config.businessBaseUrl);
  if (!baseUrl) {
    throw new Error('BUSINESS_BASE_URL 未配置');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}${pathname}`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`business2api 返回了非 JSON 数据: ${text.slice(0, 200)}`);
    }

    if (!res.ok) {
      const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
      throw new Error(`business2api 请求失败: ${msg}`);
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function businessHealthCheck(timeoutMs = 8000) {
  const baseUrl = normalizeBaseUrl(config.businessBaseUrl);
  if (!baseUrl) {
    return {
      ok: false,
      error: 'missing_business_base_url',
      detail: 'BUSINESS_BASE_URL 未配置',
    };
  }

  const checks = {
    businessMode: !!config.businessMode,
    hasApiKey: !!config.businessApiKey,
    model: config.businessModel,
    imageModel: config.businessImageModel,
    accountConfigured: !!config.businessAccount,
  };

  if (config.businessAccount) {
    const parsed = parseBusinessAccount(config.businessAccount);
    checks.accountParse = parsed.ok
      ? { ok: true, provider: parsed.provider, hasJwtToken: !!parsed.jwtToken }
      : { ok: false, error: parsed.error };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/v1/models`, {
      method: 'GET',
      headers: buildAuthHeaders(),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // ignore json parse error in health path
    }

    if (!res.ok) {
      return {
        ok: false,
        error: 'models_endpoint_failed',
        status: res.status,
        message: json?.error?.message || json?.message || text.slice(0, 200) || `HTTP ${res.status}`,
        checks,
      };
    }

    const modelCount = Array.isArray(json?.data) ? json.data.length : 0;
    return {
      ok: true,
      endpoint: `${baseUrl}/v1/models`,
      modelCount,
      businessMode: !!config.businessMode,
      checks,
    };
  } catch (err) {
    return {
      ok: false,
      error: 'connect_failed',
      detail: err?.message || String(err),
      businessMode: !!config.businessMode,
      checks,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function businessChat(message, timeoutMs = 120000) {
  const data = await requestJson('/v1/chat/completions', {
    model: config.businessModel,
    messages: [{ role: 'user', content: message }],
    stream: false,
  }, timeoutMs);

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('business2api 返回内容为空');
  }

  return { text: content, raw: data };
}

export async function businessGenerateImage(prompt, timeoutMs = 180000) {
  const data = await requestJson('/v1/images/generations', {
    model: config.businessImageModel,
    prompt,
  }, timeoutMs);

  const item = data?.data?.[0];
  if (!item) {
    throw new Error('business2api 未返回图片数据');
  }

  if (item.b64_json) {
    return { kind: 'base64', b64: item.b64_json };
  }

  if (item.url) {
    return { kind: 'url', url: item.url };
  }

  throw new Error('business2api 图片返回格式不支持（缺少 b64_json/url）');
}
