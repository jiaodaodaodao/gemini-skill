---
name: gemini-skill
description: 通过 Gemini 官网（gemini.google.com）执行生图操作。用户提到"生图/画图/绘图/nano banana/nanobanana/生成图片"等关键词时触发。所有浏览器操作已封装为 MCP 工具，AI 无需手动操控浏览器，但必要时可以通过gemini_browser_info获取浏览器连接信息，如CDP连接端口，方便AI自行连接调试。
---

# Gemini Skill

## 触发关键词

- **生图任务**：`生图`、`画`、`绘图`、`海报`、`nano banana`、`nanobanana`、`image generation`、`生成图片`
- 若请求含糊，先确认用户是否需要生图

## 使用方式

本 Skill 通过 MCP Server 暴露工具，AI 直接调用即可，**不需要手动操作浏览器**。

浏览器启动、会话管理、图片提取、文件保存等流程已全部封装在工具内部。Daemon 未运行时会自动后台拉起，无需手动启动。

### 可用工具

| 工具名 | 说明 | 入参 |
|--------|------|------|
| `gemini_generate_image` | 生成图片，返回本地文件路径 + base64 图片 | `prompt`（描述词），`newSession`（是否新建会话，默认 false） |
| `gemini_browser_info` | 获取浏览器连接信息（CDP 端口、wsEndpoint、Daemon 状态等） | 无 |

### 典型调用流程

1. 用户说"帮我画一张猫咪的图"
2. 调用 `gemini_generate_image`，传入 prompt
3. 工具返回本地图片路径和 base64 数据
4. 将图片展示给用户

### 参数说明

- `newSession: false`（默认）— 复用当前 Gemini 会话页，适合连续生图
- `newSession: true` — 新建干净会话，适合全新主题

## MCP 客户端配置

```json
{
  "mcpServers": {
    "gemini": {
      "command": "node",
      "args": ["<项目绝对路径>/src/mcp-server.js"]
    }
  }
}
```

也可通过 `npm run mcp` 手动启动。

## 失败处理

工具内部已包含重试逻辑。若仍然失败，返回值的 `isError: true` 和错误信息会告知原因：

- **生成超时** — 建议用户简化描述词后重试
- **Daemon 未启动** — 工具会自动拉起，若仍失败可手动 `npm run daemon`
- **页面异常** — 可调用 `gemini_browser_info` 查看浏览器状态排查

## 参考

- 详细执行与回退：`references/gemini-flow.md`
- 关键词与路由：`references/intent-routing.md`
