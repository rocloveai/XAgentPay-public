# RFC-011: Nexus Buyer Skills Standard (NBSS)
| 属性 | 描述 |
| --- | --- |
| **Package** | `@nexus/buyer-skills` |
| **Context** | User Agent / Buyer Bot |
| **Protocol** | Compatible with Google UCP v1 & NUPS v1.5 |
| **Role** | Payment Orchestration & Execution |
## 1. 设计目标
本标准旨在让 Agent 开发者**零区块链门槛**接入。开发者不需要编写 Web3 代码（如 `ethers.js` 或 ABI 调用），只需将这些 Skills 注册给 LLM，Agent 即可自主完成支付。
## 2. 核心类：`NexusBuyerToolkit`
这是 SDK 的入口。它负责管理钱包签名者（Signer）和 Nexus Core 的连接。
```typescript
import { NexusBuyerToolkit } from '@nexus/buyer-skills';
import { PrivateKeySigner } from '@nexus/buyer-skills/signers'; // 或引入 wagmi/viem
// 初始化工具包
const nexusToolkit = new NexusBuyerToolkit({
// 1. Agent 的身份 (用于风控和签名)
signer: new PrivateKeySigner(process.env.AGENT_WALLET_PRIVATE_KEY),
// 2. 环境配置
chainId: 210425, // PlatON / Ethereum / Base ...
coreUrl: "https://api.nexus.xyz" // Nexus Core MCP/API Endpoint
});
```
---
## 3. 标准 Skills 定义 (The Skills)
本工具包暴露三个核心 Skill。每个 Skill 都包含标准的 `name`, `description` (Prompt), `schema` (Zod)，可直接注入 Agent 框架。
### 🛡️ Skill 1: `PreparePayment` (支付编排)
**定位：** 将 UCP 的“报价”转化为“待签名的交易”。
**LLM 认知：** "当商户返回 xNexus 报价时，使用此工具进行预处理和风控检查。"
* **Tool Name:** `nexus_prepare_transaction`
* **Description:** "Analyzes a UCP payment quote, performs risk checks via Nexus Core, and generates a signable blockchain transaction manifest."
* **Input Schema:**
```typescript
z.object({
// 直接接受 UCP 协议中的 payment_method 对象
ucp_payment_method: z.object({
type: z.literal("urn:ucp:payment:nexus_v1"),
payload: z.any() // NUPS v1.5 Quote JSON
}).describe("The entire payment method object from the Merchant's UCP response")
})
```
* **Output:** `TransactionManifest` (包含 `to`, `data`, `nexus_payment_id` 等)。
### ⚡ Skill 2: `ExecutePayment` (执行支付)
**定位：** 唤起 Agent 的钱包进行签名并上链。
**LLM 认知：** "当预处理完成且决策确认支付后，使用此工具将资金转出。"
* **Tool Name:** `nexus_execute_transaction`
* **Description:** "Signs and broadcasts the transaction manifest using the Agent's configured wallet. This action moves funds."
* **Input Schema:**
```typescript
z.object({
nexus_payment_id: z.string().describe("The ID returned from preparation step"),
transaction_manifest: z.any().describe("The manifest object returned from preparation step")
})
```
* **Output:** `{ status: "BROADCASTED", tx_hash: "0x..." }`
### 🔍 Skill 3: `TrackOrder` (追踪状态)
**定位：** 确认交易是否被商户接受（闭环）。
**LLM 认知：** "支付完成后，必须使用此工具确认商户是否已收到并确认履约。"
* **Tool Name:** `nexus_track_status`
* **Description:** "Polls Nexus Core until the order is confirmed by the merchant (MERCHANT_ACCEPTED) or fails."
* **Input Schema:**
```typescript
z.object({
nexus_payment_id: z.string()
})
```
* **Output:** `{ status: "COMPLETED", merchant_ref: "..." }`
---
## 4. 集成示例：如何引入代码
以下展示如何在主流 Agent 框架中使用这些标准 Skill。
### 场景 A: 使用 Google Genkit (Node.js)
Google Genkit 是 UCP 的原生搭档。
```typescript
import { genkit } from 'genkit';
import { nexusBuyerPlugin } from '@nexus/buyer-skills/adapters/genkit';
const ai = genkit({
plugins: [
// 一行代码注入所有 Nexus 能力
nexusBuyerPlugin({
privateKey: process.env.KEY,
chainId: 210425
})
]
});
// 定义 Flow
export const buyProduct = ai.defineFlow({
name: 'buyProduct',
inputSchema: z.any(), // 输入 UCP Response
}, async (ucpResponse) => {
// LLM 自动规划：
// 1. 识别到 UCP Response 里有 Nexus Quote
// 2. 调用 nexus_prepare_transaction
// 3. 调用 nexus_execute_transaction
// 4. 调用 nexus_track_status
const result = await ai.generate({
prompt: `Complete the payment for this UCP offer: ${JSON.stringify(ucpResponse)}`,
tools: ['nexus_prepare_transaction', 'nexus_execute_transaction', 'nexus_track_status']
});
return result.text;
});
```
### 场景 B: 使用 LangChain (Python/JS)
```typescript
import { NexusBuyerToolkit } from '@nexus/buyer-skills';
const toolkit = new NexusBuyerToolkit({...});
// 获取 LangChain 兼容的 Tools 数组
const tools = toolkit.getTools();
const agent = createOpenAIFunctionsAgent({
llm,
tools,
prompt
});
// Agent 执行
await agent.invoke({
input: "I accept the quote from Trip.com. Please pay it."
});
```
---
## 5. Agent 内部执行流 (The Internal Loop)
当 Agent 引入这些代码后，它处理一笔 UCP 订单的标准思维链（Chain of Thought）如下：
1. **Observation:** 用户想买票，商户返回了 UCP JSON，里面包含 `urn:ucp:payment:nexus_v1`。
2. **Thought:** 我需要把这个 Quote 变成交易。
3. **Action:** 调用 `nexus_prepare_transaction(quote)`。
4. **Observation:** Nexus Core 返回了 `risk: PASS` 和一个 `manifest`。
5. **Thought:** 风控通过了，用户也授权了（假设 Agent 有自动额度）。我现在执行上链。
6. **Action:** 调用 `nexus_execute_transaction(manifest)`。
7. **Observation:** 交易已广播，Hash 是 `0x123...`。
8. **Thought:** 我需要等待商户确认，以确保票出票成功。
9. **Action:** 调用 `nexus_track_status(id)`。
10. **Observation:** 状态变为 `MERCHANT_ACCEPTED`。
11. **Final Response:** "支付成功，商户已确认出票！"
---
## 6. 安全与发布规范
为了让这个包 `public publishable`，必须遵循以下安全设计：
1. **Non-Custodial Design (非托管):** `@nexus/buyer-skills` **绝不**在代码中硬编码私钥。私钥必须由开发者在运行时通过 `Signer` 实例注入。
2. **Manifest Verification (显式确认):** 在 `ExecutePayment` 步骤中，SDK 应该支持传入一个 `approvalCallback`。如果是有人值守的 Agent，可以在此时弹窗让用户二次确认；如果是无人值守 Agent，则由策略配置决定。
3. **Minimal Dependencies:** 包体应尽可能小，不依赖庞大的 UI 库，只依赖轻量级加密库（如 `viem`）。
通过发布这个标准化的 SDK，Nexus 实际上制定了 **"Agent Pay" 的行业标准**。任何 Agent 只要安装了这个插件，就自动具备了接入全球 Nexus 商户网络的能力。