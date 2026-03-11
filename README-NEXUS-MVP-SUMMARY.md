# nexus-mvp 项目速览（已部署 Render）

> 用于后续配置 skills 的上下文摘要。仓库：https://github.com/rocloveai/XAgentPay

## 项目定位

**xXAgent Pay Core**：连接 AI Agent（User Agent / Merchant Agent）与链上结算的**支付编排层**。支持双模式（直接转账 / Escrow 担保）、EIP-3009 无 Gas 体验、MCP 协议、12 状态状态机、ISO 20022、DID `did:nexus`。

## Render 部署结构（render.yaml）

| 服务 | 类型 | 说明 |
|------|------|------|
| **nexuspay-db** | PostgreSQL | 新加坡，free plan，库名 `nexuspay` |
| **nexus-website** | static (Vite) | 前端，`src/nexus-website`，需 `VITE_NEXUS_CORE_URL` |
| **nexus-core** | Docker | 支付编排 MCP 服务，端口 10000，健康检查 `/health`，需 DATABASE_URL / RELAYER_PRIVATE_KEY / ESCROW_CONTRACT / RPC_URL / PORTAL_TOKEN / BASE_URL |
| **nexus-hotel-agent** | Docker | 酒店预订商户 Agent，Amadeus API，`did:nexus:20250407:demo_hotel` |
| **nexus-flight-agent** | Docker | 机票商户 Agent，Duffel API，`did:nexus:20250407:demo_flight` |
| **nexus-telegram-bot** | Docker | Telegram 机器人，健康检查 `/health`，需 TELEGRAM_BOT_TOKEN / NEXUS_CORE_URL / BASE_URL |

## 代码结构

- **src/nexus-core**：MCP Server + REST + 状态机 + Relayer + Webhook + 市场发现；提供 `skill.md`、`skill-user.md`、`skill-market.md`。
- **src/nexus-website**：Vite 前端，多语言（en/zh/ja/th），展示商户与 skill.md 使用方式。
- **src/hotel-agent**、**src/flight-agent**：商户 Agent，各有 `skill.md`、`skill-user.md`，HTTP 提供 `/skill.md`、Portal。
- **src/telegram-bot**：通过 `/skill.md` 暴露 skill。
- **src/skills/XAgent Pay-SKILL-STANDARD.md**：NMSS 标准与 skill.md 模板。
- **docs/**：RFC（001–011）、PRD、架构、测试用例、skill 市场调研。

## Skill 体系（NMSS / RFC-008）

- **XAgent Pay Core**：`skill.md` 描述 MCP 连接与工具（`nexus_orchestrate_payment`、`nexus_get_payment_status`、`discover_agents`、`get_agent_skill` 等）。
- **商户 Agent**：每个商户有 `skill.md`（YAML frontmatter + Markdown），含 `name`、`version`、`merchant_did`、`protocol`、`category`、`currencies`、`chain_id`、`tools`（role: search / quote / status / action）。
- **skill-user.md**：面向终端用户的简化说明；**skill-market.md**：市场/发现用。
- 当前文档里的示例 URL：`api.xagentpay.com`、`nexus-flight-agent-3xb1.onrender.com`、`nexus-hotel-agent-d2lj.onrender.com` — 若你部署的 Render URL 不同，需在对应 `skill.md` / 前端配置里替换为实际 BASE_URL / NEXUS_CORE_URL。

## 配置 skills 时可能要做的事

1. **Cursor/Codex Skills**：为 Si-infra 或 nexus-mvp 写 SKILL.md，让 AI 熟悉 Render 部署、NMSS、MCP 端点、环境变量和 `skill.md` 规范。
2. **NMSS skill.md**：根据实际 Render 域名更新各服务里的 MCP URL、`skill-user.md` 链接、前端 `VITE_NEXUS_CORE_URL` 和 marketplace 的 skill URL。
3. **商户注册**：在 Core 的市场/数据库中注册 hotel / flight agent 的 `skill_md_url`（即各 Agent 的 `https://<your-render-service>.onrender.com/skill.md`）。

需要配置哪一类 skills（Cursor 技能 / NMSS 商户 skill / 两者）直接说，我按这个摘要帮你具体改。
