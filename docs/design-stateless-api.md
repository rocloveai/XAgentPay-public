# NexusPay Stateless API 设计方案

| Metadata | Value |
| --- | --- |
| **Title** | Stateless REST API for LLM Tool Integration |
| **Version** | 1.0.0 |
| **Status** | Design (Proposed) |
| **Author** | Cipher & Nexus Architect Team |
| **Created** | 2026-02-26 |
| **Related** | RFC-005v2, skill.md v0.5.0 |

## 1. 问题陈述

### 1.1 当前状态

nexus-core 当前通过两种协议提供服务:
- **MCP (SSE)**: 有状态的长连接,要求客户端支持 Server-Sent Events
- **HTTP (部分)**: 仅 `/api/orchestrate` (POST), `/api/checkout/:token` (GET/POST), `/api/merchant/confirm-fulfillment` (POST) 有 REST 端点

### 1.2 核心问题

许多 LLM 工具平台(如 Claude Desktop 以外的客户端、API 直接调用、无头环境等)不支持 SSE 长连接,导致无法使用 MCP 协议。这限制了 nexus-core 的可访问性。

### 1.3 安全挑战

stateless 模式下的主要安全挑战:
1. **无 session/cookie**: 无法依赖传统的会话管理
2. **防重放攻击**: 每个请求必须独立验证
3. **身份验证**: 需要无状态的身份验证机制
4. **费率限制**: 需要分布式限流策略
5. **Quote 篡改**: 必须验证 quote 的完整性和来源

## 2. 设计目标

### 2.1 核心原则

1. **完全 Stateless**: 每个请求携带全部认证和授权信息
2. **向后兼容**: 现有 MCP 工具和 HTTP 端点继续工作
3. **安全第一**: stateless 模式的安全级别不低于 MCP 模式
4. **费率友好**: 避免因无状态导致的性能回退
5. **LLM 友好**: API 设计便于 LLM 理解和调用

### 2.2 非目标

- ❌ 替换 MCP 协议(MCP 仍然是首选方式)
- ❌ 完全去中心化(仍然依赖 nexus-core 作为协调者)
- ❌ 支持所有 MCP 高级特性(如 Resource subscriptions, 仅保留核心工具)

## 3. MCP 工具分析

### 3.1 当前工具清单(9个)

| # | Tool | HTTP 等价端点 | 需要 Stateless | 优先级 |
|---|------|--------------|--------------|--------|
| 1 | `nexus_orchestrate_payment` | ✅ `POST /api/orchestrate` | ❌ 已有 | P0 |
| 2 | `nexus_get_payment_status` | ❌ 无 | ✅ 需要 | P0 |
| 3 | `nexus_confirm_deposit` | ✅ `POST /api/checkout/:token/confirm` | ⚠️ 部分(需要 API Key 版本) | P1 |
| 4 | `nexus_release_payment` | ❌ 无 | ✅ 需要 | P1 |
| 5 | `nexus_dispute_payment` | ❌ 无 | ✅ 需要 | P2 |
| 6 | `nexus_resolve_dispute` | ❌ 无 | ✅ 需要 | P2 |
| 7 | `nexus_confirm_fulfillment` | ✅ `POST /api/merchant/confirm-fulfillment` | ⚠️ 已有但需加强认证 | P0 |
| 8 | `discover_agents` | ❌ 无 | ✅ 需要 | P3 |
| 9 | `get_agent_skill` | ⚠️ `GET /skill.md` (仅 nexus-core 自己) | ✅ 需要 | P3 |

### 3.2 工具分类

#### Group A: 已有 HTTP 端点,需改进认证

1. **`POST /api/orchestrate`** — 现状: 完全开放(仅 CORS), 改进: 添加可选 API Key 认证 + 费率限制
2. **`POST /api/merchant/confirm-fulfillment`** — 现状: 仅 merchant_did 匹配, 改进: 添加 HMAC 签名或 API Key

#### Group B: 需要新增 HTTP 端点(P0-P1)

3. **`GET /api/payments/:id`** — 查询支付状态(public, 仅需 payment_id)
4. **`POST /api/payments/:id/release`** — 释放托管资金(需要 merchant API Key)

#### Group C: 需要新增 HTTP 端点(P2-P3,非关键路径)

5. **`POST /api/payments/:id/dispute`** — 发起争议(需要 payer 签名)
6. **`POST /api/payments/:id/resolve`** — 解决争议(需要 arbitrator API Key)
7. **`GET /api/agents`** — 发现商户代理(public, 添加费率限制)
8. **`GET /api/agents/:did/skill`** — 获取商户技能(public)

