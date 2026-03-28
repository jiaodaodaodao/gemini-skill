/**
 * config.js — 统一配置中心
 *
 * 所有可配置项集中在这里，从环境变量读取，提供合理默认值。
 * 其他模块一律从 config 取值，不自己硬编码。
 *
 * 环境变量来源（优先级从高到低）：
 *   1. 进程环境变量（process.env）
 *   2. .env.development（开发环境，git-ignored）
 *   3. .env（基础配置，可提交到 git）
 *   4. 代码默认值
 *
 * .env 文件加载说明：
 *   - 本模块内置了轻量级 parseEnvFile 解析器，零外部依赖。
 *   - 作为 skill 库被 import 使用，不应要求调用方修改启动命令或安装额外依赖。
 *   - 如果调用方已通过以下方式加载了 .env，本模块也能无缝工作（process.env 优先级最高）：
 *     · Node.js ≥ v20.6.0: node --env-file=.env --env-file=.env.development app.js
 *     · dotenv 库: dotenv.config({ path: ['.env.development', '.env'] })
 */
import { readFileSync, existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// ── 手动加载 .env 文件（不依赖 dotenv） ──

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

/**
 * 解析 .env 文件内容为 key-value 对象
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, 'utf-8');
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // 跳过空行和注释
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // 去掉引号包裹
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && value) {
      result[key] = value;
    }
  }
  return result;
}

// 加载顺序：.env.development 优先 → .env 兜底
// 已存在的 process.env 不会被覆盖（进程环境变量优先级最高）
// 因为是 "不覆盖" 策略，所以高优先级的文件先加载
const devEnv = parseEnvFile(join(projectRoot, '.env.development'));
const baseEnv = parseEnvFile(join(projectRoot, '.env'));

function applyEnvIfMissing(source) {
  for (const [key, value] of Object.entries(source)) {
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

// 优先级：process.env > .env.development > .env > 代码默认值
applyEnvIfMissing(devEnv);
applyEnvIfMissing(baseEnv);

const env = process.env;

/** 辅助：读取布尔型环境变量 */
function envBool(key, fallback) {
  const val = env[key];
  if (val === undefined || val === '') return fallback;
  return val === 'true' || val === '1';
}

/** 辅助：读取数字型环境变量 */
function envInt(key, fallback) {
  const val = env[key];
  if (val === undefined || val === '') return fallback;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? fallback : n;
}

/** 辅助：读取字符串环境变量 */
function envStr(key, fallback) {
  const val = env[key];
  return (val !== undefined && val !== '') ? val : fallback;
}

/** 辅助：读取字符串数组环境变量（逗号或换行分隔） */
function envList(key, fallback = []) {
  const val = env[key];
  if (val === undefined || val === '') return fallback;
  return val
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizeIp(ip) {
  return ip === '::1' ? '127.0.0.1' : ip;
}

function validateConfig(conf) {
  const warnings = [];
  const errors = [];

  if (!Number.isInteger(conf.daemonPort) || conf.daemonPort < 1 || conf.daemonPort > 65535) {
    errors.push('DAEMON_PORT 必须是 1-65535 之间的整数');
  }
  if (!Number.isInteger(conf.daemonTTL) || conf.daemonTTL < 1000) {
    errors.push('DAEMON_TTL_MS 必须是大于等于 1000 的整数');
  }
  if (!['random', 'round_robin'].includes(conf.proxyStrategy)) {
    warnings.push(`PROXY_STRATEGY=${conf.proxyStrategy} 无效，已回退为 round_robin`);
    conf.proxyStrategy = 'round_robin';
  }
  if (conf.businessMode && !conf.businessBaseUrl) {
    warnings.push('BUSINESS_MODE=true 但 BUSINESS_BASE_URL 为空');
  }
  if (conf.daemonHost !== '127.0.0.1' && !conf.daemonToken && conf.daemonAllowedIps.length === 0) {
    warnings.push('Daemon 监听非本地地址但未配置 DAEMON_TOKEN/DAEMON_ALLOWED_IPS，存在暴露风险');
  }
  if (conf.daemonToken && conf.daemonToken.length < 16) {
    warnings.push('DAEMON_TOKEN 长度过短，建议至少 16 位');
  }
  for (const ip of conf.daemonAllowedIps) {
    if (!['localhost', '127.0.0.1'].includes(ip) && isIP(ip) === 0) {
      errors.push(`DAEMON_ALLOWED_IPS 包含非法 IP: ${ip}`);
    }
  }

  for (const msg of warnings) {
    console.warn(`[config] ⚠ ${msg}`);
  }
  if (errors.length > 0) {
    throw new Error(`[config] 配置校验失败: ${errors.join('；')}`);
  }
}

// ── 导出配置 ──

const config = {
  /** 浏览器可执行文件路径，支持 Chrome / Edge / Chromium（不设则自动检测） */
  browserPath: envStr('BROWSER_PATH', undefined),

  /**
   * CDP 远程调试端口
   *
   * 默认 40821，作为 WJZ_P 所有 skill 的统一 CDP 端口。
   * 使用独立端口的原因：
   *   1. 不信任其他浏览器实例的反爬措施，自己启动并控制的浏览器反爬最保险。
   *   2. 避免与用户手动启动的调试浏览器或其他工具的端口冲突。
   *   3. 跨 skill 共享同一个浏览器实例，多个 skill 各用各的 tab。
   */
  browserDebugPort: envInt('BROWSER_DEBUG_PORT', 40821),

  /** 浏览器用户数据目录（不设则自动解析，见 browser.js resolveUserDataDir） */
  browserUserDataDir: envStr('BROWSER_USER_DATA_DIR', undefined),

  /** 是否无头模式 */
  browserHeadless: envBool('BROWSER_HEADLESS', false),

  /** CDP 协议超时时间（ms） */
  browserProtocolTimeout: envInt('BROWSER_PROTOCOL_TIMEOUT', 60_000),

  /** 截图 / 图片输出目录 */
  outputDir: envStr('OUTPUT_DIR', join(projectRoot, 'gemini-image')),

  // ── Business2API 兼容配置 ──

  /** 是否启用 Business2API 模式（启用后 gemini_send_message / gemini_generate_image 走 OpenAI 兼容接口） */
  businessMode: envBool('BUSINESS_MODE', false),

  /** Business2API 服务地址，例如 https://your-domain.example */
  businessBaseUrl: envStr('BUSINESS_BASE_URL', ''),

  /** Business2API 的 API Key（对应 Authorization: Bearer xxx，可留空） */
  businessApiKey: envStr('BUSINESS_API_KEY', ''),

  /** Business2API 文本模型 */
  businessModel: envStr('BUSINESS_MODEL', 'gemini-2.5-flash'),

  /** Business2API 图片模型 */
  businessImageModel: envStr('BUSINESS_IMAGE_MODEL', 'gemini-imagen'),

  /** Business2API 账号导入字符串（支持 cfmail----you@example.com----jwtToken） */
  businessAccount: envStr('BUSINESS_ACCOUNT', ''),

  // ── 代理池配置（借鉴 business2api 的“代理池 + 轮换”思路） ──

  /** 代理池，支持逗号/换行分隔，例如 http://1.1.1.1:7890, socks5://2.2.2.2:1080 */
  proxyPool: envList('PROXY_POOL', []),

  /** 代理选择策略：random / round_robin */
  proxyStrategy: envStr('PROXY_STRATEGY', 'round_robin'),

  // ── Daemon 配置 ──

  /** Daemon HTTP 服务端口 */
  daemonPort: envInt('DAEMON_PORT', 40225),

  /** Daemon 监听地址，默认仅本机可访问，避免暴露调试控制面 */
  daemonHost: envStr('DAEMON_HOST', '127.0.0.1'),

  /** Daemon 访问令牌（建议在需要跨主机访问时配置） */
  daemonToken: envStr('DAEMON_TOKEN', ''),

  /** Daemon IP 白名单（逗号/换行分隔），空表示不限制 */
  daemonAllowedIps: envList('DAEMON_ALLOWED_IPS', []).map(normalizeIp),

  /** Daemon 闲置超时时间（ms），超时后自动终止浏览器释放资源 */
  daemonTTL: envInt('DAEMON_TTL_MS', 30 * 60 * 1000),
};

validateConfig(config);

export default config;
