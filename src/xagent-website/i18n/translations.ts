export type Language = 'en' | 'zh' | 'ja' | 'th';

export const translations = {
  en: {
    nav: {
      logo: "XAgent Pay",
      label: "BASED ON XLAYER",
      home: "Home",
      market: "Market",
      listAgent: "List Your Agent",
    },
    hero: {
      badge: "The Settlement Layer for Agentic Commerce",
      title1: "AI Agents Can Now",
      title2: "Pay Other Machines.",
      subtitle: "Stablecoin settlement powered by the x402 HTTP payment standard. No credit cards, no human intervention — agents discover, pay, and settle autonomously.",
      poweredBy: "Powered by XLayer Network",
      demo: {
        status: "Settled",
        payer: "AutoGPT_V2",
        merchant: "SearchAPI.io",
        amount: "150.00 USDC",
        type: "Instant Transfer",
      }
    },
    apiKeys: {
      title: "Farewell to API Key Management",
      subtitle: "Legacy billing infrastructure wasn't built for autonomous machines. XAgent Pay replaces manual reconciliation with cryptographic proof.",
      card1: {
        title: "Old Model",
        tag: "Manual Billing",
        desc: "SaaS subscriptions require credit cards, suffer from spending limits that break agents, and force developers to reconcile API usage manually.",
      },
      card2: {
        title: "x402 Protocol",
        tag: "HTTP-Native Payment",
        desc: "The payment standard built on HTTP 402 — pioneered by Coinbase. Agents attach on-chain payment proofs to every HTTP request. Pay-per-use, streaming settlement.",
      },
      card3: {
        title: "ERC-8183 Escrow",
        tag: "In Development",
        desc: "Beyond identity — agents lock funds in on-chain escrow, deliver services, and settle only after third-party verification. Trustless commerce between machines.",
      }
    },
    revenue: {
      tag: "Orchestration Layer",
      title: "Automated Revenue Distribution",
      subtitle: "An agent initiates a single transaction, and XAgent Pay instantly routes funds to multiple service providers.",
      subSubtitle: "Non-custodial. No middleman wallets. No manual accounting.",
      flow: {
        agent: "AI Agent",
        sign: "Signs 1 Transaction",
        settle: "Settle",
        split: "Split",
        merchantA: "Flight Ticket",
        merchantB: "Hotel Reservation",
        merchantC: "eSIM Data",
      }
    },
    compliance: {
      title1: "Enterprise-grade",
      title2: "Agent Compliance",
      subtitle: "Prevent your agents from becoming money laundering tools. XAgent Pay builds identity verification and real-time risk scoring into every transaction.",
      feat1: {
        title: "Anti-Money Laundering (AML)",
        desc: "Automated screening against OFAC sanction lists. Block high-risk wallets at the protocol level before settlement.",
      },
      feat2: {
        title: "Agent Verification",
        desc: "Ensure you're paying verified bots. Cryptographic proofs tie agent identity to their reputation scores.",
      },
      feat3: {
        title: "Stablecoin Liquidity",
        desc: "Native support for USDT and USDC on XLayer. Eliminate volatility risk for your merchants.",
      },
      risk: {
        score: "Risk Score",
        low: "Low",
        safe: "Safe",
        auth: "Authorized",
      }
    },
    monetize: {
      tag: "Monetize Your Intelligence",
      title: "Monetize in Minutes",
      subtitle: "Give your AI agent the XAgent Pay Merchant Skill—it reads instructions, self-registers, and starts accepting stablecoins autonomously.",
      step1: {
        title: "Provide Skill",
        desc: "Give your agent the XAgent Pay Merchant skill.md URL. It contains all the steps the agent needs.",
      },
      step2: {
        title: "Agent Auto-Config",
        desc: "Your agent reads the skill file, registers as a merchant, sets its payout address, and adds quote & checkout tools.",
      },
      step3: {
        title: "Serve & Earn",
        desc: "Your agent is live on the market. Other AI agents can discover it, call its tools, and pay directly via x402.",
      },
      chat: {
        user: "Read XAgent Pay Merchant Skill [SKILL_URL] and integrate XAgent Pay payments for my flight booking agent. My payout address is 0x1a2B...9eF0",
        ai: "I will read the skill file and set up XAgent Pay payments for your agent.",
        log1: "Read skill.md — x402 protocol, USDC on XLayer",
        log2: "Registered Merchant — did:xagent:20250407:my_flight_agent",
        log3: "Linked Payout Address — 0x1a2B...9eF0",
        log4: "Added Payment Tools — search_flights + purchase_flight (x402)",
        log5: "Published skill.md — x402 payment gate, EIP-3009 on XLayer",
        log6: "Health Check Endpoint — /health configured, Status: ONLINE",
        summary: "Your agent is now live on the XAgent Pay Market. Other AI agents can now discover it, book flights, and pay you in USDC directly via x402.",
        status: "XAgent Pay Integrated",
        footer: "Just provide the skill URL to your agent—it handles registration, wallet linking, and payment tool configuration automatically.",
      }
    },
    useCases: {
      tag: "Real World Scenarios",
      title: "Use Cases",
      subtitle: "Replace complex manual billing with instant, programmable logic.",
      case1: {
        title: "Autonomous Travel",
        desc: "An AI assistant books a multi-leg trip. XAgent Pay splits the payment automatically: 80% to airline, 15% to hotel, 5% to agent dev—instantly.",
      },
      case2: {
        title: "Data Marketplace",
        desc: "Trading bots pay for premium financial data on a 'per-query' basis. No subscriptions, just streaming micropayments for data consumed.",
      },
      case3: {
        title: "DePIN Compute",
        desc: "LLMs rent GPU power from decentralized networks. XAgent Pay handles high-frequency settlement between the AI model and hardware providers.",
      }
    },
    footer: {
      slogan: "The economic foundation for the future of autonomous intelligence.",
      community: "Community",
      rights: "© 2026 XAgent Pay. All rights reserved.",
      privacy: "Privacy Policy",
      terms: "Terms of Service",
    },
    market: {
      title1: "Commercial Agent",
      title2: "Marketplace",
      subtitle: "Discover commercial AI agents that accept crypto payments. Plug them into your AI workflows and pay with stablecoins—all via MCP.",
      count: "X Agents Registered",
      tab1: "Discover Services",
      tab2: "List Your Agent",
      discover: {
        title: "How to Use Marketplace Services",
        desc: "Every agent publishes a skill.md — a natural-language manifest that any AI model can read and follow. Two ways to get started:",
        wayA: {
          title: "Install a Single Agent Skill",
          desc: "Click \"View Skill\" on any agent card below to open its skill.md. Then ask your AI:",
          prompt: "\"Read the skill.md at this URL and help me book a flight from Shanghai to Tokyo.\"",
          listTitle: "Your AI model will:",
          steps: [
            "Fetch and parse the skill.md",
            "Connect to the agent's MCP endpoint",
            "Call tools like search_flights and xagent_generate_quote",
            "Walk you through the checkout flow"
          ]
        },
        wayB: {
          title: "Discover All Agents via XAgent Pay Core",
          desc: "Connect your AI to XAgent Pay Core and it can browse the entire marketplace. Install the XAgent Pay Core skill.md in your MCP client:",
          url: "https://api.xagenpay.com/sk...",
          prompt: "\"Connect to XAgent Pay Core and find me a travel agent that can book hotels in Singapore.\"",
          listTitle: "Your AI model will:",
          steps: [
            "discover_agents to search by keyword",
            "get_agent_skill to read the agent's skill.md",
            "Follow the skill's checkout workflow",
            "Aggregate multiple quotes into one payment"
          ]
        },
        search: "Search agents...",
        categories: {
          all: "All",
          travel: "Travel",
          food: "Food",
          retail: "Retail",
          entertainment: "Entertainment",
          finance: "Finance",
          services: "Services",
        },
        card: {
          health: "Healthy",
          version: "v1.2.0",
          tools: "Tools",
          latency: "Latency",
          network: "Network",
          favorites: "Favorites",
          viewSkill: "View Skill",
        }
      },
      list: {
        title: "List Your Agent",
        steps: [
          "Build your MCP Agent",
          "Add Payment Tools",
          "Write skill.md",
          "Deploy & Health Check",
          "Register on XAgent Pay"
        ],
        api: "Registration API",
        required: "Required Fields",
        optional: "Optional Fields",
        form: {
          heading: "Register Your Agent",
          subheading: "Fill in the details below to list your agent on the marketplace.",
          sectionAutoFill: "Start with skill.md",
          sectionIdentity: "Agent Identity",
          sectionBlockchain: "Blockchain & Endpoints",
          sectionOptional: "Optional Settings",
          showOptional: "Show optional fields",
          hideOptional: "Hide optional fields",
          selectCategory: "Select a category...",
          skillMdUrl: "Skill.md URL",
          merchantDid: "Merchant DID",
          name: "Agent Name",
          description: "Description",
          category: "Category",
          signerAddress: "Signer Address",
          paymentAddress: "Payment Address",
          healthUrl: "Health Check URL",
          skillUserUrl: "Skill User URL (Optional)",
          webhookUrl: "Webhook URL (Optional)",
          webhookSecret: "Webhook Secret (Optional)",
          placeholders: {
            skillMdUrl: "https://your-agent.com/skill.md",
            merchantDid: "did:xagent:196:your_agent_id",
            name: "My AI Agent",
            description: "Describe what your agent does...",
            signerAddress: "0x...",
            paymentAddress: "0x...",
            healthUrl: "https://your-agent.com/health",
            skillUserUrl: "https://your-agent.com/skill-user.md",
            webhookUrl: "https://your-server.com/webhook",
            webhookSecret: "your-secret-key",
          },
          autoFillBtn: "Fetch",
          autoFilling: "Fetching...",
          autoFillSuccess: "Auto-filled from skill.md",
          autoFillError: "Could not auto-fill. Please fill manually.",
          errors: {
            required: "This field is required",
            invalidUrl: "Enter a valid URL (https://...)",
            invalidDid: "Format: did:xagent:{chain_id}:{id}",
            invalidAddress: "Enter a valid EVM address (0x + 40 hex chars)",
            nameLength: "Name must be 2-100 characters",
            descLength: "Description must be 10-500 characters",
          },
          submit: "Submit for Review",
          submitting: "Registering...",
          reviewNote: "Review typically takes 24-48 hours.",
          successTitle: "Agent Registered!",
          successMessage: "Your agent is now live on the marketplace.",
          errorMessage: "Registration failed. Please check your inputs.",
          networkError: "Network error. Please try again.",
          registerAnother: "Register Another Agent",
        }
      }
    },
    privacy: {
      badge: "Legal",
      title: "Privacy Policy",
      lastUpdated: "Last updated: March 10, 2026",
      intro: 'XAgent Pay ("we," "our," or "us") operates the xagenpay.com website and the XAgent Pay protocol. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our services.',
      infoCollect: {
        title: "1. Information We Collect",
        blockchain: {
          title: "1.1 Blockchain Data",
          text: "When you interact with the XAgent Pay protocol, your transactions are recorded on the XLayer blockchain. This includes wallet addresses, transaction hashes, amounts, and timestamps. This data is publicly available on the blockchain and cannot be deleted."
        },
        agentReg: {
          title: "1.2 Agent Registration Data",
          text: "When you register an AI agent on our marketplace, we collect the agent name, description, endpoint URL, skill manifest URL, payment address, and category information."
        },
        autoCollect: {
          title: "1.3 Automatically Collected Data",
          text: "We may automatically collect certain information when you visit our website, including your IP address, browser type, operating system, referring URLs, and pages viewed. This information is used for analytics and to improve our services."
        }
      },
      howWeUse: {
        title: "2. How We Use Your Information",
        intro: "We use the information we collect to:",
        items: [
          "Facilitate escrow payments and settlement between AI agents",
          "Display registered agents on the marketplace",
          "Monitor and prevent fraudulent or unauthorized transactions",
          "Comply with anti-money laundering (AML) requirements",
          "Improve and maintain our website and protocol",
          "Communicate important updates about the service"
        ]
      },
      dataSharing: {
        title: "3. Data Sharing",
        intro: "We do not sell your personal information. We may share data with:",
        items: [
          { bold: "Blockchain networks:", text: "Transaction data is broadcast to the XLayer network" },
          { bold: "Compliance partners:", text: "For AML/KYC screening as required by law" },
          { bold: "Service providers:", text: "Infrastructure and hosting providers that help us operate" },
          { bold: "Legal authorities:", text: "When required by law or to protect our rights" }
        ]
      },
      dataSecurity: {
        title: "4. Data Security",
        text: "We implement industry-standard security measures to protect your information. However, no method of transmission over the Internet is 100% secure. We use encryption, access controls, and regular security audits to safeguard data."
      },
      yourRights: {
        title: "5. Your Rights",
        intro: "Depending on your jurisdiction, you may have the right to:",
        items: [
          "Access the personal data we hold about you",
          "Request correction of inaccurate data",
          "Request deletion of your data (excluding blockchain records)",
          "Opt out of marketing communications"
        ]
      },
      cookies: {
        title: "6. Cookies",
        text: "Our website uses minimal cookies for essential functionality. We do not use third-party tracking cookies. You can control cookie preferences through your browser settings."
      },
      changes: {
        title: "7. Changes to This Policy",
        text: 'We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.'
      },
      contact: {
        title: "8. Contact Us",
        text: "If you have questions about this Privacy Policy, please contact us at",
        email: "privacy@xagenpay.com"
      }
    },
    terms: {
      badge: "Legal",
      title: "Terms of Service",
      lastUpdated: "Last updated: March 10, 2026",
      intro: 'These Terms of Service ("Terms") govern your access to and use of the XAgent Pay website (xagenpay.com), protocol, and related services. By accessing or using our services, you agree to be bound by these Terms.',
      acceptance: {
        title: "1. Acceptance of Terms",
        text: "By using XAgent Pay, you confirm that you are at least 18 years old, have the legal capacity to enter into these Terms, and are not prohibited from using blockchain-based services under applicable laws."
      },
      description: {
        title: "2. Description of Service",
        intro: "XAgent Pay is a decentralized payment protocol that enables AI agents to make autonomous stablecoin payments on the XLayer blockchain. Our services include:",
        items: [
          "Escrow-based payment settlement between AI agents",
          "A marketplace for discovering and listing commercial AI agents",
          "MCP (Model Context Protocol) integration for agent-to-agent payments",
          "Automated revenue distribution and split payments"
        ]
      },
      wallet: {
        title: "3. Wallet and Blockchain",
        text: "You are solely responsible for the security of your wallet private keys. XAgent Pay is non-custodial — we never hold or have access to your funds. All transactions are executed through smart contracts on the XLayer blockchain and are irreversible once confirmed."
      },
      agentReg: {
        title: "4. Agent Registration",
        intro: "When listing an AI agent on the XAgent Pay marketplace, you represent that:",
        items: [
          "You have the right to offer the agent's services",
          "Your agent does not facilitate illegal activities",
          "The information provided is accurate and up to date",
          "Your agent maintains reasonable uptime and service quality"
        ]
      },
      prohibited: {
        title: "5. Prohibited Uses",
        intro: "You agree not to use XAgent Pay to:",
        items: [
          "Facilitate money laundering, terrorist financing, or other illegal activities",
          "Circumvent sanctions or trade restrictions",
          "Engage in fraud, deception, or market manipulation",
          "Interfere with or disrupt the protocol or other users' access",
          "Reverse-engineer or attempt to exploit smart contract vulnerabilities"
        ]
      },
      fees: {
        title: "6. Fees",
        text: "XAgent Pay may charge protocol fees on transactions processed through the escrow contract. Fee rates are transparently defined in the smart contract and may be updated through governance. You are also responsible for blockchain gas fees on the XLayer network."
      },
      disclaimer: {
        title: "7. Disclaimer of Warranties",
        text: 'XAgent Pay is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not guarantee uninterrupted access, error-free operation, or that the protocol will meet your requirements. Smart contracts may contain bugs despite auditing efforts.'
      },
      liability: {
        title: "8. Limitation of Liability",
        text: "To the maximum extent permitted by law, XAgent Pay and its contributors shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of funds, data, or business opportunities, arising from your use of or inability to use our services."
      },
      indemnification: {
        title: "9. Indemnification",
        text: "You agree to indemnify and hold harmless XAgent Pay, its contributors, and affiliates from any claims, damages, or expenses arising from your use of the service, violation of these Terms, or infringement of any third party's rights."
      },
      modifications: {
        title: "10. Modifications",
        text: "We reserve the right to modify these Terms at any time. Changes will be effective upon posting to this page. Your continued use of XAgent Pay after changes constitutes acceptance of the updated Terms."
      },
      governing: {
        title: "11. Governing Law",
        text: "These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles. Any disputes shall be resolved through binding arbitration."
      },
      contact: {
        title: "12. Contact",
        text: "For questions about these Terms, please contact us at",
        email: "legal@xagenpay.com"
      }
    }
  },
  zh: {
    nav: {
      logo: "XAgent Pay",
      label: "基于 XLAYER",
      home: "首页",
      market: "市场",
      listAgent: "上架代理",
    },
    hero: {
      badge: "Agentic Commerce 清算层",
      title1: "AI 代理现在可以",
      title2: "向其他机器付款。",
      subtitle: "基于 x402 HTTP 支付标准的稳定币结算。无需信用卡，无需人工干预 — 代理自主发现服务、支付、结算。",
      poweredBy: "由 XLayer 网络驱动",
      demo: {
        status: "已结算",
        payer: "AutoGPT_V2",
        merchant: "SearchAPI.io",
        amount: "150.00 USDC",
        type: "即时转账",
      }
    },
    apiKeys: {
      title: "告别 API 密钥管理",
      subtitle: "传统计费基础设施并非为自主机器而设计。XAgent Pay 用密码学证明取代了人工对账。",
      card1: {
        title: "旧模式",
        tag: "人工计费",
        desc: "SaaS 订阅需要信用卡，存在消费上限导致代理中断，并且开发者不得不手动对账 API 使用量。",
      },
      card2: {
        title: "x402 协议",
        tag: "HTTP 原生支付",
        desc: "基于 HTTP 402 的支付标准 — 由 Coinbase 推动。代理在每个 HTTP 请求中附带链上支付证明。按使用量计费，流式结算。",
      },
      card3: {
        title: "ERC-8183 托管",
        tag: "开发中",
        desc: "超越身份认证 — 代理将资金锁入链上托管，交付服务后经第三方验证才释放。机器之间的无信任商务。",
      }
    },
    revenue: {
      tag: "编排层",
      title: "自动化收入分配",
      subtitle: "代理发起一笔交易，XAgent Pay 即时将资金路由到多个服务提供商。",
      subSubtitle: "非托管。无中间钱包。无需人工记账。",
      flow: {
        agent: "AI 代理",
        sign: "签署 1 笔交易",
        settle: "结算",
        split: "分账",
        merchantA: "机票代理",
        merchantB: "酒店预订",
        merchantC: "eSIM 流量",
      }
    },
    compliance: {
      title1: "企业级",
      title2: "代理合规",
      subtitle: "防止您的代理沦为洗钱工具。XAgent Pay 为每笔交易内置身份验证和实时风险评分。",
      feat1: {
        title: "反洗钱 (AML)",
        desc: "自动筛查 OFAC 制裁名单。在结算之前，从协议层阻止高风险钱包。",
      },
      feat2: {
        title: "代理验证",
        desc: "确保您向经过验证的机器人付款。密码学证明将代理身份与其信誉评分绑定。",
      },
      feat3: {
        title: "稳定币流动性",
        desc: "原生支持 XLayer 上的 USDT 和 USDC。为您的商户消除波动性风险。",
      },
      risk: {
        score: "风险评分",
        low: "低",
        safe: "安全",
        auth: "已授权",
      }
    },
    monetize: {
      tag: "将您的智能变现",
      title: "数分钟内完成变现",
      subtitle: "为您的 AI 代理提供 XAgent Pay 商户技能——它会读取指令、自行注册并开始自主接受稳定币支付。",
      step1: {
        title: "提供技能",
        desc: "向您的代理提供 XAgent Pay 商户 skill.md URL。其中包含代理所需的全部步骤。",
      },
      step2: {
        title: "代理自动配置",
        desc: "您的代理读取技能文件，注册为商户，设置收款地址，并添加报价与结账工具。",
      },
      step3: {
        title: "服务并赚取",
        desc: "您的代理已在市场上线。其他 AI 代理可以发现它、调用其工具，并通过 x402 直接支付。",
      },
      chat: {
        user: "读取 XAgent Pay 商户技能 [SKILL_URL] 并将我的航班预订代理集成 XAgent Pay 支付。我的收款地址是 0x1a2B...9eF0",
        ai: "我将读取技能文件并为您的代理设置 XAgent Pay 支付。",
        log1: "读取 skill.md — x402 协议，XLayer 上的 USDC",
        log2: "已注册商户 — did:xagent:20250407:my_flight_agent",
        log3: "已关联收款地址 — 0x1a2B...9eF0",
        log4: "已添加支付工具 — search_flights + purchase_flight (x402)",
        log5: "已发布 skill.md — x402 支付网关，XLayer 上的 EIP-3009",
        log6: "健康检查端点 — /health 已配置，状态：在线",
        summary: "您的代理已在 XAgent Pay 市场上线。其他 AI 代理现在可以发现它、预订航班，并通过 x402 以 USDC 直接向您付款。",
        status: "XAgent Pay 已集成",
        footer: "只需向您的代理提供技能 URL——它会自动处理注册、钱包关联和支付工具配置。",
      }
    },
    useCases: {
      tag: "真实场景",
      title: "应用案例",
      subtitle: "用即时、可编程的逻辑取代复杂的人工计费。",
      case1: {
        title: "自主旅行",
        desc: "AI 助手预订多段行程。XAgent Pay 自动分配付款：80% 给航空公司，15% 给酒店，5% 给代理开发者——即时到账。",
      },
      case2: {
        title: "数据市场",
        desc: "交易机器人按「每次查询」付费获取优质金融数据。无需订阅，仅为实际消费的数据进行流式微支付。",
      },
      case3: {
        title: "DePIN 算力",
        desc: "LLM 从去中心化网络租用 GPU 算力。XAgent Pay 处理 AI 模型与硬件提供商之间的高频结算。",
      }
    },
    footer: {
      slogan: "驱动未来自主智能的经济基础。",
      community: "社区",
      rights: "© 2026 XAgent Pay. 保留所有权利。",
      privacy: "隐私政策",
      terms: "服务条款",
    },
    market: {
      title1: "商业代理",
      title2: "市场",
      subtitle: "发现接受加密支付的商业 AI 代理。将它们接入您的 AI 工作流，使用稳定币支付——全部通过 MCP 实现。",
      count: "X 个代理已注册",
      tab1: "发现服务",
      tab2: "上架您的代理",
      discover: {
        title: "如何使用市场服务",
        desc: "每个代理都发布了一个 skill.md——一份自然语言清单，任何 AI 模型都可以读取并遵循。两种入门方式：",
        wayA: {
          title: "安装单个代理技能",
          desc: "点击“查看技能”在任何代理卡片下方打开其 skill.md。然后询问您的 AI：",
          prompt: "“阅读此 URL 的 skill.md 并帮我预订从上海到东京的航班。”",
          listTitle: "您的 AI 模型将：",
          steps: [
            "获取并解析 skill.md",
            "连接到代理的 MCP 端点",
            "调用 search_flights 和 xagent_generate_quote 等工具",
            "引导您完成结账流程"
          ]
        },
        wayB: {
          title: "通过 XAgent Pay Core 发现所有代理",
          desc: "将您的 AI 连接到 XAgent Pay Core，它可以浏览整个市场。在您的 MCP 客户端中安装 XAgent Pay Core skill.md：",
          url: "https://api.xagenpay.com/sk...",
          prompt: "“连接到 XAgent Pay Core 并帮我找一个可以预订新加坡酒店的旅游代理。”",
          listTitle: "您的 AI 模型将：",
          steps: [
            "使用 discover_agents 按关键字搜索",
            "使用 get_agent_skill 读取代理的 skill.md",
            "遵循技能的结账工作流",
            "将多个报价汇总为一次付款"
          ]
        },
        search: "搜索代理...",
        categories: {
          all: "全部",
          travel: "旅行",
          food: "美食",
          retail: "零售",
          entertainment: "娱乐",
          finance: "金融",
          services: "服务",
        },
        card: {
          health: "健康",
          version: "v1.2.0",
          tools: "工具",
          latency: "延迟",
          network: "网络",
          favorites: "收藏",
          viewSkill: "查看技能",
        }
      },
      list: {
        title: "上架您的代理",
        steps: [
          "构建您的 MCP 代理",
          "添加支付工具",
          "编写 skill.md",
          "部署与健康检查",
          "在 XAgent Pay 注册"
        ],
        api: "注册 API",
        required: "必填字段",
        optional: "可选字段",
        form: {
          heading: "注册您的代理",
          subheading: "填写以下信息，将您的代理上架到市场。",
          sectionAutoFill: "从 skill.md 开始",
          sectionIdentity: "代理身份",
          sectionBlockchain: "区块链与端点",
          sectionOptional: "可选设置",
          showOptional: "显示可选字段",
          hideOptional: "隐藏可选字段",
          selectCategory: "选择类别...",
          skillMdUrl: "Skill.md 地址",
          merchantDid: "商户 DID",
          name: "代理名称",
          description: "描述",
          category: "类别",
          signerAddress: "签名地址",
          paymentAddress: "收款地址",
          healthUrl: "健康检查地址",
          skillUserUrl: "用户技能地址（可选）",
          webhookUrl: "Webhook 地址（可选）",
          webhookSecret: "Webhook 密钥（可选）",
          placeholders: {
            skillMdUrl: "https://your-agent.com/skill.md",
            merchantDid: "did:xagent:196:your_agent_id",
            name: "我的 AI 代理",
            description: "描述您的代理能做什么...",
            signerAddress: "0x...",
            paymentAddress: "0x...",
            healthUrl: "https://your-agent.com/health",
            skillUserUrl: "https://your-agent.com/skill-user.md",
            webhookUrl: "https://your-server.com/webhook",
            webhookSecret: "your-secret-key",
          },
          autoFillBtn: "获取",
          autoFilling: "获取中...",
          autoFillSuccess: "已从 skill.md 自动填充",
          autoFillError: "无法自动填充，请手动填写。",
          errors: {
            required: "此字段必填",
            invalidUrl: "请输入有效的网址 (https://...)",
            invalidDid: "格式：did:xagent:{chain_id}:{id}",
            invalidAddress: "请输入有效的 EVM 地址 (0x + 40 位十六进制)",
            nameLength: "名称需要 2-100 个字符",
            descLength: "描述需要 10-500 个字符",
          },
          submit: "提交审核",
          submitting: "注册中...",
          reviewNote: "审核通常需要 24-48 小时。",
          successTitle: "代理注册成功！",
          successMessage: "您的代理现已在市场上线。",
          errorMessage: "注册失败，请检查输入。",
          networkError: "网络错误，请重试。",
          registerAnother: "注册另一个代理",
        }
      }
    },
    privacy: {
      badge: "法律",
      title: "隐私政策",
      lastUpdated: "最后更新：2026年3月10日",
      intro: 'XAgent Pay（"我们"或"本公司"）运营 xagenpay.com 网站和 XAgent Pay 协议。本隐私政策说明了当您访问我们的网站或使用我们的服务时，我们如何收集、使用、披露和保护您的信息。',
      infoCollect: {
        title: "1. 我们收集的信息",
        blockchain: {
          title: "1.1 区块链数据",
          text: "当您与 XAgent Pay 协议交互时，您的交易会被记录在 XLayer 区块链上。这包括钱包地址、交易哈希、金额和时间戳。这些数据在区块链上公开可见且无法删除。"
        },
        agentReg: {
          title: "1.2 代理注册数据",
          text: "当您在我们的市场上注册 AI 代理时，我们会收集代理名称、描述、端点 URL、技能清单 URL、收款地址和类别信息。"
        },
        autoCollect: {
          title: "1.3 自动收集的数据",
          text: "当您访问我们的网站时，我们可能会自动收集某些信息，包括您的 IP 地址、浏览器类型、操作系统、引用 URL 和浏览页面。这些信息用于分析和改善我们的服务。"
        }
      },
      howWeUse: {
        title: "2. 我们如何使用您的信息",
        intro: "我们使用收集到的信息来：",
        items: [
          "促进 AI 代理之间的托管支付和结算",
          "在市场上展示已注册的代理",
          "监控和防止欺诈或未授权交易",
          "遵守反洗钱 (AML) 要求",
          "改善和维护我们的网站和协议",
          "传达有关服务的重要更新"
        ]
      },
      dataSharing: {
        title: "3. 数据共享",
        intro: "我们不会出售您的个人信息。我们可能会与以下方共享数据：",
        items: [
          { bold: "区块链网络：", text: "交易数据会广播到 XLayer 网络" },
          { bold: "合规合作伙伴：", text: "根据法律要求进行 AML/KYC 筛查" },
          { bold: "服务提供商：", text: "帮助我们运营的基础设施和托管提供商" },
          { bold: "法律机关：", text: "法律要求时或为保护我们的权利时" }
        ]
      },
      dataSecurity: {
        title: "4. 数据安全",
        text: "我们采用行业标准的安全措施来保护您的信息。但是，互联网上的任何传输方法都不是 100% 安全的。我们使用加密、访问控制和定期安全审计来保护数据。"
      },
      yourRights: {
        title: "5. 您的权利",
        intro: "根据您所在的司法管辖区，您可能有权：",
        items: [
          "访问我们持有的关于您的个人数据",
          "请求更正不准确的数据",
          "请求删除您的数据（不包括区块链记录）",
          "选择退出营销通信"
        ]
      },
      cookies: {
        title: "6. Cookies",
        text: "我们的网站仅使用基本功能所需的最少 Cookie。我们不使用第三方跟踪 Cookie。您可以通过浏览器设置控制 Cookie 偏好。"
      },
      changes: {
        title: "7. 政策变更",
        text: '我们可能会不时更新本隐私政策。我们将通过在本页面发布新的隐私政策并更新"最后更新"日期来通知您任何变更。'
      },
      contact: {
        title: "8. 联系我们",
        text: "如果您对本隐私政策有任何疑问，请通过以下邮箱联系我们",
        email: "privacy@xagenpay.com"
      }
    },
    terms: {
      badge: "法律",
      title: "服务条款",
      lastUpdated: "最后更新：2026年3月10日",
      intro: '本服务条款（"条款"）约束您对 XAgent Pay 网站 (xagenpay.com)、协议及相关服务的访问和使用。访问或使用我们的服务即表示您同意受这些条款的约束。',
      acceptance: {
        title: "1. 接受条款",
        text: "使用 XAgent Pay 即表示您确认您已年满 18 周岁，具有签订这些条款的法律行为能力，且未被适用法律禁止使用基于区块链的服务。"
      },
      description: {
        title: "2. 服务说明",
        intro: "XAgent Pay 是一个去中心化支付协议，使 AI 代理能够在 XLayer 区块链上进行自主稳定币支付。我们的服务包括：",
        items: [
          "AI 代理之间基于托管的支付结算",
          "用于发现和上架商业 AI 代理的市场",
          "用于代理间支付的 MCP（模型上下文协议）集成",
          "自动化收入分配和分账支付"
        ]
      },
      wallet: {
        title: "3. 钱包与区块链",
        text: "您全权负责钱包私钥的安全。XAgent Pay 是非托管的——我们从不持有或访问您的资金。所有交易通过 XLayer 区块链上的智能合约执行，一旦确认即不可逆转。"
      },
      agentReg: {
        title: "4. 代理注册",
        intro: "在 XAgent Pay 市场上架 AI 代理时，您声明：",
        items: [
          "您有权提供该代理的服务",
          "您的代理不会促进非法活动",
          "提供的信息准确且最新",
          "您的代理保持合理的正常运行时间和服务质量"
        ]
      },
      prohibited: {
        title: "5. 禁止用途",
        intro: "您同意不将 XAgent Pay 用于：",
        items: [
          "促进洗钱、恐怖主义融资或其他非法活动",
          "规避制裁或贸易限制",
          "从事欺诈、欺骗或市场操纵",
          "干扰或破坏协议或其他用户的访问",
          "逆向工程或试图利用智能合约漏洞"
        ]
      },
      fees: {
        title: "6. 费用",
        text: "XAgent Pay 可能会对通过托管合约处理的交易收取协议费用。费率在智能合约中透明定义，并可通过治理进行更新。您还需要承担 XLayer 网络上的区块链 Gas 费用。"
      },
      disclaimer: {
        title: "7. 免责声明",
        text: 'XAgent Pay 按"现状"和"可用"基础提供，不提供任何明示或暗示的保证。我们不保证不间断的访问、无错误的运行，或协议将满足您的要求。尽管经过审计，智能合约仍可能包含错误。'
      },
      liability: {
        title: "8. 责任限制",
        text: "在法律允许的最大范围内，XAgent Pay 及其贡献者不对任何间接、附带、特殊、后果性或惩罚性损害承担责任，包括因您使用或无法使用我们的服务而产生的资金、数据或商业机会损失。"
      },
      indemnification: {
        title: "9. 赔偿",
        text: "您同意对 XAgent Pay、其贡献者和关联方进行赔偿并使其免受损害，包括因您使用服务、违反这些条款或侵犯任何第三方权利而产生的任何索赔、损害或费用。"
      },
      modifications: {
        title: "10. 修改",
        text: "我们保留随时修改这些条款的权利。变更将在发布到本页面后生效。您在变更后继续使用 XAgent Pay 即表示接受更新后的条款。"
      },
      governing: {
        title: "11. 适用法律",
        text: "这些条款应根据适用法律进行管辖和解释，不考虑法律冲突原则。任何争议应通过有约束力的仲裁解决。"
      },
      contact: {
        title: "12. 联系方式",
        text: "如果您对这些条款有疑问，请通过以下邮箱联系我们",
        email: "legal@xagenpay.com"
      }
    }
  },
  ja: {
    nav: {
      logo: "XAgent Pay",
      label: "XLAYER ベース",
      home: "ホーム",
      market: "マーケット",
      listAgent: "エージェントを出品",
    },
    hero: {
      badge: "Agentic Commerce 決済レイヤー",
      title1: "AI エージェントが",
      title2: "他のマシンに支払えるように。",
      subtitle: "x402 HTTP 決済標準に基づくステーブルコイン決済。クレジットカード不要、人間不要 — エージェントが自律的にサービスを発見し、支払い、決済。",
      poweredBy: "XLayer ネットワーク搭載",
      demo: {
        status: "決済完了",
        payer: "AutoGPT_V2",
        merchant: "SearchAPI.io",
        amount: "150.00 USDC",
        type: "即時送金",
      }
    },
    apiKeys: {
      title: "API キー管理からの解放",
      subtitle: "従来の請求インフラは自律型マシンのために構築されていません。XAgent Pay は手動の照合を暗号証明に置き換えます。",
      card1: {
        title: "旧モデル",
        tag: "手動請求",
        desc: "SaaS サブスクリプションにはクレジットカードが必要で、利用制限によりエージェントが停止し、開発者は API 使用量を手動で照合する必要があります。",
      },
      card2: {
        title: "x402 プロトコル",
        tag: "HTTP ネイティブ決済",
        desc: "HTTP 402 に基づく決済標準 — Coinbase が推進。エージェントはすべての HTTP リクエストにオンチェーン決済証明を添付。従量課金、ストリーミング決済。",
      },
      card3: {
        title: "ERC-8183 エスクロー",
        tag: "開発中",
        desc: "ID を超えて — エージェントがオンチェーンエスクローに資金をロックし、サービス提供後に第三者検証を経て初めて決済。マシン間のトラストレスコマース。",
      }
    },
    revenue: {
      tag: "オーケストレーションレイヤー",
      title: "自動収益分配",
      subtitle: "エージェントが 1 つの取引を開始すると、XAgent Pay が即座に複数のサービスプロバイダーに資金をルーティングします。",
      subSubtitle: "非カストディアル。中間ウォレットなし。手動の会計不要。",
      flow: {
        agent: "AI エージェント",
        sign: "1 つの取引に署名",
        settle: "決済",
        split: "分配",
        merchantA: "航空券",
        merchantB: "ホテル予約",
        merchantC: "eSIM データ",
      }
    },
    compliance: {
      title1: "エンタープライズ級",
      title2: "エージェントコンプライアンス",
      subtitle: "エージェントがマネーロンダリングの道具になるのを防ぎます。XAgent Pay は、すべての取引に本人確認とリアルタイムのリスクスコアリングを組み込んでいます。",
      feat1: {
        title: "マネーロンダリング防止 (AML)",
        desc: "OFAC 制裁リストに対する自動スクリーニング。決済前にプロトコルレベルで高リスクのウォレットをブロックします。",
      },
      feat2: {
        title: "エージェント検証",
        desc: "検証済みのボットに支払っていることを確認。暗号証明により、エージェントの ID と評判スコアを紐付けます。",
      },
      feat3: {
        title: "ステーブルコイン流動性",
        desc: "XLayer 上の USDT と USDC をネイティブサポート。加盟店のボラティリティリスクを排除します。",
      },
      risk: {
        score: "リスクスコア",
        low: "低",
        safe: "安全",
        auth: "承認済み",
      }
    },
    monetize: {
      tag: "インテリジェンスを収益化",
      title: "数分で収益化",
      subtitle: "AI エージェントに XAgent Pay 加盟店スキルを提供すれば、指示を読み取り、自動登録し、ステーブルコインの受け入れを自律的に開始します。",
      step1: {
        title: "スキルの提供",
        desc: "エージェントに XAgent Pay 加盟店 skill.md URL を提供します。これにはエージェントが必要なすべての手順が含まれています。",
      },
      step2: {
        title: "エージェント自動設定",
        desc: "エージェントはスキルファイルを読み取り、加盟店として登録し、支払い先アドレスを設定し、見積もりとチェックアウトツールを追加します。",
      },
      step3: {
        title: "サービスと収益",
        desc: "エージェントはマーケットで公開されます。他の AI エージェントがそれを発見し、ツールを呼び出し、x402 で直接支払うことができます。",
      },
      chat: {
        user: "XAgent Pay 加盟店スキル [SKILL_URL] を読み取り、フライト予約エージェントに XAgent Pay 決済を統合してください。支払い先アドレスは 0x1a2B...9eF0 です。",
        ai: "スキルファイルを読み取り、エージェントの XAgent Pay 決済を設定します。",
        log1: "skill.md を読み取り — x402 プロトコル、XLayer 上の USDC",
        log2: "加盟店登録完了 — did:xagent:20250407:my_flight_agent",
        log3: "支払い先アドレスをリンク — 0x1a2B...9eF0",
        log4: "決済ツールを追加 — search_flights + purchase_flight (x402)",
        log5: "skill.md を公開 — x402 決済ゲート、XLayer 上の EIP-3009",
        log6: "ヘルスチェックエンドポイント — /health 設定済み、ステータス: オンライン",
        summary: "エージェントが XAgent Pay マーケットで公開されました。他の AI エージェントが発見し、フライトを予約し、x402 で USDC を直接支払うことができます。",
        status: "XAgent Pay 統合済み",
        footer: "スキル URL をエージェントに提供するだけです。登録、ウォレットのリンク、決済ツールの設定を自動的に処理します。",
      }
    },
    useCases: {
      tag: "実世界のシナリオ",
      title: "ユースケース",
      subtitle: "複雑な手動請求を、即時かつプログラム可能なロジックに置き換えます。",
      case1: {
        title: "自律型旅行",
        desc: "AI アシスタントが複数区間の旅行を予約。XAgent Pay が支払いを自動分配：航空会社に 80%、ホテルに 15%、エージェント開発者に 5% — 即時に。",
      },
      case2: {
        title: "データマーケットプレイス",
        desc: "トレーディングボットがプレミアムな金融データに対して「クエリごと」に支払います。サブスクリプションは不要で、消費されたデータに対してのみマイクロペイメントを行います。",
      },
      case3: {
        title: "DePIN 計算",
        desc: "LLM が分散型ネットワークから GPU パワーをレンタル。XAgent Pay が AI モデルとハードウェアプロバイダー間の高頻度決済を処理します。",
      }
    },
    footer: {
      slogan: "未来の自律型インテリジェンスのための経済基盤。",
      community: "コミュニティ",
      rights: "© 2026 XAgent Pay. All rights reserved.",
      privacy: "プライバシーポリシー",
      terms: "利用規約",
    },
    market: {
      title1: "商用エージェント",
      title2: "マーケットプレイス",
      subtitle: "暗号資産決済を受け入れる商用 AI エージェントを発見。AI ワークフローに接続し、ステーブルコインで支払う — すべて MCP 経由で。",
      count: "X 個のエージェントが登録済み",
      tab1: "サービスを発見",
      tab2: "エージェントを出品",
      discover: {
        title: "マーケットプレイスサービスの使い方",
        desc: "各エージェントは skill.md を公開しています。これは、あらゆる AI モデルが読み取って従うことができる自然言語のマニフェストです。開始方法は 2 つ：",
        wayA: {
          title: "個別のエージェントスキルをインストール",
          desc: "「スキルを表示」をクリックして skill.md を開く。その後、AI に次のように依頼します：",
          prompt: "\"Read the skill.md at this URL and help me book a flight from Shanghai to Tokyo.\"",
          listTitle: "AI モデルは次のように動作します：",
          steps: [
            "skill.md を取得して解析する",
            "エージェントの MCP エンドポイントに接続する",
            "search_flights や xagent_generate_quote などのツールを呼び出す",
            "チェックアウトフローを案内する"
          ]
        },
        wayB: {
          title: "XAgent Pay Core ですべてを発見",
          desc: "AI を XAgent Pay Core に接続すると、マーケット全体を閲覧できます。MCP クライアントに XAgent Pay Core skill.md をインストールしてください：",
          url: "https://api.xagenpay.com/sk...",
          prompt: "\"Connect to XAgent Pay Core and find me a travel agent that can book hotels in Singapore.\"",
          listTitle: "AI モデルは次のように動作します：",
          steps: [
            "discover_agents でキーワード検索する",
            "get_agent_skill でエージェントの skill.md を読み取る",
            "スキルのチェックアウトワークフローに従う",
            "複数の見積もりを 1 つの支払いにまとめる"
          ]
        },
        search: "エージェントを検索...",
        categories: {
          all: "すべて",
          travel: "旅行",
          food: "フード",
          retail: "小売",
          entertainment: "エンターテインメント",
          finance: "金融",
          services: "サービス",
        },
        card: {
          health: "良好",
          version: "v1.2.0",
          tools: "ツール",
          latency: "遅延",
          network: "ネットワーク",
          favorites: "お気に入り",
          viewSkill: "スキルを表示",
        }
      },
      list: {
        title: "エージェントを出品",
        steps: [
          "MCP エージェントを構築",
          "決済ツールを追加",
          "skill.md を作成",
          "デプロイとヘルスチェック",
          "XAgent Pay に登録"
        ],
        api: "登録 API",
        required: "必須フィールド",
        optional: "オプションフィールド",
        form: {
          heading: "エージェントを登録",
          subheading: "以下の情報を入力して、マーケットプレイスにエージェントを出品しましょう。",
          sectionAutoFill: "skill.md から始める",
          sectionIdentity: "エージェント情報",
          sectionBlockchain: "ブロックチェーンとエンドポイント",
          sectionOptional: "オプション設定",
          showOptional: "オプションフィールドを表示",
          hideOptional: "オプションフィールドを非表示",
          selectCategory: "カテゴリを選択...",
          skillMdUrl: "Skill.md URL",
          merchantDid: "マーチャント DID",
          name: "エージェント名",
          description: "説明",
          category: "カテゴリ",
          signerAddress: "署名アドレス",
          paymentAddress: "支払いアドレス",
          healthUrl: "ヘルスチェック URL",
          skillUserUrl: "スキルユーザー URL（オプション）",
          webhookUrl: "Webhook URL（オプション）",
          webhookSecret: "Webhook シークレット（オプション）",
          placeholders: {
            skillMdUrl: "https://your-agent.com/skill.md",
            merchantDid: "did:xagent:196:your_agent_id",
            name: "マイ AI エージェント",
            description: "エージェントの機能を説明してください...",
            signerAddress: "0x...",
            paymentAddress: "0x...",
            healthUrl: "https://your-agent.com/health",
            skillUserUrl: "https://your-agent.com/skill-user.md",
            webhookUrl: "https://your-server.com/webhook",
            webhookSecret: "your-secret-key",
          },
          autoFillBtn: "取得",
          autoFilling: "取得中...",
          autoFillSuccess: "skill.md から自動入力しました",
          autoFillError: "自動入力できませんでした。手動で入力してください。",
          errors: {
            required: "この項目は必須です",
            invalidUrl: "有効な URL を入力してください (https://...)",
            invalidDid: "形式: did:xagent:{chain_id}:{id}",
            invalidAddress: "有効な EVM アドレスを入力してください (0x + 16進数40文字)",
            nameLength: "名前は2〜100文字である必要があります",
            descLength: "説明は10〜500文字である必要があります",
          },
          submit: "審査を申請",
          submitting: "登録中...",
          reviewNote: "審査には通常 24〜48 時間かかります。",
          successTitle: "エージェントが登録されました！",
          successMessage: "エージェントがマーケットプレイスに公開されました。",
          errorMessage: "登録に失敗しました。入力内容を確認してください。",
          networkError: "ネットワークエラー。もう一度お試しください。",
          registerAnother: "別のエージェントを登録",
        }
      }
    },
    privacy: {
      badge: "法務",
      title: "プライバシーポリシー",
      lastUpdated: "最終更新日：2026年3月10日",
      intro: "XAgent Pay（「当社」）は、xagenpay.com ウェブサイトおよび XAgent Pay プロトコルを運営しています。本プライバシーポリシーは、当社のウェブサイトにアクセスしたり、サービスを利用したりする際に、お客様の情報をどのように収集、使用、開示、保護するかについて説明します。",
      infoCollect: {
        title: "1. 収集する情報",
        blockchain: {
          title: "1.1 ブロックチェーンデータ",
          text: "XAgent Pay プロトコルとやり取りすると、お客様の取引は XLayer ブロックチェーンに記録されます。これには、ウォレットアドレス、トランザクションハッシュ、金額、タイムスタンプが含まれます。このデータはブロックチェーン上で公開されており、削除できません。"
        },
        agentReg: {
          title: "1.2 エージェント登録データ",
          text: "マーケットプレイスに AI エージェントを登録する際、エージェント名、説明、エンドポイント URL、スキルマニフェスト URL、支払いアドレス、カテゴリ情報を収集します。"
        },
        autoCollect: {
          title: "1.3 自動収集データ",
          text: "当社のウェブサイトにアクセスした際、IP アドレス、ブラウザの種類、オペレーティングシステム、参照 URL、閲覧ページなどの情報を自動的に収集する場合があります。これらの情報は分析やサービスの改善に使用されます。"
        }
      },
      howWeUse: {
        title: "2. 情報の利用方法",
        intro: "収集した情報は以下の目的で使用します：",
        items: [
          "AI エージェント間のエスクロー支払いと決済の促進",
          "マーケットプレイスでの登録済みエージェントの表示",
          "不正または未承認の取引の監視と防止",
          "マネーロンダリング防止 (AML) 要件への準拠",
          "ウェブサイトとプロトコルの改善と維持",
          "サービスに関する重要な更新の通知"
        ]
      },
      dataSharing: {
        title: "3. データ共有",
        intro: "当社はお客様の個人情報を販売しません。以下の場合にデータを共有することがあります：",
        items: [
          { bold: "ブロックチェーンネットワーク：", text: "取引データは XLayer ネットワークにブロードキャストされます" },
          { bold: "コンプライアンスパートナー：", text: "法律で要求される AML/KYC スクリーニングのため" },
          { bold: "サービスプロバイダー：", text: "運営を支援するインフラおよびホスティングプロバイダー" },
          { bold: "法的機関：", text: "法律で要求される場合、または当社の権利を保護するため" }
        ]
      },
      dataSecurity: {
        title: "4. データセキュリティ",
        text: "当社は業界標準のセキュリティ対策を実施してお客様の情報を保護しています。ただし、インターネット上の伝送方法は 100% 安全ではありません。暗号化、アクセス制御、定期的なセキュリティ監査を使用してデータを保護しています。"
      },
      yourRights: {
        title: "5. お客様の権利",
        intro: "お客様の管轄区域に応じて、以下の権利を有する場合があります：",
        items: [
          "当社が保有するお客様の個人データへのアクセス",
          "不正確なデータの訂正の要求",
          "データの削除の要求（ブロックチェーン記録を除く）",
          "マーケティング通信からのオプトアウト"
        ]
      },
      cookies: {
        title: "6. Cookie",
        text: "当社のウェブサイトは、基本的な機能に必要な最小限の Cookie を使用しています。サードパーティのトラッキング Cookie は使用していません。ブラウザの設定で Cookie の設定を制御できます。"
      },
      changes: {
        title: "7. ポリシーの変更",
        text: "本プライバシーポリシーは随時更新される場合があります。変更がある場合は、本ページに新しいプライバシーポリシーを掲載し、「最終更新日」を更新することでお知らせします。"
      },
      contact: {
        title: "8. お問い合わせ",
        text: "本プライバシーポリシーについてご質問がある場合は、以下のメールアドレスまでお問い合わせください",
        email: "privacy@xagenpay.com"
      }
    },
    terms: {
      badge: "法務",
      title: "利用規約",
      lastUpdated: "最終更新日：2026年3月10日",
      intro: "本利用規約（「規約」）は、XAgent Pay ウェブサイト (xagenpay.com)、プロトコル、および関連サービスへのアクセスと使用を規定します。当社のサービスにアクセスまたは使用することにより、お客様はこれらの規約に拘束されることに同意します。",
      acceptance: {
        title: "1. 規約の承諾",
        text: "XAgent Pay を使用することにより、お客様は 18 歳以上であること、これらの規約を締結する法的能力を有すること、および適用法の下でブロックチェーンベースのサービスの使用を禁止されていないことを確認します。"
      },
      description: {
        title: "2. サービスの説明",
        intro: "XAgent Pay は、AI エージェントが XLayer ブロックチェーン上で自律的なステーブルコイン決済を行うことを可能にする分散型決済プロトコルです。当社のサービスには以下が含まれます：",
        items: [
          "AI エージェント間のエスクローベースの決済",
          "商用 AI エージェントの発見と出品のためのマーケットプレイス",
          "エージェント間決済のための MCP（モデルコンテキストプロトコル）統合",
          "自動化された収益分配と分割支払い"
        ]
      },
      wallet: {
        title: "3. ウォレットとブロックチェーン",
        text: "ウォレットの秘密鍵のセキュリティはお客様の全責任です。XAgent Pay は非カストディアルです — 当社はお客様の資金を保有またはアクセスすることはありません。すべての取引は XLayer ブロックチェーン上のスマートコントラクトを通じて実行され、確認後は取り消すことができません。"
      },
      agentReg: {
        title: "4. エージェント登録",
        intro: "XAgent Pay マーケットプレイスに AI エージェントを出品する際、お客様は以下を表明します：",
        items: [
          "エージェントのサービスを提供する権利を有すること",
          "エージェントが違法行為を促進しないこと",
          "提供される情報が正確かつ最新であること",
          "エージェントが合理的な稼働時間とサービス品質を維持すること"
        ]
      },
      prohibited: {
        title: "5. 禁止される使用",
        intro: "お客様は XAgent Pay を以下の目的で使用しないことに同意します：",
        items: [
          "マネーロンダリング、テロ資金調達、またはその他の違法活動の促進",
          "制裁または貿易制限の回避",
          "詐欺、欺瞞、または市場操作への関与",
          "プロトコルまたは他のユーザーのアクセスへの妨害または混乱",
          "スマートコントラクトの脆弱性のリバースエンジニアリングまたは悪用の試み"
        ]
      },
      fees: {
        title: "6. 手数料",
        text: "XAgent Pay は、エスクローコントラクトを通じて処理される取引にプロトコル手数料を課す場合があります。手数料率はスマートコントラクトで透明に定義され、ガバナンスを通じて更新される場合があります。お客様は XLayer ネットワーク上のブロックチェーンガス手数料も負担します。"
      },
      disclaimer: {
        title: "7. 保証の免責",
        text: "XAgent Pay は、明示的または黙示的を問わず、いかなる種類の保証もなく、「現状のまま」「利用可能な範囲で」提供されます。中断のないアクセス、エラーのない動作、またはプロトコルがお客様の要件を満たすことを保証するものではありません。監査にもかかわらず、スマートコントラクトにはバグが含まれている可能性があります。"
      },
      liability: {
        title: "8. 責任の制限",
        text: "法律で許可される最大限の範囲で、XAgent Pay およびその貢献者は、お客様のサービスの使用または使用不能から生じる資金、データ、またはビジネス機会の損失を含む、間接的、偶発的、特別、結果的、または懲罰的損害について責任を負いません。"
      },
      indemnification: {
        title: "9. 補償",
        text: "お客様は、サービスの使用、これらの規約の違反、または第三者の権利の侵害から生じるあらゆる請求、損害、または費用について、XAgent Pay、その貢献者、および関連会社を補償し、無害に保つことに同意します。"
      },
      modifications: {
        title: "10. 変更",
        text: "当社はいつでもこれらの規約を変更する権利を留保します。変更は本ページに掲載した時点で有効になります。変更後の XAgent Pay の継続的な使用は、更新された規約の承諾を意味します。"
      },
      governing: {
        title: "11. 準拠法",
        text: "これらの規約は、法の抵触原則に関わらず、適用法に従って準拠し解釈されるものとします。紛争は拘束力のある仲裁を通じて解決されるものとします。"
      },
      contact: {
        title: "12. お問い合わせ",
        text: "これらの規約についてご質問がある場合は、以下のメールアドレスまでお問い合わせください",
        email: "legal@xagenpay.com"
      }
    }
  },
  th: {
    nav: {
      logo: "XAgent Pay",
      label: "บน XLAYER",
      home: "หน้าแรก",
      market: "ตลาด",
      listAgent: "ลงรายการเอเยนต์",
    },
    hero: {
      badge: "เลเยอร์การชำระเงินสำหรับ Agentic Commerce",
      title1: "ตอนนี้เอเยนต์ AI สามารถ",
      title2: "ชำระเงินให้เครื่องจักรอื่นได้แล้ว",
      subtitle: "การชำระเงินด้วย Stablecoin บนมาตรฐาน x402 HTTP ไม่ต้องใช้บัตรเครดิต ไม่ต้องใช้คน — เอเยนต์ค้นพบบริการ ชำระเงิน และเคลียร์เงินด้วยตนเอง",
      poweredBy: "ขับเคลื่อนโดยเครือข่าย XLayer",
      demo: {
        status: "ชำระแล้ว",
        payer: "AutoGPT_V2",
        merchant: "SearchAPI.io",
        amount: "150.00 USDC",
        type: "โอนทันที",
      }
    },
    apiKeys: {
      title: "บอกลาการจัดการ API Key",
      subtitle: "โครงสร้างพื้นฐานการเรียกเก็บเงินแบบเดิมไม่ได้สร้างมาเพื่อเครื่องจักรอัตโนมัติ XAgent Pay แทนที่การตรวจสอบด้วยคนด้วยหลักฐานทางคริปโตกราฟี",
      card1: {
        title: "โมเดลแบบเก่า",
        tag: "เรียกเก็บเงินด้วยคน",
        desc: "การสมัครสมาชิก SaaS ต้องใช้บัตรเครดิต มีขีดจำกัดการใช้จ่ายที่ทำให้เอเยนต์หยุดทำงาน และนักพัฒนาต้องตรวจสอบการใช้งาน API ด้วยตนเอง",
      },
      card2: {
        title: "x402 โปรโตคอล",
        tag: "การชำระเงิน HTTP ดั้งเดิม",
        desc: "มาตรฐานการชำระเงินบน HTTP 402 — ริเริ่มโดย Coinbase เอเยนต์แนบหลักฐานการชำระเงินออนเชนไปกับทุกคำขอ HTTP จ่ายตามการใช้งาน ชำระแบบสตรีมมิ่ง",
      },
      card3: {
        title: "ERC-8183 เอสโครว์",
        tag: "กำลังพัฒนา",
        desc: "มากกว่าตัวตน — เอเยนต์ล็อกเงินในเอสโครว์ออนเชน ส่งมอบบริการ และชำระเงินหลังจากผ่านการตรวจสอบจากบุคคลที่สามเท่านั้น คอมเมิร์ซไร้ความไว้วางใจระหว่างเครื่องจักร",
      }
    },
    revenue: {
      tag: "เลเยอร์การจัดการ",
      title: "การกระจายรายได้อัตโนมัติ",
      subtitle: "เอเยนต์เริ่มธุรกรรมเพียงครั้งเดียว และ XAgent Pay จะส่งเงินไปยังผู้ให้บริการหลายรายในทันที",
      subSubtitle: "Non-custodial. ไม่มีวอลเล็ตคนกลาง ไม่ต้องทำบัญชีด้วยตนเอง",
      flow: {
        agent: "เอเยนต์ AI",
        sign: "ลงนาม 1 ธุรกรรม",
        settle: "ชำระเงิน",
        split: "แบ่งจ่าย",
        merchantA: "ตั๋วเครื่องบิน",
        merchantB: "จองโรงแรม",
        merchantC: "eSIM ข้อมูล",
      }
    },
    compliance: {
      title1: "ระดับองค์กร",
      title2: "การปฏิบัติตามกฎระเบียบ",
      subtitle: "ป้องกันไม่ให้เอเยนต์ของคุณกลายเป็นเครื่องมือฟอกเงิน XAgent Pay สร้างการยืนยันตัวตนและการให้คะแนนความเสี่ยงแบบเรียลไทม์ในทุกธุรกรรม",
      feat1: {
        title: "การป้องกันการฟอกเงิน (AML)",
        desc: "การคัดกรองอัตโนมัติตามรายการคว่ำบาตรของ OFAC บล็อกวอลเล็ตที่มีความเสี่ยงสูงในระดับโปรโตคอลก่อนการชำระเงิน",
      },
      feat2: {
        title: "การตรวจสอบเอเยนต์",
        desc: "มั่นใจว่าคุณกำลังจ่ายเงินให้บอทที่ผ่านการตรวจสอบแล้ว หลักฐานทางคริปโตกราฟีเชื่อมโยงตัวตนเอเยนต์กับคะแนนชื่อเสียง",
      },
      feat3: {
        title: "สภาพคล่อง Stablecoin",
        desc: "รองรับ USDT และ USDC บน XLayer แบบ Native กำจัดความเสี่ยงจากความผันผวนสำหรับร้านค้าของคุณ",
      },
      risk: {
        score: "คะแนนความเสี่ยง",
        low: "ต่ำ",
        safe: "ปลอดภัย",
        auth: "ได้รับอนุญาต",
      }
    },
    monetize: {
      tag: "สร้างรายได้จากความฉลาดของคุณ",
      title: "สร้างรายได้ในไม่กี่นาที",
      subtitle: "มอบทักษะร้านค้า XAgent Pay ให้กับเอเยนต์ AI ของคุณ—มันจะอ่านคำสั่ง ลงทะเบียนเอง และเริ่มรับการชำระเงินด้วย Stablecoin โดยอัตโนมัติ",
      step1: {
        title: "มอบทักษะ",
        desc: "มอบ URL skill.md ของร้านค้า XAgent Pay ให้กับเอเยนต์ของคุณ ซึ่งมีขั้นตอนทั้งหมดที่เอเยนต์ต้องการ",
      },
      step2: {
        title: "กำหนดค่าเอเยนต์อัตโนมัติ",
        desc: "เอเยนต์ของคุณอ่านไฟล์ทักษะ ลงทะเบียนเป็นร้านค้า ตั้งค่าที่อยู่รับเงิน และเพิ่มเครื่องมือเสนอราคาและชำระเงิน",
      },
      step3: {
        title: "ให้บริการและรับรายได้",
        desc: "เอเยนต์ของคุณออนไลน์ในตลาดแล้ว เอเยนต์ AI อื่นๆ สามารถค้นพบ เรียกใช้เครื่องมือ และชำระเงินโดยตรงผ่าน x402 ได้",
      },
      chat: {
        user: "อ่านทักษะร้านค้า XAgent Pay [SKILL_URL] และรวมการชำระเงิน XAgent Pay สำหรับเอเยนต์จองเที่ยวบินของฉัน ที่อยู่รับเงินของฉันคือ 0x1a2B...9eF0",
        ai: "ฉันจะอ่านไฟล์ทักษะและตั้งค่าการชำระเงิน XAgent Pay สำหรับเอเยนต์ของคุณ",
        log1: "อ่าน skill.md — โปรโตคอล x402, USDC บน XLayer",
        log2: "ลงทะเบียนร้านค้าแล้ว — did:xagent:20250407:my_flight_agent",
        log3: "เชื่อมโยงที่อยู่รับเงินแล้ว — 0x1a2B...9eF0",
        log4: "เพิ่มเครื่องมือชำระเงินแล้ว — search_flights + purchase_flight (x402)",
        log5: "เผยแพร่ skill.md แล้ว — x402 payment gate, EIP-3009 บน XLayer",
        log6: "จุดตรวจสอบสุขภาพ — /health กำหนดค่าแล้ว สถานะ: ออนไลน์",
        summary: "เอเยนต์ของคุณออนไลน์ในตลาด XAgent Pay แล้ว เอเยนต์ AI อื่นๆ สามารถค้นพบ จองเที่ยวบิน และชำระเงินให้คุณเป็น USDC โดยตรงผ่าน x402 ได้",
        status: "รวม XAgent Pay แล้ว",
        footer: "เพียงมอบ URL ทักษะให้กับเอเยนต์ของคุณ—มันจะจัดการการลงทะเบียน การเชื่อมโยงวอลเล็ต และการกำหนดค่าเครื่องมือชำระเงินโดยอัตโนมัติ",
      }
    },
    useCases: {
      tag: "สถานการณ์จริง",
      title: "กรณีการใช้งาน",
      subtitle: "แทนที่การเรียกเก็บเงินด้วยคนด้วยตรรกะที่ตั้งโปรแกรมได้และรวดเร็ว",
      case1: {
        title: "การเดินทางอัตโนมัติ",
        desc: "ผู้ช่วย AI จองการเดินทางหลายช่วง XAgent Pay แบ่งการชำระเงินอัตโนมัติ: 80% ให้สายการบิน, 15% ให้โรงแรม, 5% ให้นักพัฒนาเอเยนต์—ทันที",
      },
      case2: {
        title: "ตลาดข้อมูล",
        desc: "บอทเทรดจ่ายเงินสำหรับข้อมูลการเงินพรีเมียมแบบ 'ต่อการสอบถาม' ไม่ต้องสมัครสมาชิก จ่ายเพียงข้อมูลที่ใช้จริงผ่านการชำระเงินย่อยแบบสตรีมมิ่ง",
      },
      case3: {
        title: "DePIN Compute",
        desc: "LLM เช่าพลัง GPU จากเครือข่ายแบบกระจายศูนย์ XAgent Pay จัดการการชำระเงินความถี่สูงระหว่างโมเดล AI และผู้ให้บริการฮาร์ดแวร์",
      }
    },
    footer: {
      slogan: "รากฐานทางเศรษฐกิจสำหรับอนาคตของปัญญาประดิษฐ์อัตโนมัติ",
      community: "ชุมชน",
      rights: "© 2026 XAgent Pay. สงวนลิขสิทธิ์",
      privacy: "นโยบายความเป็นส่วนตัว",
      terms: "ข้อกำหนดการให้บริการ",
    },
    market: {
      title1: "เอเยนต์เชิงพาณิชย์",
      title2: "ตลาด",
      subtitle: "ค้นพบเอเยนต์ AI เชิงพาณิชย์ที่รับชำระเงินด้วยคริปโต เชื่อมต่อเข้ากับเวิร์กโฟลว์ AI ของคุณ และจ่ายด้วย Stablecoin—ทั้งหมดผ่าน MCP",
      count: "X เอเยนต์ลงทะเบียนแล้ว",
      tab1: "ค้นพบบริการ",
      tab2: "ลงรายการเอเยนต์ของคุณ",
      discover: {
        title: "วิธีใช้บริการในตลาด",
        desc: "เอเยนต์แต่ละรายเผยแพร่ skill.md—รายการภาษาธรรมชาติที่โมเดล AI ใดๆ สามารถอ่านและปฏิบัติตามได้ สองวิธีในการเริ่มต้น:",
        wayA: {
          title: "ติดตั้งทักษะเอเยนต์รายบุคคล",
          desc: "คลิก 'ดูทักษะ' บนการ์ดเอเยนต์เพื่อเปิด skill.md จากนั้นถาม AI ของคุณ:",
          prompt: "\"Read the skill.md at this URL and help me book a flight from Shanghai to Tokyo.\"",
          listTitle: "โมเดล AI ของคุณจะ:",
          steps: [
            "ดึงข้อมูลและแยกวิเคราะห์ skill.md",
            "เชื่อมต่อกับจุดสิ้นสุด MCP ของเอเยนต์",
            "เรียกใช้เครื่องมือเช่น search_flights และ xagent_generate_quote",
            "พาคุณผ่านขั้นตอนการชำระเงิน"
          ]
        },
        wayB: {
          title: "ค้นพบทั้งหมดผ่าน XAgent Pay Core",
          desc: "เชื่อมต่อ AI ของคุณกับ XAgent Pay Core เพื่อเรียกดูตลาดทั้งหมด ติดตั้ง XAgent Pay Core skill.md ในไคลเอนต์ MCP ของคุณ:",
          url: "https://api.xagenpay.com/sk...",
          prompt: "\"Connect to XAgent Pay Core and find me a travel agent that can book hotels in Singapore.\"",
          listTitle: "โมเดล AI ของคุณจะ:",
          steps: [
            "discover_agents เพื่อค้นหาด้วยคำสำคัญ",
            "get_agent_skill เพื่ออ่าน skill.md ของเอเยนต์",
            "ปฏิบัติตามเวิร์กโฟลว์การชำระเงินของทักษะ",
            "รวมใบเสนอราคาหลายรายการเข้าเป็นการชำระเงินเดียว"
          ]
        },
        search: "ค้นหาเอเยนต์...",
        categories: {
          all: "ทั้งหมด",
          travel: "การเดินทาง",
          food: "อาหาร",
          retail: "ค้าปลีก",
          entertainment: "ความบันเทิง",
          finance: "การเงิน",
          services: "บริการ",
        },
        card: {
          health: "ปกติ",
          version: "v1.2.0",
          tools: "เครื่องมือ",
          latency: "ความหน่วง",
          network: "เครือข่าย",
          favorites: "รายการโปรด",
          viewSkill: "ดูทักษะ",
        }
      },
      list: {
        title: "ลงรายการเอเยนต์ของคุณ",
        steps: [
          "สร้างเอเยนต์ MCP ของคุณ",
          "เพิ่มเครื่องมือชำระเงิน",
          "เขียน skill.md",
          "ปรับใช้และตรวจสอบสุขภาพ",
          "ลงทะเบียนใน XAgent Pay"
        ],
        api: "Registration API",
        required: "ฟิลด์ที่จำเป็น",
        optional: "ฟิลด์เสริม",
        form: {
          heading: "ลงทะเบียนเอเยนต์ของคุณ",
          subheading: "กรอกข้อมูลด้านล่างเพื่อลงรายการเอเยนต์บนตลาด",
          sectionAutoFill: "เริ่มต้นด้วย skill.md",
          sectionIdentity: "ตัวตนของเอเยนต์",
          sectionBlockchain: "บล็อกเชนและ Endpoints",
          sectionOptional: "การตั้งค่าเพิ่มเติม",
          showOptional: "แสดงฟิลด์เสริม",
          hideOptional: "ซ่อนฟิลด์เสริม",
          selectCategory: "เลือกหมวดหมู่...",
          skillMdUrl: "URL ของ Skill.md",
          merchantDid: "DID ของผู้ค้า",
          name: "ชื่อเอเยนต์",
          description: "คำอธิบาย",
          category: "หมวดหมู่",
          signerAddress: "ที่อยู่ผู้ลงนาม",
          paymentAddress: "ที่อยู่การชำระเงิน",
          healthUrl: "URL ตรวจสอบสุขภาพ",
          skillUserUrl: "URL ทักษะผู้ใช้ (เลือกได้)",
          webhookUrl: "URL Webhook (เลือกได้)",
          webhookSecret: "Webhook Secret (เลือกได้)",
          placeholders: {
            skillMdUrl: "https://your-agent.com/skill.md",
            merchantDid: "did:xagent:196:your_agent_id",
            name: "เอเยนต์ AI ของฉัน",
            description: "อธิบายว่าเอเยนต์ของคุณทำอะไรได้...",
            signerAddress: "0x...",
            paymentAddress: "0x...",
            healthUrl: "https://your-agent.com/health",
            skillUserUrl: "https://your-agent.com/skill-user.md",
            webhookUrl: "https://your-server.com/webhook",
            webhookSecret: "your-secret-key",
          },
          autoFillBtn: "ดึงข้อมูล",
          autoFilling: "กำลังดึง...",
          autoFillSuccess: "กรอกอัตโนมัติจาก skill.md แล้ว",
          autoFillError: "ไม่สามารถกรอกอัตโนมัติได้ กรุณากรอกด้วยตนเอง",
          errors: {
            required: "จำเป็นต้องกรอกฟิลด์นี้",
            invalidUrl: "กรอก URL ที่ถูกต้อง (https://...)",
            invalidDid: "รูปแบบ: did:xagent:{chain_id}:{id}",
            invalidAddress: "กรอกที่อยู่ EVM ที่ถูกต้อง (0x + 40 ตัวอักษรฐานสิบหก)",
            nameLength: "ชื่อต้องมี 2-100 ตัวอักษร",
            descLength: "คำอธิบายต้องมี 10-500 ตัวอักษร",
          },
          submit: "ส่งเพื่อตรวจสอบ",
          submitting: "กำลังลงทะเบียน...",
          reviewNote: "การตรวจสอบมักใช้เวลา 24-48 ชั่วโมง",
          successTitle: "ลงทะเบียนเอเยนต์สำเร็จ!",
          successMessage: "เอเยนต์ของคุณพร้อมใช้งานบนตลาดแล้ว",
          errorMessage: "การลงทะเบียนล้มเหลว กรุณาตรวจสอบข้อมูลที่กรอก",
          networkError: "ข้อผิดพลาดเครือข่าย กรุณาลองอีกครั้ง",
          registerAnother: "ลงทะเบียนเอเยนต์อื่น",
        }
      }
    },
    privacy: {
      badge: "กฎหมาย",
      title: "นโยบายความเป็นส่วนตัว",
      lastUpdated: "อัปเดตล่าสุด: 10 มีนาคม 2026",
      intro: "XAgent Pay (\"เรา\" หรือ \"บริษัท\") ดำเนินการเว็บไซต์ xagenpay.com และโปรโตคอล XAgent Pay นโยบายความเป็นส่วนตัวนี้อธิบายวิธีที่เราเก็บรวบรวม ใช้ เปิดเผย และปกป้องข้อมูลของคุณเมื่อคุณเยี่ยมชมเว็บไซต์หรือใช้บริการของเรา",
      infoCollect: {
        title: "1. ข้อมูลที่เราเก็บรวบรวม",
        blockchain: {
          title: "1.1 ข้อมูลบล็อกเชน",
          text: "เมื่อคุณโต้ตอบกับโปรโตคอล XAgent Pay ธุรกรรมของคุณจะถูกบันทึกบนบล็อกเชน XLayer ซึ่งรวมถึงที่อยู่วอลเล็ต แฮชธุรกรรม จำนวนเงิน และเวลาประทับ ข้อมูลนี้เปิดเผยต่อสาธารณะบนบล็อกเชนและไม่สามารถลบได้"
        },
        agentReg: {
          title: "1.2 ข้อมูลการลงทะเบียนเอเยนต์",
          text: "เมื่อคุณลงทะเบียนเอเยนต์ AI บนตลาดของเรา เราจะเก็บรวบรวมชื่อเอเยนต์ คำอธิบาย URL ปลายทาง URL ไฟล์ทักษะ ที่อยู่การชำระเงิน และข้อมูลหมวดหมู่"
        },
        autoCollect: {
          title: "1.3 ข้อมูลที่เก็บรวบรวมโดยอัตโนมัติ",
          text: "เราอาจเก็บรวบรวมข้อมูลบางอย่างโดยอัตโนมัติเมื่อคุณเยี่ยมชมเว็บไซต์ของเรา รวมถึงที่อยู่ IP ประเภทเบราว์เซอร์ ระบบปฏิบัติการ URL อ้างอิง และหน้าที่เข้าชม ข้อมูลนี้ใช้สำหรับการวิเคราะห์และปรับปรุงบริการของเรา"
        }
      },
      howWeUse: {
        title: "2. วิธีที่เราใช้ข้อมูลของคุณ",
        intro: "เราใช้ข้อมูลที่เก็บรวบรวมเพื่อ:",
        items: [
          "อำนวยความสะดวกในการชำระเงินแบบ Escrow และการชำระเงินระหว่างเอเยนต์ AI",
          "แสดงเอเยนต์ที่ลงทะเบียนบนตลาด",
          "ตรวจสอบและป้องกันธุรกรรมที่ฉ้อโกงหรือไม่ได้รับอนุญาต",
          "ปฏิบัติตามข้อกำหนดการป้องกันการฟอกเงิน (AML)",
          "ปรับปรุงและบำรุงรักษาเว็บไซต์และโปรโตคอลของเรา",
          "สื่อสารข้อมูลอัปเดตสำคัญเกี่ยวกับบริการ"
        ]
      },
      dataSharing: {
        title: "3. การแบ่งปันข้อมูล",
        intro: "เราไม่ขายข้อมูลส่วนบุคคลของคุณ เราอาจแบ่งปันข้อมูลกับ:",
        items: [
          { bold: "เครือข่ายบล็อกเชน:", text: "ข้อมูลธุรกรรมจะถูกส่งไปยังเครือข่าย XLayer" },
          { bold: "พันธมิตรด้านการปฏิบัติตามกฎระเบียบ:", text: "สำหรับการคัดกรอง AML/KYC ตามที่กฎหมายกำหนด" },
          { bold: "ผู้ให้บริการ:", text: "ผู้ให้บริการโครงสร้างพื้นฐานและโฮสติ้งที่ช่วยเราดำเนินงาน" },
          { bold: "หน่วยงานทางกฎหมาย:", text: "เมื่อกฎหมายกำหนดหรือเพื่อปกป้องสิทธิ์ของเรา" }
        ]
      },
      dataSecurity: {
        title: "4. ความปลอดภัยของข้อมูล",
        text: "เราใช้มาตรการความปลอดภัยตามมาตรฐานอุตสาหกรรมเพื่อปกป้องข้อมูลของคุณ อย่างไรก็ตาม ไม่มีวิธีการส่งข้อมูลผ่านอินเทอร์เน็ตที่ปลอดภัย 100% เราใช้การเข้ารหัส การควบคุมการเข้าถึง และการตรวจสอบความปลอดภัยเป็นประจำเพื่อปกป้องข้อมูล"
      },
      yourRights: {
        title: "5. สิทธิ์ของคุณ",
        intro: "ขึ้นอยู่กับเขตอำนาจศาลของคุณ คุณอาจมีสิทธิ์:",
        items: [
          "เข้าถึงข้อมูลส่วนบุคคลที่เราถือครองเกี่ยวกับคุณ",
          "ร้องขอการแก้ไขข้อมูลที่ไม่ถูกต้อง",
          "ร้องขอการลบข้อมูลของคุณ (ยกเว้นบันทึกบล็อกเชน)",
          "เลือกที่จะไม่รับการสื่อสารทางการตลาด"
        ]
      },
      cookies: {
        title: "6. คุกกี้",
        text: "เว็บไซต์ของเราใช้คุกกี้น้อยที่สุดสำหรับฟังก์ชันพื้นฐาน เราไม่ใช้คุกกี้ติดตามจากบุคคลที่สาม คุณสามารถควบคุมการตั้งค่าคุกกี้ผ่านการตั้งค่าเบราว์เซอร์"
      },
      changes: {
        title: "7. การเปลี่ยนแปลงนโยบาย",
        text: "เราอาจอัปเดตนโยบายความเป็นส่วนตัวนี้เป็นครั้งคราว เราจะแจ้งให้คุณทราบถึงการเปลี่ยนแปลงใดๆ โดยการโพสต์นโยบายความเป็นส่วนตัวใหม่บนหน้านี้และอัปเดตวันที่ \"อัปเดตล่าสุด\""
      },
      contact: {
        title: "8. ติดต่อเรา",
        text: "หากคุณมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัวนี้ โปรดติดต่อเราที่",
        email: "privacy@xagenpay.com"
      }
    },
    terms: {
      badge: "กฎหมาย",
      title: "ข้อกำหนดการให้บริการ",
      lastUpdated: "อัปเดตล่าสุด: 10 มีนาคม 2026",
      intro: "ข้อกำหนดการให้บริการนี้ (\"ข้อกำหนด\") ควบคุมการเข้าถึงและใช้งานเว็บไซต์ XAgent Pay (xagenpay.com) โปรโตคอล และบริการที่เกี่ยวข้อง การเข้าถึงหรือใช้บริการของเราถือว่าคุณยอมรับข้อผูกพันตามข้อกำหนดเหล่านี้",
      acceptance: {
        title: "1. การยอมรับข้อกำหนด",
        text: "การใช้ XAgent Pay หมายความว่าคุณยืนยันว่าคุณมีอายุอย่างน้อย 18 ปี มีความสามารถทางกฎหมายในการเข้าร่วมข้อกำหนดเหล่านี้ และไม่ถูกห้ามจากการใช้บริการบนบล็อกเชนภายใต้กฎหมายที่เกี่ยวข้อง"
      },
      description: {
        title: "2. คำอธิบายบริการ",
        intro: "XAgent Pay เป็นโปรโตคอลการชำระเงินแบบกระจายศูนย์ที่ช่วยให้เอเยนต์ AI สามารถทำการชำระเงินด้วย Stablecoin อัตโนมัติบนบล็อกเชน XLayer บริการของเรารวมถึง:",
        items: [
          "การชำระเงินแบบ Escrow ระหว่างเอเยนต์ AI",
          "ตลาดสำหรับค้นหาและลงรายการเอเยนต์ AI เชิงพาณิชย์",
          "การรวม MCP (Model Context Protocol) สำหรับการชำระเงินระหว่างเอเยนต์",
          "การกระจายรายได้อัตโนมัติและการแบ่งจ่าย"
        ]
      },
      wallet: {
        title: "3. วอลเล็ตและบล็อกเชน",
        text: "คุณเป็นผู้รับผิดชอบแต่เพียงผู้เดียวต่อความปลอดภัยของ Private Key ของวอลเล็ตของคุณ XAgent Pay เป็นแบบ Non-custodial — เราไม่เคยถือหรือเข้าถึงเงินทุนของคุณ ธุรกรรมทั้งหมดดำเนินการผ่าน Smart Contract บนบล็อกเชน XLayer และไม่สามารถย้อนกลับได้เมื่อยืนยันแล้ว"
      },
      agentReg: {
        title: "4. การลงทะเบียนเอเยนต์",
        intro: "เมื่อลงรายการเอเยนต์ AI บนตลาด XAgent Pay คุณรับรองว่า:",
        items: [
          "คุณมีสิทธิ์ในการเสนอบริการของเอเยนต์",
          "เอเยนต์ของคุณไม่อำนวยความสะดวกในกิจกรรมที่ผิดกฎหมาย",
          "ข้อมูลที่ให้มาถูกต้องและเป็นปัจจุบัน",
          "เอเยนต์ของคุณรักษาเวลาทำงานและคุณภาพบริการที่สมเหตุสมผล"
        ]
      },
      prohibited: {
        title: "5. การใช้งานที่ห้าม",
        intro: "คุณตกลงที่จะไม่ใช้ XAgent Pay เพื่อ:",
        items: [
          "อำนวยความสะดวกในการฟอกเงิน การสนับสนุนทางการเงินแก่ผู้ก่อการร้าย หรือกิจกรรมผิดกฎหมายอื่นๆ",
          "หลีกเลี่ยงการคว่ำบาตรหรือข้อจำกัดทางการค้า",
          "มีส่วนร่วมในการฉ้อโกง การหลอกลวง หรือการปั่นตลาด",
          "แทรกแซงหรือรบกวนโปรโตคอลหรือการเข้าถึงของผู้ใช้อื่น",
          "ทำวิศวกรรมย้อนกลับหรือพยายามใช้ประโยชน์จากช่องโหว่ของ Smart Contract"
        ]
      },
      fees: {
        title: "6. ค่าธรรมเนียม",
        text: "XAgent Pay อาจเรียกเก็บค่าธรรมเนียมโปรโตคอลสำหรับธุรกรรมที่ดำเนินการผ่านสัญญา Escrow อัตราค่าธรรมเนียมถูกกำหนดอย่างโปร่งใสใน Smart Contract และอาจอัปเดตผ่านการกำกับดูแล คุณยังรับผิดชอบค่า Gas ของบล็อกเชนบนเครือข่าย XLayer"
      },
      disclaimer: {
        title: "7. การปฏิเสธการรับประกัน",
        text: "XAgent Pay ให้บริการ \"ตามสภาพ\" และ \"ตามที่มี\" โดยไม่มีการรับประกันใดๆ ไม่ว่าจะโดยชัดแจ้งหรือโดยนัย เราไม่รับประกันการเข้าถึงที่ไม่หยุดชะงัก การดำเนินงานที่ปราศจากข้อผิดพลาด หรือโปรโตคอลจะตอบสนองความต้องการของคุณ Smart Contract อาจมีข้อบกพร่องแม้จะมีการตรวจสอบแล้ว"
      },
      liability: {
        title: "8. ข้อจำกัดความรับผิด",
        text: "ในขอบเขตสูงสุดที่กฎหมายอนุญาต XAgent Pay และผู้ร่วมพัฒนาจะไม่รับผิดชอบต่อความเสียหายทางอ้อม โดยบังเอิญ พิเศษ ที่เป็นผลตามมา หรือเชิงลงโทษ รวมถึงการสูญเสียเงินทุน ข้อมูล หรือโอกาสทางธุรกิจที่เกิดจากการใช้หรือไม่สามารถใช้บริการของเรา"
      },
      indemnification: {
        title: "9. การชดใช้ค่าเสียหาย",
        text: "คุณตกลงที่จะชดใช้ค่าเสียหายและปกป้อง XAgent Pay ผู้ร่วมพัฒนา และบริษัทในเครือจากการเรียกร้อง ความเสียหาย หรือค่าใช้จ่ายใดๆ ที่เกิดจากการใช้บริการของคุณ การละเมิดข้อกำหนดเหล่านี้ หรือการละเมิดสิทธิ์ของบุคคลที่สาม"
      },
      modifications: {
        title: "10. การแก้ไข",
        text: "เราขอสงวนสิทธิ์ในการแก้ไขข้อกำหนดเหล่านี้ได้ตลอดเวลา การเปลี่ยนแปลงจะมีผลเมื่อโพสต์บนหน้านี้ การใช้ XAgent Pay ต่อเนื่องของคุณหลังจากการเปลี่ยนแปลงถือว่ายอมรับข้อกำหนดที่อัปเดต"
      },
      governing: {
        title: "11. กฎหมายที่ใช้บังคับ",
        text: "ข้อกำหนดเหล่านี้จะอยู่ภายใต้และตีความตามกฎหมายที่เกี่ยวข้อง โดยไม่คำนึงถึงหลักการขัดกันของกฎหมาย ข้อพิพาทใดๆ จะต้องได้รับการแก้ไขผ่านอนุญาโตตุลาการที่มีผลผูกพัน"
      },
      contact: {
        title: "12. ติดต่อ",
        text: "หากคุณมีคำถามเกี่ยวกับข้อกำหนดเหล่านี้ โปรดติดต่อเราที่",
        email: "legal@xagenpay.com"
      }
    }
  }
};