## 4. 安全架构设计

### 4.1 认证层次模型

| 层级 | 认证方式 | 适用端点 | 强度 |
|------|---------|---------|------|
| L0 - Public | 无需认证(仅 IP 限流) | `GET /health`, `GET /skill.md` | 🔓 |
| L1 - Quote Verified | EIP-712 签名验证(已有) | `POST /api/orchestrate` | 🔐 |
| L2 - Payer Signed | EIP-712 payer 签名 | `POST /api/payments/:id/dispute` | 🔐🔐 |
| L3 - Merchant API Key | Bearer token (HMAC) | `POST /api/payments/:id/release` | 🔐🔐 |
| L4 - Core Operator | Internal relayer key | `POST /api/payments/:id/resolve` (arbitration) | 🔐🔐🔐 |

### 4.2 API Key 设计(Merchant 认证)

#### 4.2.1 数据库扩展

```sql
-- 新增表: merchant_api_keys
CREATE TABLE merchant_api_keys (
  api_key_id      TEXT PRIMARY KEY,                    -- nak_live_xxx / nak_test_xxx
  merchant_did    TEXT NOT NULL REFERENCES merchant_registry(merchant_did),
  key_hash        TEXT NOT NULL,                       -- SHA256(secret)
  key_prefix      TEXT NOT NULL,                       -- 前8字符明文(用于日志)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT true,
  rate_limit_tier TEXT DEFAULT 'standard',             -- standard/premium
  scopes          TEXT[] DEFAULT ARRAY['payment:read','payment:release']
);

CREATE INDEX idx_api_keys_merchant ON merchant_api_keys(merchant_did) WHERE is_active;
CREATE UNIQUE INDEX idx_api_keys_hash ON merchant_api_keys(key_hash);
```

#### 4.2.2 API Key 格式

```
nak_live_<20 char base62>_<16 char checksum>
nak_test_<20 char base62>_<16 char checksum>

例如: nak_live_3kTyx9j2Lm4Qp6Rn_8hV2Zq1Wc5X
```

- Prefix: `nak` = Nexus API Key
- Environment: `live` | `test`
- Body: 20 字符 base62 编码的随机数
- Checksum: 16 字符 CRC32(body)

#### 4.2.3 API Key 认证流程

```typescript
// Request header:
Authorization: Bearer nak_live_3kTyx9j2Lm4Qp6Rn_8hV2Zq1Wc5X

// Validation:
1. Extract key from Authorization header
2. Validate format (nak_live_xxx_xxx)
3. Compute SHA256(key) → key_hash
4. Query merchant_api_keys WHERE key_hash = ? AND is_active = true
5. Check expiry: expires_at > NOW()
6. Check scope: required_scope IN scopes
7. Rate limit check (tier-based)
8. Update last_used_at (async, non-blocking)
```

### 4.3 费率限制策略

#### 4.3.1 分层限流(Rate Limit Tiers)

| Tier | Requests/min | Burst | 适用场景 |
|------|--------------|-------|---------|
| **Anonymous** | 10/min | 20 | Public 端点(IP-based) |
| **Standard** | 60/min | 120 | Merchant API Key (free tier) |
| **Premium** | 300/min | 600 | Merchant API Key (paid tier) |
| **Internal** | 无限制 | - | Core Operator / Relayer |

#### 4.3.2 实现方案(Token Bucket)

```typescript
// 使用 Redis 或 KV store (已有 kvRepo)
interface RateLimitBucket {
  key: string;               // ip:<IP> | apikey:<key_id> | merchant:<did>
  tokens: number;            // 剩余令牌数
  capacity: number;          // 桶容量(burst size)
  refill_rate: number;       // 令牌补充速率(tokens/sec)
  last_refill: number;       // 上次补充时间戳(ms)
}

// 算法:
function checkRateLimit(key: string, tier: Tier): boolean {
  const bucket = kvRepo.get(`ratelimit:${key}`);
  const now = Date.now();
  const elapsed = (now - bucket.last_refill) / 1000; // seconds
  const refilled = Math.min(bucket.capacity, bucket.tokens + elapsed * tier.refill_rate);

  if (refilled >= 1) {
    bucket.tokens = refilled - 1;
    bucket.last_refill = now;
    kvRepo.set(`ratelimit:${key}`, bucket, { ttl: 300 }); // 5 min TTL
    return true; // Allow
  }
  return false; // Deny
}
```

