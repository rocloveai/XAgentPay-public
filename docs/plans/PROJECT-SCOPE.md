# xXAgent Pay - Project Scope & Directory Structure

## Project Goal

基于 XAgent Pay RFC 规范，构建 Agent-to-Agent 支付系统的可运行 Demo。

### 开发优先级

1. **Merchant Agent Demo** - 独立的商户 Agent 服务
   - 对接外部 MCP 获取真实商品信息和报价
   - 实现 RFC-003 定义的 SignQuote / VerifyReceipt 技能
   - 通过 MCP Server 暴露支付能力

2. **User Agent Skills** - 提供给 OpenClaw 的 Skill 文件
   - 实现 NBSS 标准的三个核心 Skill
   - PreparePayment / ExecutePayment / TrackOrder
   - 让 UA 能发现商品并完成支付

3. **XAgent Pay Core** - 支付编排核心 (后续)
4. **Smart Contracts** - 链上合约 (后续)

## Directory Structure

```
XAgent Paypay/
├── docs/
│   ├── rfcs/                    # RFC 原始文档 (已完成)
│   ├── plans/                   # 实现计划
│   │   └── PROJECT-SCOPE.md     # 本文件
│   └── architecture/            # 架构设计
│       └── SYSTEM-OVERVIEW.md   # 系统总览
│
├── src/
│   ├── merchant-agent/          # Merchant Agent Demo 服务
│   │   ├── (server)             # MCP Server + 业务逻辑
│   │   ├── (mcp-clients)        # 对接外部商品 MCP
│   │   └── (tools)              # nexus_generate_quote 等工具实现
│   │
│   ├── nexus-core/              # XAgent Payment Core (后续)
│   │   ├── (orchestrator)       # 编排引擎
│   │   └── (state-machine)      # 订单状态机
│   │
│   ├── skills/                  # User Agent Skill 文件
│   │   └── (buyer-skills)       # @nexus/buyer-skills 实现
│   │
│   └── contracts/               # 智能合约 (后续)
│       ├── (XAgent PayMerchantRegistry)
│       ├── (XAgent PayRouter)
│       └── (XAgent PayRiskController)
│
├── .gitignore
└── package.json                 # (待创建)
```

## External MCP Integration

Merchant Agent 需要对接的外部 MCP 数据源：
- 商品目录和库存查询
- 实时价格/报价获取
- 订单状态同步

## Tech Stack (Proposed)

- Runtime: Node.js / TypeScript
- MCP: @modelcontextprotocol/sdk
- Crypto: viem (EIP-712 签名)
- Agent Framework: 待定 (Genkit / LangChain / 自研)
