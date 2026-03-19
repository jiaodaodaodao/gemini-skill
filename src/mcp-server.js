import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// 复用已有的统一入口，不修改原有逻辑
import { createGeminiSession, disconnect } from './index.js';
import config from './config.js';

const server = new McpServer({
  name: "gemini-mcp-server",
  version: "1.0.0",
});

// 注册工具
server.registerTool(
  "gemini_generate_image",
  {
    description: "调用后台的 Gemini 浏览器会话生成高质量图片",
    inputSchema: {
      prompt: z.string().describe("图片的详细描述词"),
      newSession: z.boolean().default(false).describe(
        "是否新建会话。true= 开启全新对话; false = 复用当前已有的 Gemini 会话页"
      ),
    },
  },
  async ({ prompt, newSession }) => {
    try {
      const { ops } = await createGeminiSession();
      const result = await ops.generateImage(prompt, { newChat: newSession });

      // 执行完毕立刻断开，交还给 Daemon 倒计时
      disconnect();

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `生成失败: ${result.error}` }],
          isError: true,
        };
      }

      // 将 base64 写入本地文件
      const base64Data = result.dataUrl.split(',')[1];
      const mimeMatch = result.dataUrl.match(/^data:(image\/\w+);/);
      const ext = mimeMatch ? mimeMatch[1].split('/')[1] : 'png';

      mkdirSync(config.outputDir, { recursive: true });
      const filename = `gemini_${Date.now()}.${ext}`;
      const filePath = join(config.outputDir, filename);
      writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

      console.error(`[mcp] 图片已保存至 ${filePath}`);

      return {
        content: [
          { type: "text", text: `图片生成成功！已保存至: ${filePath}` },
          {
            type: "image",
            data: base64Data,
            mimeType: mimeMatch ? mimeMatch[1] : "image/png",
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `执行崩溃: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// 查询浏览器信息
server.registerTool(
  "gemini_browser_info",
  {
    description: "获取 Gemini 浏览器会话的连接信息（CDP 端口、WebSocket 地址、Daemon 状态等），方便外部工具直连浏览器",
    inputSchema: {},
  },
  async () => {
    const daemonUrl = `http://127.0.0.1:${config.daemonPort}`;

    try {
      // 1. 检查 Daemon 健康状态
      const healthRes = await fetch(`${daemonUrl}/health`, { signal: AbortSignal.timeout(3000) });
      const health = await healthRes.json();

      if (!health.ok) {
        return {
          content: [{ type: "text", text: "Daemon 未就绪，浏览器可能未启动。请先调用 gemini_generate_image 触发自动启动。" }],
          isError: true,
        };
      }

      // 2. 获取浏览器连接信息
      const acquireRes = await fetch(`${daemonUrl}/browser/acquire`, { signal: AbortSignal.timeout(5000) });
      const acquire = await acquireRes.json();

      const info = {
        daemon: {
          url: daemonUrl,
          port: config.daemonPort,
          status: "running",
        },
        browser: {
          cdpPort: config.browserDebugPort,
          wsEndpoint: acquire.wsEndpoint || null,
          pid: acquire.pid || null,
          headless: config.browserHeadless,
        },
        config: {
          protocolTimeout: config.browserProtocolTimeout,
          outputDir: config.outputDir,
          daemonTTL: config.daemonTTL,
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `无法连接 Daemon (${daemonUrl})，浏览器可能未启动。\n错误: ${err.message}\n\n提示: 请先调用 gemini_generate_image 触发自动启动，或手动运行 npm run daemon`,
        }],
        isError: true,
      };
    }
  }
);

// 启动标准输入输出通信
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gemini MCP Server running on stdio"); // 必须用 console.error，避免污染 stdio
}

run().catch(console.error);