### 4.4 防重放攻击

#### 4.4.1 Quote 重放保护(已有)

- ✅ `quote_hash` unique constraint in payments table
- ✅ `expiry` timestamp check
- ✅ `merchant_order_ref` uniqueness per merchant

#### 4.4.2 API 请求重放保护(新增)

**方案 1: Nonce + Timestamp(推荐用于 Payer 签名)**

```typescript
// Payer 签名请求示例(Dispute)
POST /api/payments/PAY-xxx/dispute
{
  "reason": "未收到商品",
  "nonce": "0x1234...5678",          // 32 bytes random hex
  "timestamp": 1709712345,           // unix timestamp (seconds)
  "signature": "0xabcd...ef01"       // EIP-712 signature over (payment_id, reason, nonce, timestamp, payer_address)
}

// 验证:
1. Check timestamp: |now - timestamp| < 300 (5 min window)
2. Check nonce: kvRepo.exists(`nonce:${nonce}`) → reject if exists
3. Verify EIP-712 signature (recover payer address)
4. Store nonce: kvRepo.set(`nonce:${nonce}`, 1, { ttl: 600 }) // 10 min TTL
```

**方案 2: Idempotency Key(推荐用于 API Key 请求)**

```typescript
// Merchant 请求示例(Release)
POST /api/payments/PAY-xxx/release
Authorization: Bearer nak_live_xxx
Idempotency-Key: rel_1234567890abcdef  // 客户端生成的唯一标识

// 处理:
1. Check kvRepo.get(`idem:${idempotency_key}`)
   - If exists → return cached response (HTTP 200 with same result)
   - If not exists → proceed
2. Process request (e.g., relayer.submitRelease)
3. Store result: kvRepo.set(`idem:${idempotency_key}`, result, { ttl: 86400 }) // 24h
4. Return result
```

### 4.5 签名机制扩展

#### 4.5.1 EIP-712 Domain 设计(Dispute/Payer Actions)

```typescript
const NEXUS_DISPUTE_DOMAIN = {
  name: "NexusPay",
  version: "1",
  chainId: 20250407,
  verifyingContract: config.escrowContract as Address, // 使用 escrow 合约地址
} as const;

const DISPUTE_TYPES = {
  Dispute: [
    { name: "payment_id", type: "string" },
    { name: "reason", type: "string" },
    { name: "nonce", type: "bytes32" },
    { name: "timestamp", type: "uint256" },
    { name: "payer", type: "address" },
  ],
} as const;
```

#### 4.5.2 HMAC 签名(Webhook 回调,已有)

- ✅ RFC-009 已定义 Webhook HMAC 标准
- 复用相同机制用于 Merchant → Core 的反向调用(confirm-fulfillment)

## 5. RESTful API 设计

### 5.1 端点清单(完整版)

#### 5.1.1 Payment Orchestration

```http
POST /api/orchestrate
Content-Type: application/json
Authorization: Bearer <api_key> (optional, for rate limit upgrade)
Idempotency-Key: <uuid> (optional)

Request:
{
  "quotes": [...],
  "payer_wallet": "0x..."
}

Response (HTTP 402):
{
  "nexus_version": "0.5.0",
  "group_id": "grp_xxx",
  "checkout_url": "https://.../checkout/tok_xxx",
  "instruction": { ... },
  "nexus_group_sig": "0x...",
  "core_operator_address": "0x..."
}

Rate Limit: 10/min (anonymous IP), 60/min (API Key standard)
```

#### 5.1.2 Payment Status

```http
GET /api/payments/:id
  OR
GET /api/payments?group_id=grp_xxx
  OR
GET /api/payments?merchant_order_ref=FLT-123&merchant_did=did:nexus:...

Response (HTTP 200):
{
  "payment": {
    "nexus_payment_id": "PAY-xxx",
    "status": "ESCROWED",
    "amount_display": "0.10",
    "currency": "USDC",
    "merchant_did": "did:nexus:...",
    "merchant_order_ref": "FLT-123",
    "created_at": "2026-02-26T10:00:00Z",
    "escrowed_at": "2026-02-26T10:05:00Z",
    "tx_hash": "0x...",
    "block_number": 12345,
    "payment_id_bytes32": "0x..."
  },
  "group": {
    "group_id": "grp_xxx",
    "status": "GROUP_ESCROWED",
    "total_amount_display": "1.50",
    "payment_count": 3
  },
  "group_payments": [
    { "nexus_payment_id": "PAY-001", "status": "ESCROWED", ... },
    { "nexus_payment_id": "PAY-002", "status": "ESCROWED", ... }
  ]
}

Rate Limit: 60/min (anonymous IP), 300/min (API Key premium)
Auth: Public (无需认证,仅 payment_id 即可查询)
```

