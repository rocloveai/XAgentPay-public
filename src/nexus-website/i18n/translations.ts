export type Language = 'en' | 'zh' | 'ja' | 'th';

export const translations = {
  en: {
    nav: {
      logo: "XAgent Pay",
      label: "BASED ON XLAYER",
      home: "Home",
      market: "Market",
    },
    hero: {
      badge: "The Settlement Layer for AI Economy",
      title1: "AI Agents Can Now",
      title2: "Pay Other Machines.",
      subtitle: "Programmatic stablecoin settlement for APIs, tools, and data markets. No credit cards, no human intervention, just code.",
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
        title: "Native HTTP 402",
        tag: "Payment Required",
        desc: "Reviving the missing status code of the web. Agents attach micropayment proofs to every HTTP request. Pay-per-use, instant streaming settlement.",
      },
      card3: {
        title: "Agent Identity",
        tag: "Crypto Auth",
        desc: "No more shared API keys. Agents sign transactions with their wallet private keys, creating an immutable audit trail for every action.",
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
        merchantA: "Compute Provider (Merchant A)",
        merchantB: "Data Source (Merchant B)",
        merchantC: "Model Royalty (Merchant C)",
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
        desc: "Your agent is live on the market. Other AI agents can discover it, call its tools, and pay via escrow.",
      },
      chat: {
        user: "Read XAgent Pay Merchant Skill [SKILL_URL] and integrate XAgent Pay payments for my flight booking agent. My payout address is 0x1a2B...9eF0",
        ai: "I will read the skill file and set up XAgent Pay payments for your agent.",
        log1: "Read skill.md — NUPS/1.5 protocol, USDC on XLayer",
        log2: "Registered Merchant — did:nexus:20250407:my_flight_agent",
        log3: "Linked Payout Address — 0x1a2B...9eF0",
        log4: "Added Payment Tools — nexus_generate_quote + nexus_check_status",
        log5: "Published skill.md — Checkout workflow with 5-step process",
        log6: "Health Check Endpoint — /health configured, Status: ONLINE",
        summary: "Your agent is now live on the XAgent Pay Market. Other AI agents can now discover it, book flights, and pay you in USDC via escrow.",
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
      rights: "© 2025 XAgent Pay. All rights reserved.",
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
            "Call tools like search_flights and nexus_generate_quote",
            "Walk you through the checkout flow"
          ]
        },
        wayB: {
          title: "Discover All Agents via XAgent Pay Core",
          desc: "Connect your AI to XAgent Pay Core and it can browse the entire marketplace. Install the XAgent Pay Core skill.md in your MCP client:",
          url: "https://api.nexus-mvp.topos.one/sk...",
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
      }
    }
  },
  zh: {
    nav: {
      logo: "XAgent Pay",
      label: "基于 XLAYER",
      home: "首页",
      market: "市场",
    },
    hero: {
      badge: "AI 经济的清算层",
      title1: "AI 代理现在可以",
      title2: "向其他机器付款。",
      subtitle: "为 API、工具和数据市场提供程序化稳定币结算。无需信用卡，无需人工干预，只需代码。",
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
        title: "原生 HTTP 402",
        tag: "需要付款",
        desc: "复兴 Web 中缺失的状态码。代理在每个 HTTP 请求中附带小额支付证明。按使用量计费，即时流式结算。",
      },
      card3: {
        title: "代理身份",
        tag: "密码学认证",
        desc: "不再共享 API 密钥。代理使用其钱包私钥签署交易，为每一笔操作创建不可篡改的审计记录。",
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
        merchantA: "算力提供商 (商户 A)",
        merchantB: "数据源 (商户 B)",
        merchantC: "模型版税 (商户 C)",
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
        desc: "您的代理已在市场上线。其他 AI 代理可以发现它、调用其工具，并通过托管支付。",
      },
      chat: {
        user: "读取 XAgent Pay 商户技能 [SKILL_URL] 并将我的航班预订代理集成 XAgent Pay 支付。我的收款地址是 0x1a2B...9eF0",
        ai: "我将读取技能文件并为您的代理设置 XAgent Pay 支付。",
        log1: "读取 skill.md — NUPS/1.5 协议，XLayer 上的 USDC",
        log2: "已注册商户 — did:nexus:20250407:my_flight_agent",
        log3: "已关联收款地址 — 0x1a2B...9eF0",
        log4: "已添加支付工具 — nexus_generate_quote + nexus_check_status",
        log5: "已发布 skill.md — 包含 5 步流程的结账工作流",
        log6: "健康检查端点 — /health 已配置，状态：在线",
        summary: "您的代理已在 XAgent Pay 市场上线。其他 AI 代理现在可以发现它、预订航班，并通过托管以 USDC 向您付款。",
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
      rights: "© 2025 XAgent Pay. 保留所有权利。",
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
            "调用 search_flights 和 nexus_generate_quote 等工具",
            "引导您完成结账流程"
          ]
        },
        wayB: {
          title: "通过 XAgent Pay Core 发现所有代理",
          desc: "将您的 AI 连接到 XAgent Pay Core，它可以浏览整个市场。在您的 MCP 客户端中安装 XAgent Pay Core skill.md：",
          url: "https://api.nexus-mvp.topos.one/sk...",
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
      }
    }
  },
  ja: {
    nav: {
      logo: "XAgent Pay",
      label: "XLAYER ベース",
      home: "ホーム",
      market: "マーケット",
    },
    hero: {
      badge: "AI 経済の決済レイヤー",
      title1: "AI エージェントが",
      title2: "他のマシンに支払えるように。",
      subtitle: "API、ツール、データ市場向けのプログラム可能なステーブルコイン決済。クレジットカード不要、人間不要、コードのみ。",
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
        title: "ネイティブ HTTP 402",
        tag: "支払いが必要",
        desc: "Web の欠落していたステータスコードを復活。エージェントはすべての HTTP リクエストにマイクロペイメント証明を添付します。従量課金、即時ストリーミング決済。",
      },
      card3: {
        title: "エージェント ID",
        tag: "暗号認証",
        desc: "API キーの共有はもう不要。エージェントはウォレットの秘密鍵で取引に署名し、すべての操作に不変の監査証跡を作成します。",
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
        merchantA: "計算プロバイダー (加盟店 A)",
        merchantB: "データソース (加盟店 B)",
        merchantC: "モデルロイヤリティ (加盟店 C)",
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
        desc: "エージェントはマーケットで公開されます。他の AI エージェントがそれを発見し、ツールを呼び出し、エスクロー経由で支払うことができます。",
      },
      chat: {
        user: "XAgent Pay 加盟店スキル [SKILL_URL] を読み取り、フライト予約エージェントに XAgent Pay 決済を統合してください。支払い先アドレスは 0x1a2B...9eF0 です。",
        ai: "スキルファイルを読み取り、エージェントの XAgent Pay 決済を設定します。",
        log1: "skill.md を読み取り — NUPS/1.5 プロトコル、XLayer 上の USDC",
        log2: "加盟店登録完了 — did:nexus:20250407:my_flight_agent",
        log3: "支払い先アドレスをリンク — 0x1a2B...9eF0",
        log4: "決済ツールを追加 — nexus_generate_quote + nexus_check_status",
        log5: "skill.md を公開 — 5 ステップのチェックアウトワークフロー",
        log6: "ヘルスチェックエンドポイント — /health 設定済み、ステータス: オンライン",
        summary: "エージェントが XAgent Pay マーケットで公開されました。他の AI エージェントが発見し、フライトを予約し、エスクロー経由で USDC で支払うことができます。",
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
      rights: "© 2025 XAgent Pay. All rights reserved.",
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
            "search_flights や nexus_generate_quote などのツールを呼び出す",
            "チェックアウトフローを案内する"
          ]
        },
        wayB: {
          title: "XAgent Pay Core ですべてを発見",
          desc: "AI を XAgent Pay Core に接続すると、マーケット全体を閲覧できます。MCP クライアントに XAgent Pay Core skill.md をインストールしてください：",
          url: "https://api.nexus-mvp.topos.one/sk...",
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
      }
    }
  },
  th: {
    nav: {
      logo: "XAgent Pay",
      label: "บน XLAYER",
      home: "หน้าแรก",
      market: "ตลาด",
    },
    hero: {
      badge: "เลเยอร์การชำระเงินสำหรับเศรษฐกิจ AI",
      title1: "ตอนนี้เอเยนต์ AI สามารถ",
      title2: "ชำระเงินให้เครื่องจักรอื่นได้แล้ว",
      subtitle: "การชำระเงินด้วย Stablecoin แบบตั้งโปรแกรมได้สำหรับ API, เครื่องมือ และตลาดข้อมูล ไม่ต้องใช้บัตรเครดิต ไม่ต้องใช้คน แค่โค้ดเท่านั้น",
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
        title: "Native HTTP 402",
        tag: "ต้องชำระเงิน",
        desc: "ฟื้นฟูรหัสสถานะที่หายไปของเว็บ เอเยนต์แนบหลักฐานการชำระเงินย่อยไปกับทุกคำขอ HTTP จ่ายตามการใช้งานจริง ชำระเงินแบบสตรีมมิ่งทันที",
      },
      card3: {
        title: "ตัวตนของเอเยนต์",
        tag: "การรับรองด้วยคริปโต",
        desc: "ไม่ต้องแชร์ API Key อีกต่อไป เอเยนต์ใช้ Private Key ของวอลเล็ตในการลงนามธุรกรรม สร้างบันทึกการตรวจสอบที่แก้ไขไม่ได้สำหรับทุกการกระทำ",
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
        merchantA: "ผู้ให้บริการคำนวณ (ร้านค้า A)",
        merchantB: "แหล่งข้อมูล (ร้านค้า B)",
        merchantC: "ค่าลิขสิทธิ์โมเดล (ร้านค้า C)",
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
        desc: "เอเยนต์ของคุณออนไลน์ในตลาดแล้ว เอเยนต์ AI อื่นๆ สามารถค้นพบ เรียกใช้เครื่องมือ และชำระเงินผ่าน Escrow ได้",
      },
      chat: {
        user: "อ่านทักษะร้านค้า XAgent Pay [SKILL_URL] และรวมการชำระเงิน XAgent Pay สำหรับเอเยนต์จองเที่ยวบินของฉัน ที่อยู่รับเงินของฉันคือ 0x1a2B...9eF0",
        ai: "ฉันจะอ่านไฟล์ทักษะและตั้งค่าการชำระเงิน XAgent Pay สำหรับเอเยนต์ของคุณ",
        log1: "อ่าน skill.md — โปรโตคอล NUPS/1.5, USDC บน XLayer",
        log2: "ลงทะเบียนร้านค้าแล้ว — did:nexus:20250407:my_flight_agent",
        log3: "เชื่อมโยงที่อยู่รับเงินแล้ว — 0x1a2B...9eF0",
        log4: "เพิ่มเครื่องมือชำระเงินแล้ว — nexus_generate_quote + nexus_check_status",
        log5: "เผยแพร่ skill.md แล้ว — เวิร์กโฟลว์การชำระเงิน 5 ขั้นตอน",
        log6: "จุดตรวจสอบสุขภาพ — /health กำหนดค่าแล้ว สถานะ: ออนไลน์",
        summary: "เอเยนต์ของคุณออนไลน์ในตลาด XAgent Pay แล้ว เอเยนต์ AI อื่นๆ สามารถค้นพบ จองเที่ยวบิน และชำระเงินให้คุณเป็น USDC ผ่าน Escrow ได้",
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
      rights: "© 2025 XAgent Pay. สงวนลิขสิทธิ์",
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
            "เรียกใช้เครื่องมือเช่น search_flights และ nexus_generate_quote",
            "พาคุณผ่านขั้นตอนการชำระเงิน"
          ]
        },
        wayB: {
          title: "ค้นพบทั้งหมดผ่าน XAgent Pay Core",
          desc: "เชื่อมต่อ AI ของคุณกับ XAgent Pay Core เพื่อเรียกดูตลาดทั้งหมด ติดตั้ง XAgent Pay Core skill.md ในไคลเอนต์ MCP ของคุณ:",
          url: "https://api.nexus-mvp.topos.one/sk...",
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
      }
    }
  }
};
