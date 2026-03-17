# RFC-004: XAgent Pay Client Standard (NCS)

| Metadata | Value |
| --- | --- |
| **Title** | XAgent Pay Client Standard |
| **Version** | 1.5.0 |
| **Status** | Standards Track (Draft) |
| **Dependencies** | RFC-002 (NUPS), RFC-003 (NAIS) |

以下是商户引入代码的三种方式，从**最自动化（AI Agent）到最可控（传统后端）**。
---
### 1. 核心依赖包 (The Package)
商户只需安装一个包：
```bash
npm install @nexus/seller-sdk
```
该包内置了：
* **Signer:** 负责 EIP-712 离线签名。
* **Client:** 负责与 XAgent Pay Core (MCP) 通信。
* **Adapters:** 针对 LangChain, Genkit, MCP 的适配器。
---
### 方式一：AI Native 模式 (针对 Google Genkit/LangChain)
这是最简化的集成方式。商户如果正在使用 Google Genkit 开发 Agent，只需**一行代码**注册插件。Agent 的 LLM 会自动学会何时调用支付功能。
#### 代码实现
```typescript
// src/agent.ts
import { genkit } from 'genkit';
import { nexusSellerPlugin } from '@nexus/seller-sdk/genkit';
const ai = genkit({
plugins: [
// --- 1. 引入 XAgent Pay 插件 ---
nexusSellerPlugin({
merchantDid: process.env.MERCHANT_DID, // e.g. "did:xagent:trip_com"
privateKey: process.env.MERCHANT_KEY, // 你的私钥
env: 'production' // 或 'sandbox'
})
]
});
// --- 2. 你的业务 Flow ---
export const bookFlight = ai.defineFlow({
name: 'bookFlight',
inputSchema: z.string(),
}, async (input) => {
// --- 3. 魔法发生的地方 ---
// 你不需要写任何支付逻辑。
// LLM 会自动根据上下文，调用插件中的 `nexus_create_quote` 工具，
// 并生成符合 UCP 标准的 JSON 返回给用户。
const response = await ai.generate({
prompt: `User wants to book flight ${input}. Price is 530 USDC. Generate a XAgent Pay payment quote.`,
tools: ['nexus_create_quote'] // 显式允许 LLM 使用 XAgent Pay 工具
});
return response.output;
});
```
**效果：** 商户 Agent 瞬间拥有了“签发报价”和“验资”的能力，无需编写任何额外的胶水代码。
---
### 方式二：MCP Server 模式 (针对通用 Agent 接入)
如果商户希望通过 **MCP (Model Context Protocol)** 将自己的服务暴露给 Claude Desktop、Cursor 或其他通用 Agent，可以使用内置的 MCP Server 类。
#### 代码实现
```typescript
// src/mcp-server.ts
import { XAgent PayMcpServer } from '@nexus/seller-sdk/mcp';
// --- 1. 启动服务器 ---
const server = new XAgent PayMcpServer({
name: "Trip.com Payment Service",
version: "1.0.0",
identity: {
did: process.env.MERCHANT_DID,
key: process.env.MERCHANT_KEY
}
});
// 这会自动通过 Stdio 暴露 tools:
// - nexus_create_quote
// - nexus_verify_settlement
// - xagent_confirm_fulfillment
server.start();
console.log("XAgent Pay MCP Server running...");
```
**效果：** 任何支持 MCP 的客户端（如 Claude）现在都可以直接连接这个服务，并代表用户进行下单和支付交互。
---
### 方式三：传统后端集成 (针对 REST API / UCP 适配器)
对于现有的 Web2 系统（如基于 Express/NestJS 的 UCP 适配层），我们提供命令式的 API。
#### 代码实现
```typescript
// src/controllers/booking.controller.ts
import { XAgent PayClient } from '@nexus/seller-sdk';
const nexus = new XAgent PayClient({
privateKey: process.env.KEY,
merchantDid: "did:xagent:trip_com"
});
// 场景：在返回 UCP Search 结果时注入支付方式
app.post('/ucp/search', async (req, res) => {
const { flightId, price } = req.body;
// --- 1. 生成报价 (纯本地计算，无网络延迟) ---
const quote = nexus.signQuote({
orderRef: `ORD-${Date.now()}`,
amount: price, // e.g. 530.00
currency: 'USDC',
lineItems: [{ name: "Flight Ticket", amount: price }]
});
// --- 2. 返回 UCP 标准 JSON ---
res.json({
offers: [...],
payment_methods: [
{
type: "urn:ucp:payment:nexus_v1",
payload: quote // <--- 注入生成的 JSON
}
]
});
});
// 场景：处理发货 (在收到 Core Webhook 或用户请求后)
app.post('/fulfill', async (req, res) => {
const { orderRef } = req.body;
// --- 3. 主动去 XAgent Pay Core 查账 (风控与验资) ---
const result = await nexus.verifySettlement(orderRef);
if (result.status === 'SETTLED' && result.risk === 'LOW') {
// 安全！发货
await issueTicket(orderRef);
// 4. 告诉 Core 闭环交易
await nexus.confirmFulfillment(result.nexusPaymentId);
res.json({ success: true });
} else {
res.status(400).json({ error: "Payment verification failed" });
}
});
```
---
### 简化集成的关键设计点
为了达到“极简”体验，我们在 SDK 内部做了大量封装：
1. **自动 ISO 映射:**
商户输入 `currency: 'USDC'`，SDK 自动将其转换为 `{ iso_4217: 'USD', dti: '4H95...' }`。商户不需要去查 ISO 标准手册。
2. **单位自动转换:**
商户输入 `530.00` (浮点数)，SDK 自动根据代币精度转换为 `530000000` (Wei)，防止精度丢失问题。
3. **内建 Mock 模式:**
在开发环境 (`env: 'sandbox'`)，SDK 不会真的去签名，而是生成测试用的 Mock 数据，让商户在不花一分钱的情况下跑通 UCP 流程。
4. **智能重试与轮询:**
`verifySettlement` 方法内部内置了指数退避策略。如果链上刚广播还没确认，SDK 会自动等待几秒再重试，给商户返回最终确定的结果，而不是报错。
### 总结
对于 MA 开发者：
* **如果是 AI 团队：** 使用 `nexusSellerPlugin`，只需在 `genkit` 配置里加一行。
* **如果是 API 团队：** 使用 `XAgent PayClient`，只需在 Controller 里加两行 (`signQuote` 和 `verifySettlement`)。
这种设计最大程度地降低了 Web3 的认知门槛，让支付变成了简单的函数调用。