#### 5.1.3 Payment Release (Merchant)

```http
POST /api/payments/:id/release
Authorization: Bearer <merchant_api_key>
Idempotency-Key: rel_<uuid>

Request:
{
  "merchant_did": "did:nexus:...",  // 必须匹配 API Key 所属 merchant
  "payment_id": "PAY-xxx"           // 路径参数,也可在 body 重复(验证)
}

Response (HTTP 200):
{
  "status": "release_submitted",
  "tx_hash": "0x...",
  "payment_id": "PAY-xxx",
  "message": "Release submitted — ChainWatcher will transition to SETTLED"
}

Error Cases:
- 401: Invalid API Key
- 403: merchant_did does not match API Key owner
- 404: Payment not found
- 409: Payment status is not ESCROWED
- 429: Rate limit exceeded
- 503: Relayer not configured

Rate Limit: 60/min (standard), 300/min (premium)
Auth: Merchant API Key (scope: payment:release)
Idempotency: 24h cache
```

#### 5.1.4 Payment Dispute (Payer)

```http
POST /api/payments/:id/dispute
Content-Type: application/json

Request:
{
  "payment_id": "PAY-xxx",
  "reason": "商品未收到",
  "nonce": "0x1234...5678",      // 32 bytes hex
  "timestamp": 1709712345,       // unix timestamp
  "payer_address": "0x...",      // 签名者地址(冗余,用于快速验证)
  "signature": "0xabcd...ef01"   // EIP-712 signature
}

Response (HTTP 200):
{
  "status": "dispute_recorded",
  "payment_id": "PAY-xxx",
  "dispute_status": "DISPUTE_OPEN",
  "calldata": "0x...",           // 链上提交的 calldata
  "contract": "0x...",           // escrow contract address
  "message": "Dispute recorded. Payer must submit the calldata on-chain to finalize."
}

Error Cases:
- 400: Invalid signature / nonce / timestamp
- 403: Signature does not match payer_wallet in payment
- 404: Payment not found
- 409: Payment status is not ESCROWED
- 422: Nonce already used (replay)
- 422: Timestamp outside 5-min window

Rate Limit: 10/min (anonymous IP, by payer address)
Auth: EIP-712 Signature (payer must sign)
Replay Protection: Nonce + Timestamp
```

#### 5.1.5 Dispute Resolution (Arbitrator)

```http
POST /api/payments/:id/resolve
Authorization: Bearer <arbitrator_api_key>
Idempotency-Key: res_<uuid>

Request:
{
  "payment_id": "PAY-xxx",
  "merchant_bps": 5000,          // 0-10000 (5000 = 50% to merchant, 50% refund)
  "resolution_reason": "Partial refund — merchant shipped late"
}

Response (HTTP 200):
{
  "status": "resolution_submitted",
  "tx_hash": "0x...",
  "payment_id": "PAY-xxx",
  "merchant_bps": 5000,
  "merchant_receives": "0.05 USDC",
  "payer_receives": "0.05 USDC"
}

Error Cases:
- 401: Invalid API Key
- 403: API Key does not have arbitrator scope
- 404: Payment not found
- 409: Payment status is not DISPUTE_OPEN

Rate Limit: 60/min (arbitrator tier)
Auth: Arbitrator API Key (scope: dispute:resolve)
Idempotency: 24h cache
```

#### 5.1.6 Merchant Discovery

```http
GET /api/agents?query=flight&category=travel&limit=20

Response (HTTP 200):
{
  "agents": [
    {
      "merchant_did": "did:nexus:20250407:demo_flight",
      "name": "Demo Flight Agent",
      "description": "Book flights with USDC",
      "category": "travel.flights",
      "mcp_url": "https://nexus-flight-agent-nr8m.onrender.com/sse",
      "skill_url": "https://nexus-flight-agent-nr8m.onrender.com/skill.md",
      "stars": 42
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}

Rate Limit: 60/min (anonymous IP)
Auth: Public
```

#### 5.1.7 Agent Skill Retrieval

