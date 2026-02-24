# Nexus Skill Market 调研报告

| 元数据 | 内容 |
| --- | --- |
| **状态** | 调研完成，待下一阶段设计 |
| **日期** | 2026-02-24 |
| **优先级** | Phase 2（Core 完成后启动） |
| **参考** | SkillsMP, Anthropic SKILL.md 标准, Mintlify skill.md |

---

## 一、竞品分析：SkillsMP

### 1.1 产品概述

[SkillsMP](https://skillsmp.com) 是一个独立社区项目（非 Anthropic 官方），聚合了 270,000+ Agent Skills，兼容 Claude Code、Codex CLI 和 ChatGPT。

### 1.2 核心特性

| 特性 | 详情 |
| --- | --- |
| 技能标准 | Anthropic SKILL.md 开放标准 |
| 安装方式 | 文件复制到 `~/.claude/skills/` 或 `~/.codex/skills/` |
| 发现机制 | 语义搜索 + 分类过滤 + 热度排名 |
| 质量门控 | GitHub 最低 2 star 过滤，开源可审计 |
| MCP 集成 | 提供 MCP Server，AI Agent 可直接搜索/安装技能 |
| 跨平台 | Claude Code / Codex CLI / ChatGPT 三平台兼容 |

### 1.3 分类体系（13 类）

Tools, Development, Data & AI, Business, DevOps, Testing & Security, Documentation, Content & Media, Lifestyle, Research, Databases, Blockchain, General Utilities

### 1.4 SKILL.md 标准结构

```
my-skill/
├── SKILL.md          # 核心指令文件（frontmatter + markdown）
├── scripts/          # 可执行脚本（Python/Bash）
├── references/       # 加载到上下文的参考文档
└── assets/           # 模板和二进制文件
```

- **Frontmatter**：配置技能运行方式（权限、模型、元数据）
- **Content**：告诉 AI 做什么（指令、决策表、边界、常见错误）
- **触发方式**：Model-invoked（AI 根据上下文自动激活，非用户手动调用）

### 1.5 发现协议

- 标准路径：`/.well-known/skills/default/skill.md`
- 安装命令：`npx skills add https://example.com/docs`
- Mintlify 等文档平台可自动生成 skill.md

### 1.6 商业模式

SkillsMP 当前为开源社区项目，无直接收入模式。技能由 GitHub 仓库托管，平台定期爬取同步。

---

## 二、NexusPay Skill Market 定位

### 2.1 核心差异

| 维度 | SkillsMP | NexusPay Skill Market |
| --- | --- | --- |
| 定位 | 通用开发者技能市场 | **支付场景的商业技能市场** |
| 技能类型 | 代码生成、测试、文档等开发技能 | 零售、酒旅、餐饮等**有交易闭环**的商业技能 |
| 标准 | Anthropic SKILL.md（开发指令） | NMSS skill.md（MCP tools + NUPS 支付协议） |
| 核心能力 | 让 AI 写更好的代码 | 让 AI **完成一笔真实的链上交易** |
| 质量门槛 | GitHub 2 star 最低过滤 | DID 验证 + 支付合约验证 + Webhook 可达性测试 |
| 盈利模式 | 开源社区，无直接收入 | **交易手续费 + 商户认证费 + 技能开发外包** |
| 安装方式 | 文件复制到本地目录 | MCP SSE 远程连接（无需本地文件） |
| 技能触发 | AI 自动激活 | AI 自动激活 + 用户意图匹配 |

### 2.2 价值主张

> SkillsMP 解决 "AI 怎么工作"，NexusPay Skill Market 解决 **"AI 怎么花钱"**。

每个上架的 Skill 都内嵌 Nexus 支付能力，不是简单的指令文件，而是一个完整的**商业交易单元**。

---

## 三、产品形态设计（草案）

### 3.1 供给侧（商户）

- 标准化 Skill 开发模板 + 脚手架工具（`create-nexus-skill`）
- 商户只需提供商品目录 / API，NexusPay 帮助封装成支付 Skill
- 认证体系：DID 注册 → 支付能力验证 → Webhook 测试通过 → 上架
- 技能开发外包服务（NexusPay 团队或认证开发者）

### 3.2 需求侧（User Agent）

- 分类浏览 + 搜索 API（`GET /api/skills?category=travel.flights`）
- 一键获取 MCP config JSON，复制到 Claude Desktop / Cursor 即可用
- Agent 自主发现模式：User Agent 通过 API 自动查询市场，按需连接新商户

### 3.3 平台侧（NexusPay）

- 每笔交易手续费（NexusPay Core 层收取）
- 商户 Skill 开发外包服务费
- Premium listing / 推荐位
- 商户数据分析面板

### 3.4 分类体系（初步）

| 分类 | 示例场景 |
| --- | --- |
| travel.flights | 机票预订 |
| travel.hotels | 酒店预订 |
| travel.activities | 景点门票、旅游活动 |
| food.delivery | 外卖配送 |
| food.restaurant | 餐厅预订 |
| retail.ecommerce | 电商购物 |
| retail.grocery | 生鲜杂货 |
| entertainment.tickets | 演出/电影票 |
| finance.transfer | 转账汇款 |
| services.subscription | 订阅服务 |
| services.freelance | 自由职业服务 |

---

## 四、实施路径

### Phase 1 — 静态 Registry（Core 完成后可立即启动）

- Nexus 官网上的一个页面，展示已注册的 merchant skill
- Skill 卡片：名称、描述、分类、支持币种、交易量
- 一键复制 MCP config JSON
- 数据源：各 merchant 的 `/skill.md` 端点，定期抓取

### Phase 2 — 动态 Discovery

- 商户自助注册（提交 SSE endpoint，Nexus 自动拉取 skill.md 验证）
- 搜索 API：User Agent 可通过 API 发现新技能
- 安装量、评分、交易量等排名
- Nexus Core 验证商户身份（DID 绑定）

### Phase 3 — Autonomous Agent Discovery

- User Agent 自动查询 Market API
- 根据用户需求动态发现并连接新的 merchant skill
- 无需人工安装，agent 自主决策接入哪些 skill
- AI 推荐引擎：基于用户历史行为推荐商户

---

## 五、商业闭环

```
Merchant 开发 Skill
       ↓
发布到 Skill Market（通过认证）
       ↓
User Agent 发现 & 安装
       ↓
用户下单 → Nexus Core 处理支付
       ↓
交易手续费 → NexusPay 收入
```

**网络效应**：商户越多 → User Agent 越有用 → 用户越多 → 商户越想接入

---

## 六、参考资料

- [SkillsMP - Agent Skills Marketplace](https://skillsmp.com)
- [skill.md: An open standard for agent skills - Mintlify](https://www.mintlify.com/blog/skill-md)
- [SkillsMP Complete Guide 2026](https://smartscope.blog/en/blog/skillsmp-marketplace-guide/)
- [SkillsMP: The Open Marketplace](https://www.vibesparking.com/en/blog/ai/skillsmp/2025-12-24-skillsmp-agent-skills-marketplace/)
- [Anthropic Skills Repository](https://github.com/anthropics/skills)
- [RFC-008: NMSS - Nexus Merchant Skill Standard](../rfcs/RFC-008-NMSS.md)
