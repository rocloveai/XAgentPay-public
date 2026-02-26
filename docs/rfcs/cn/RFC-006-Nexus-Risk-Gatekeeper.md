# RFC-006: Nexus Risk Gatekeeper Specificationn
| Metadata | Value |
| --- | --- |
| **Title** | Nexus Risk Gatekeeper Protocol |
| **Version** | 1.0.0 |
| **Status** | Standards Track (Draft) |
| **Scope** | Risk Assessment, Permit Issuance, On-Chain Enforcement |
## 1. Abstract (摘要)
Nexus Risk Gatekeeper 是支付网络的**安全卫士**。它采用 **"Hybrid Guard" (混合防御)** 架构：链下 AI 引擎负责复杂的行为分析并签发凭证 (Permit)，链上智能合约负责验证凭证并执行硬性拦截。Gatekeeper 对 Payment Core 是透明的，Core 只需透传凭证，无需理解风控逻辑。
## 2. Architecture: Hybrid Control (混合风控架构)
### 2.1 Off-Chain Engine (大脑)
* **Data Ingestion:** 接收来自 Core 的交易上下文、链上历史数据、外部情报库 (如 Chainalysis)。
* **Decision Model:** 运行规则引擎 (Rule Engine) 和 ML 模型。
* **Signing Service:** 持有 `Gatekeeper Oracle Key`，对通过的交易进行 EIP-712 签名。
### 2.2 On-Chain Controller (手脚)
* **Storage:** 存储黑名单、限额配置、Oracle 公钥。
* **Verification:** 在交易原子执行过程中，验证 Permit 的合法性。
## 3. The Risk Permit Standard (风控凭证标准)
这是 Gatekeeper 与 Router 交互的核心载体。必须防重放、防篡改。
### EIP-712 Structure
```solidity
struct RiskPermit {
bytes32 quoteHash; // 绑定商户的具体报价 (防止被挪用于其他订单)
address payer; // 绑定付款人 (防止被抢跑或盗用 Permit)
address merchant; // 绑定收款人
uint256 amountCap; // 金额上限
uint256 deadline; // Permit 有效期 (通常很短，如 5分钟)
bytes signature; // Gatekeeper Oracle 的签名
}
```
## 4. Process Logic: The Checkpoint (检查流程)
### 4.1 Phase 1: Pre-Flight Check (编排期检查)
当 Core 请求风控时：
1. **Sanity Check:** 检查金额是否超限，商户 DID 是否在观察名单。
2. **Context Analysis:** 检查 IP 地理位置与钱包历史行为是否异常（如突然的大额跨境支付）。
3. **Issuance:**
* **PASS:** 返回 `RiskPermit` 结构体及签名。
* **CHALLENGE:** (未来扩展) 返回需要用户进行 2FA 或生物验证的指令。
* **REJECT:** 返回拒绝原因代码 (如 `ERR_RISK_HIGH_FRAUD`)。
### 4.2 Phase 2: On-Chain Enforcement (运行时拦截)
当 `NexusRouter` 调用 `NexusRiskController.assessRisk(...)` 时：
1. **Signature Verification:** `ecrecover` 恢复签名者，必须等于 `GatekeeperOracle`。
2. **Binding Verification:** 校验 `msg.sender == permit.payer`，校验 `amount <= permit.amountCap`。
3. **Liveness Check:** 校验 `block.timestamp <= permit.deadline`。
4. **Global Blocklist:** 再次检查 `payer` 和 `merchant` 是否在合约的紧急黑名单中 (即便有 Permit，黑名单优先级更高)。
## 5. Design Key Points (设计要点)
1. **Fail-Close Mechanism (故障关闭):** 如果链下风控服务宕机，无法签发 Permit，链上合约将拒绝所有新交易。这保证了系统故障时不会发生资金风险。
2. **Privacy Preservation (隐私保护):** 用户的 IP、设备 ID 等敏感数据**只进入链下风控引擎**，绝不上链。链上只验证 Permit 签名，不包含隐私字段。
3. **Decoupling:** `NexusRouter` (在 Core 侧) 只要拿到 `bool isPassed` 即可，不需要知道具体的风控规则。规则的升级（如调整限额）只需升级 Gatekeeper 模块。
---
### 总结：Core 与 Gatekeeper 的交互协议
为了将两者串联，我们需要定义一个内部交互协议 (Internal Protocol)。
**Request (Core -> Gatekeeper):**
```json
{
"request_id": "REQ-123",
"quote_hash": "0xabc...",
"payer": "0xUser...",
"merchant": "0xMerchant...",
"context": { "ip": "1.2.3.4", "device_score": 0.9 }
}
```
**Response (Gatekeeper -> Core):**
```json
{
"decision": "PERMIT", // or REJECT
"permit_payload": {
"deadline": 1760000000,
"signature": "0xSig..."
},
"risk_metadata": { "score": 10, "label": "SAFE" }
}