```http
GET /api/agents/:did/skill
  OR
GET /api/agents/did:nexus:20250407:demo_flight/skill

Response (HTTP 200):
Content-Type: text/markdown

# Demo Flight Agent

...skill.md content...

Rate Limit: 60/min (anonymous IP)
Auth: Public
Cache: 5 min CDN cache (skill.md rarely changes)
```

### 5.2 HTTP 状态码规范

| 状态码 | 场景 | 示例 |
|-------|------|------|
| **200 OK** | 成功(GET/POST) | Payment status, Release submitted |
| **201 Created** | 资源创建成功 | (未使用,orchestrate 返回 402) |
| **202 Accepted** | 异步处理已接受 | Checkout confirm (tx pending) |
| **402 Payment Required** | 支付指令返回 | Orchestrate 成功 |
| **400 Bad Request** | 参数错误 | Invalid quote format |
| **401 Unauthorized** | 认证失败 | Invalid API Key |
| **403 Forbidden** | 授权失败 | merchant_did mismatch |
| **404 Not Found** | 资源不存在 | Payment not found |
| **409 Conflict** | 状态冲突 | Payment not ESCROWED |
| **422 Unprocessable** | 验证失败 | Signature invalid, nonce replay |
| **429 Too Many Requests** | 超限 | Rate limit exceeded |
| **500 Internal Error** | 服务器错误 | Database error |
| **503 Service Unavailable** | 服务不可用 | Relayer down |

### 5.3 错误响应格式

```json
{
  "error": {
    "code": "PAYMENT_NOT_FOUND",      // 机器可读错误码
    "message": "Payment PAY-xxx not found",  // 人类可读消息
    "details": {                      // 可选,调试信息
      "payment_id": "PAY-xxx",
      "searched_in": ["payments", "payment_groups"]
    },
    "request_id": "req_abc123",       // 请求追踪 ID
    "timestamp": "2026-02-26T10:00:00Z"
  }
}
```

## 6. 实现方案

### 6.1 代码改动清单

#### 6.1.1 新增文件

```
src/nexus-core/src/
├── auth/
│   ├── api-key.ts            # API Key 生成、验证、管理
│   ├── rate-limiter.ts       # Token bucket 限流器
│   ├── signature-verifier.ts # EIP-712 Payer 签名验证(Dispute)
│   └── middleware.ts         # Express-like 认证中间件
├── rest-api/
│   ├── routes/
│   │   ├── payments.ts       # GET /api/payments/:id, POST /api/payments/:id/release
│   │   ├── disputes.ts       # POST /api/payments/:id/dispute, /resolve
│   │   └── agents.ts         # GET /api/agents, /api/agents/:did/skill
│   ├── handlers/
│   │   ├── payment-status.ts
│   │   ├── payment-release.ts
│   │   ├── payment-dispute.ts
│   │   └── agent-discovery.ts
│   └── router.ts             # 主路由注册
└── db/
    ├── api-key-repo.ts       # MerchantAPIKeyRepository
    └── migrations/
        └── 003_add_api_keys.sql

```

#### 6.1.2 修改文件

```
src/nexus-core/src/
├── server.ts                 # 集成新的 REST router
├── services/
│   ├── orchestrator.ts       # 添加 API Key 可选认证
│   └── security.ts           # 导出 Payer 签名验证
└── types.ts                  # 新增 API Key 相关类型

```

#### 6.1.3 数据库迁移

```sql
-- db/migrations/003_add_api_keys.sql

CREATE TABLE merchant_api_keys (
  api_key_id      TEXT PRIMARY KEY,
  merchant_did    TEXT NOT NULL REFERENCES merchant_registry(merchant_did) ON DELETE CASCADE,
  key_hash        TEXT NOT NULL,
  key_prefix      TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT true,
  rate_limit_tier TEXT DEFAULT 'standard' CHECK (rate_limit_tier IN ('standard', 'premium')),
  scopes          TEXT[] DEFAULT ARRAY['payment:read','payment:release']
);

CREATE INDEX idx_api_keys_merchant ON merchant_api_keys(merchant_did) WHERE is_active;
CREATE UNIQUE INDEX idx_api_keys_hash ON merchant_api_keys(key_hash);

COMMENT ON TABLE merchant_api_keys IS 'Merchant API keys for stateless REST authentication';
COMMENT ON COLUMN merchant_api_keys.key_hash IS 'SHA256 hash of the full API key';
COMMENT ON COLUMN merchant_api_keys.key_prefix IS 'First 8 chars of key_id for logging';
COMMENT ON COLUMN merchant_api_keys.scopes IS 'Permissions: payment:read, payment:release, dispute:resolve';
```

### 6.2 API Key 生成工具

```bash
# CLI tool for merchants
npm run nexus-cli -- create-api-key --merchant did:nexus:20250407:demo_flight --tier standard

# Output:
✅ API Key created successfully

Merchant: did:nexus:20250407:demo_flight
API Key: nak_live_3kTyx9j2Lm4Qp6Rn_8hV2Zq1Wc5X
Tier: standard (60 req/min)
Scopes: payment:read, payment:release
Expires: 2027-02-26 (1 year)

⚠️  Save this key securely — it will not be shown again!
```

### 6.3 认证中间件设计

```typescript
// src/nexus-core/src/auth/middleware.ts

import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyAPIKey } from "./api-key.js";
import { checkRateLimit } from "./rate-limiter.js";

export interface AuthContext {
  merchant_did?: string;
  api_key_id?: string;
  tier: "anonymous" | "standard" | "premium" | "internal";
  scopes: string[];
}

/**
 * Extract and verify API Key from Authorization header.
 * Returns null if no API Key (allow anonymous) or throws if invalid.
 */
export async function authenticateRequest(
  req: IncomingMessage,
): Promise<AuthContext> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    // Anonymous access
    return { tier: "anonymous", scopes: [] };
  }

  const match = authHeader.match(/^Bearer\s+(nak_[a-z]+_[A-Za-z0-9_]+)$/);
  if (!match) {
    throw new Error("Invalid Authorization header format");
  }

  const apiKey = match[1];
  const keyRecord = await verifyAPIKey(apiKey); // throws if invalid

  return {
    merchant_did: keyRecord.merchant_did,
    api_key_id: keyRecord.api_key_id,
    tier: keyRecord.rate_limit_tier as "standard" | "premium",
    scopes: keyRecord.scopes,
  };
}

/**
 * Rate limit middleware.
 */
export async function rateLimitMiddleware(
  req: IncomingMessage,
  auth: AuthContext,
): Promise<void> {
  const key = auth.api_key_id
    ? `apikey:${auth.api_key_id}`
    : `ip:${req.socket.remoteAddress}`;

  const allowed = await checkRateLimit(key, auth.tier);
  if (!allowed) {
    throw { code: "RATE_LIMIT_EXCEEDED", status: 429 };
  }
}

/**
 * Scope validation middleware.
 */
export function requireScope(requiredScope: string) {
  return (auth: AuthContext): void => {
    if (!auth.scopes.includes(requiredScope)) {
      throw {
        code: "INSUFFICIENT_SCOPE",
        message: `Scope '${requiredScope}' required`,
        status: 403,
      };
    }
  };
}
```

### 6.4 路由集成(server.ts)

```typescript
// src/nexus-core/src/server.ts (新增代码片段)

import { createRESTRouter } from "./rest-api/router.js";

// ... (在 main() 函数的 httpServer 内)

// REST API routes (before portal/checkout/market)
const restDeps = {
  paymentRepo,
  merchantRepo,
  groupRepo,
  eventRepo,
  stateMachine,
  relayer,
  config,
  kvRepo,
};
const restHandled = await createRESTRouter(restDeps, req, res, url);
if (restHandled) return;
```

### 6.5 实现优先级

| Phase | 端点 | 工作量 | 依赖 |
|-------|-----|-------|------|
| **Phase 1 (P0)** | `GET /api/payments/:id` | 1d | 基础认证中间件 |
| | `POST /api/payments/:id/release` | 1d | API Key 生成工具 |
| | API Key 生成 CLI | 0.5d | DB migration |
| | Rate Limiter (基础) | 1d | kvRepo |
| **Phase 2 (P1)** | `POST /api/payments/:id/dispute` | 2d | EIP-712 Payer 签名 |
| | Idempotency 支持 | 1d | kvRepo |
| **Phase 3 (P2)** | `POST /api/payments/:id/resolve` | 1d | Arbitrator API Key |
| | `GET /api/agents` | 0.5d | 现有 discover_agents 逻辑 |
| | `GET /api/agents/:did/skill` | 0.5d | 现有 get_agent_skill 逻辑 |
| **Phase 4 (Polish)** | 单元测试(80%+ coverage) | 2d | vitest |
| | E2E 测试(关键流程) | 2d | vitest + 本地链 |
| | OpenAPI 文档生成 | 1d | Swagger/Scalar |

**总工作量估算: 12-14 天**

## 7. skill.md 更新

### 7.1 新增章节: Stateless HTTP API

在现有 skill.md 的 "Connection" 章节下,新增子章节:

```markdown
### HTTP REST (Stateless)

**For LLM tools without SSE support**, all core functionality is available via stateless REST API with Bearer token authentication.

**Base URL:** `https://api.nexus-mvp.topos.one`

#### Authentication

Most endpoints require a Nexus API Key:

```http
Authorization: Bearer nak_live_3kTyx9j2Lm4Qp6Rn_8hV2Zq1Wc5X
```

**Get your API Key:**
1. Contact Nexus team to register your merchant DID
2. Receive API Key via secure channel (email/webhook)
3. Store in environment variable: `NEXUS_API_KEY=nak_live_...`

**Public endpoints** (no API Key required):
- `GET /api/payments/:id` — Payment status
- `GET /api/agents` — Merchant discovery
- `GET /health` — Health check

**Merchant endpoints** (API Key required, scope: `payment:release`):
- `POST /api/payments/:id/release` — Release escrowed funds

**Payer endpoints** (EIP-712 signature required):
- `POST /api/payments/:id/dispute` — Open dispute

#### Rate Limits

| Tier | Requests/min | How to get |
|------|--------------|------------|
| Anonymous (IP-based) | 10/min | No authentication |
| Standard (API Key) | 60/min | Free tier API Key |
| Premium (API Key) | 300/min | Contact Nexus team |

Rate limit headers:
```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1709712400
```

#### Example: Release Payment (Merchant)

```bash
curl -X POST https://api.nexus-mvp.topos.one/api/payments/PAY-xxx/release \
  -H "Authorization: Bearer $NEXUS_API_KEY" \
  -H "Idempotency-Key: rel_$(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"merchant_did": "did:nexus:20250407:demo_flight"}'
```

#### Example: Get Payment Status (Public)

```bash
curl https://api.nexus-mvp.topos.one/api/payments/PAY-xxx
```

**For complete API reference, see:**
- 📖 REST API Docs: `https://api.nexus-mvp.topos.one/docs` (OpenAPI)
- 🔐 Security: All endpoints use HTTPS + Bearer token auth
```

### 7.2 工具描述更新

在每个 MCP 工具的描述中,添加 HTTP 等价端点的说明:

```markdown
### `nexus_get_payment_status`

Check payment status by any identifier.

**HTTP Equivalent:**
```http
GET /api/payments/:id
GET /api/payments?group_id=grp_xxx
GET /api/payments?merchant_order_ref=FLT-123&merchant_did=did:nexus:...
```

No authentication required. Public endpoint.

**Parameters:** ...
```

## 8. 监控与可观测性

### 8.1 新增指标

```typescript
// 在现有 logger 基础上添加
{
  "metric": "api.request",
  "endpoint": "/api/payments/:id/release",
  "method": "POST",
  "status": 200,
  "duration_ms": 42,
  "auth_tier": "standard",
  "merchant_did": "did:nexus:...",
  "idempotency_key": "rel_xxx",
  "is_replay": false,
  "timestamp": "2026-02-26T10:00:00Z"
}

{
  "metric": "api.rate_limit",
  "key": "apikey:nak_xxx",
  "tier": "standard",
  "allowed": false,
  "tokens_remaining": 0,
  "timestamp": "2026-02-26T10:00:01Z"
}

{
  "metric": "api.auth_failure",
  "reason": "invalid_signature",
  "endpoint": "/api/payments/:id/dispute",
  "payer_address": "0x...",
  "payment_id": "PAY-xxx",
  "timestamp": "2026-02-26T10:00:02Z"
}
```

### 8.2 告警规则

| 指标 | 阈值 | 动作 |
|------|------|------|
| `api.auth_failure` rate | > 10/min | Alert (possible attack) |
| `api.rate_limit` hit rate | > 50% requests | Warn (upgrade tier suggestion) |
| `api.request` P95 latency | > 2s | Alert (performance degradation) |
| API Key `last_used_at` | > 90 days | Email reminder to rotate |

## 9. 安全审计清单

### 9.1 发布前检查

- [ ] API Key 生成使用 crypto.randomBytes(32)
- [ ] API Key 存储使用 SHA256 hash(不存明文)
- [ ] Rate limiter 使用分布式锁(防止多实例竞态)
- [ ] Nonce 检查有 TTL(防止无限增长)
- [ ] Timestamp 窗口 <= 5 分钟
- [ ] EIP-712 domain 包含 chainId(防止跨链重放)
- [ ] CORS 仅允许白名单 origin(生产环境)
- [ ] HTTPS 强制(Render 自动提供)
- [ ] 敏感日志脱敏(API Key 仅记录 prefix)
- [ ] Idempotency cache 有 TTL(24h)

### 9.2 渗透测试场景

1. **重放攻击**: 拦截 Dispute 请求,修改 `reason` 后重放 → 应被 nonce 拦截
2. **签名伪造**: 使用错误的 private key 签名 → 应返回 422
3. **跨商户攻击**: Merchant A 的 API Key 尝试 release Merchant B 的 payment → 应返回 403
4. **费率绕过**: 使用多个 IP/API Key 轮换 → 应被分布式限流拦截
5. **Idempotency 污染**: 提交恶意 idempotency key 占用缓存 → 应有 key 格式验证

## 10. 向后兼容性

### 10.1 现有 HTTP 端点保持不变

- ✅ `POST /api/orchestrate` — 继续支持无认证访问(向后兼容)
- ✅ `GET /api/checkout/:token` — 无变化
- ✅ `POST /api/checkout/:token/confirm` — 无变化
- ✅ `POST /api/merchant/confirm-fulfillment` — 无变化(但建议升级到 API Key 认证)

### 10.2 MCP 工具完全保留

所有 9 个 MCP 工具的行为不变,新的 REST API 是平行的访问方式,不影响 MCP 客户端。

### 10.3 迁移路径

```
Phase 1 (当前): MCP (SSE) + HTTP (部分)
Phase 2 (本设计): MCP (SSE) + HTTP (完整) + API Key 认证
Phase 3 (未来): 逐步引导商户从 confirm-fulfillment (merchant_did 认证) 迁移到 API Key 认证
Phase 4 (可选): MCP → gRPC / GraphQL (根据需求)
```

## 11. 开放问题(待讨论)

### 11.1 API Key 颁发流程

**选项 A: 自助生成(推荐)**
- Merchant 通过 Portal UI 自助生成 API Key
- 优点: 快速,无需人工
- 缺点: 需要实现 Portal 认证(OAuth/DID Login)

**选项 B: 人工颁发**
- Merchant 联系 Nexus 团队,人工审核后发放
- 优点: 简单,安全
- 缺点: 不可扩展

**建议**: MVP 阶段使用选项 B,Portal UI 成熟后升级到选项 A。

### 11.2 Payer 认证方式

**当前设计**: EIP-712 签名(用户钱包签名)
**替代方案**: 用户也可申请 API Key(如果是程序化交易)

**建议**: 保持 EIP-712 作为主要方式,API Key 作为高级功能(企业用户)。

### 11.3 Arbitrator 身份

**当前设计**: Arbitrator 持有特殊 API Key(scope: `dispute:resolve`)
**问题**: MVP 阶段 Arbitrator 是谁?

**建议**: MVP 使用 Core Operator 私钥(即 relayer)作为 Arbitrator,后续升级为 DAO 多签。

## 12. 总结

### 12.1 核心优势

✅ **完全 Stateless**: 无 SSE 依赖,兼容所有 LLM 工具平台
✅ **安全等效**: API Key + EIP-712 签名 + Nonce + Rate Limit 达到与 MCP 相同的安全级别
✅ **向后兼容**: 现有 MCP 和 HTTP 端点完全不受影响
✅ **渐进式实现**: 分 4 个 Phase,可独立发布
✅ **LLM 友好**: RESTful 设计易于 LLM 理解和调用

### 12.2 实施建议

1. **优先级**: P0(Payment Status + Release) → P1(Dispute) → P2(Discovery) → Polish
2. **时间线**: 预计 2-3 周完成 P0-P2,1 周完成 Polish
3. **测试**: 每个 Phase 必须包含单元测试 + E2E 测试
4. **文档**: 使用 OpenAPI 3.0 自动生成文档,集成到 Portal

### 12.3 下一步行动

1. Review 本设计文档,确认安全架构和 API 设计
2. 创建数据库迁移(003_add_api_keys.sql)
3. 实现 API Key 生成工具 + 认证中间件
4. 实现 Phase 1 端点(Payment Status + Release)
5. 更新 skill.md + 集成测试
6. 发布 v0.6.0(含 Stateless API Beta)

---

**Copyright (c) 2026 Nexus Protocol. All Rights Reserved.**
