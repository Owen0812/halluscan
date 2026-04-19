# HalluScan — AI 内容合规审核系统

面向电商营销场景的 Multi-Agent 合规审核系统，基于 LangGraph 实现，自动检测 AI 生成文案中的广告法违规、虚假参数声明和夸大宣传，输出结构化合规报告并生成合规版本文案。

---

## 目录

- [背景与痛点](#背景与痛点)
- [系统架构](#系统架构)
- [每个 Agent 的职责](#每个-agent-的职责)
- [记忆系统](#记忆系统)
- [可观测性](#可观测性)
- [评测结果](#评测结果)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [本地运行](#本地运行)
- [API 文档](#api-文档)
- [关键设计决策](#关键设计决策)

---

## 背景与痛点

电商和内容平台大量使用 AI 生成营销文案，但存在以下合规风险：

| 问题 | 示例 | 传统方案的局限 |
|---|---|---|
| 广告法极限词 | "全球最好用"、"史上最低价" | 关键词过滤能抓，但误报率高 |
| 虚假参数声明 | "7天美白"、"有效率97.3%" | 关键词过滤完全无法识别 |
| 无依据功效声明 | "临床证明""根治失眠" | 语义层面的夸大，关键词扫不出来 |
| 缺乏可解释性 | — | 只知道"违规"，不知道哪条法规、怎么改 |

HalluScan 用 Multi-Agent 架构解决这些问题：确定性词库扫描 + LLM 语义分析 + 实时搜索核查，三路并行，给出带法规引用的结构化报告和修复版本。

---

## 系统架构

```
输入：AI 生成的营销文案 / 商品描述
                │
         ┌──────▼──────┐
         │  Guardian   │  ← 提示词注入检测，拦截恶意输入
         └──────┬──────┘
                │ is_safe = true
         ┌──────▼──────────┐
         │  Orchestrator   │  ← 识别文案类型（美妆/食品/电子等），概述主要风险
         └──────┬──────────┘
                │
         ┌──────▼──────────┐
         │ Memory Retrieve │  ← 从 pgvector 检索历史相似违规案例，注入 Verdict 上下文
         └──┬──────┬────┬──┘
            │      │    │       ← 三路并行执行（LangGraph fan-out）
     ┌──────▼──┐ ┌─▼──────────┐ ┌──▼──────┐
     │Compliance│ │ Fact-Check │ │  Tone   │
     │  Agent  │ │   Agent    │ │  Agent  │
     │         │ │            │ │         │
     │广告法违规│ │商品参数/功效│ │夸大宣传 │
     │词库精确 │ │声明真实性  │ │情感语义 │
     │扫描+LLM │ │Tavily搜索  │ │分析     │
     │语义补充 │ │验证+LLM综合│ │         │
     └──────┬──┘ └─┬──────────┘ └──┬──────┘
            │      │                │
            └──────┴────────┬───────┘
                            │ 三路全部完成后 fan-in
                     ┌──────▼──────┐
                     │   Verdict   │  ← 汇总三路，给出 🔴违规/⚠️存疑/✅合规
                     │    Agent    │  ← 注入历史案例上下文
                     └──────┬──────┘
                            │
                     ┌──────▼──────┐
                     │  Fix Agent  │  ← 生成合规版本文案，逐条说明修改原因
                     └──────┬──────┘
                            │
                     ┌──────▼──────┐
                     │ Memory Save │  ← 将本次审核蒸馏为结构化违规模式存入数据库
                     └──────┬──────┘
                            │
                     结构化合规报告输出
```

整条链路支持 **SSE 流式推送**：前端在每个节点完成时即时收到更新，不需等待全部完成。

---

## 每个 Agent 的职责

### Guardian Agent
检测提示词注入攻击。判断规则：营销文案中出现极限词/功效词是**正常输入**；只有文本本身试图操控 AI 系统（如"忽略之前的指令"、越狱指令）时才拦截。这个区分很重要——初版没有区分，导致含违规词的正常文案被错误拦截。

### Orchestrator Agent
识别文案所属行业（美妆、食品、保健品、电子产品、服装、母婴、医疗器械等），给出一句话风险概述。结果用于记忆系统的行业标签，帮助检索同行业历史案例。

### Compliance Agent
两步走：
1. **确定性词库扫描**：用 `violations.json`（6 类别：极限词、禁用词、医疗声明、功效声明、绝对化用语、可疑数据）做关键词 + 正则精确匹配，每条命中附法规条款和风险等级
2. **LLM 语义补充**：在词库命中基础上，由 LLM 补充语义层面的违规（如隐性绝对化表述）

两者结合比单独使用任何一个都更准确：词库保证召回、LLM 控制误报。

### Fact-Check Agent
三步走：
1. **声明提取**：LLM 从文案中提取需要核查的功效/排名/数据声明（过滤掉不需要核查的产品规格、材质描述）
2. **Tavily 搜索**：对每条声明调用 Tavily API 搜索相关证据（最多 2 条，节省配额）
3. **综合判断**：LLM 基于搜索结果给出 `true/false/unverifiable/not_applicable` 四类判断，并后处理过滤纯产品规格类，防止误报

### Tone Agent
检测无根据的效果声明、情绪煽动性语言和隐性绝对化表述，给出具体问题和修改建议。

### Verdict Agent
汇总三路结果，按优先级裁决：
- 合规检测有明确违规词 → 🔴 违规
- 事实核查 risk=high 且有被证伪声明 → 🔴 违规
- 事实核查 risk=medium 或夸大宣传 risk=high → ⚠️ 存疑
- 三路均无实质风险 → ✅ 合规（规则兜底，防止 LLM 过度保守）

同时注入历史相似案例上下文，让判断更稳定。

### Fix Agent
根据 Verdict 报告生成合规版本，保留原文案营销意图和风格，逐条记录修改点和修改原因。

---

## 记忆系统

每次审核完成后，系统将结果蒸馏为结构化违规模式对象存入 PostgreSQL：

```json
{
  "industry": "美妆",
  "pattern": "含'7天美白'类时效性功效声明",
  "verdict": "违规",
  "law_refs": ["广告法第28条"],
  "key_issues": ["虚假效果声明", "无临床依据"]
}
```

**检索策略（混合检索 + RRF 融合）**：

下次审核同类文案时，Memory Retrieve Agent 用两路并行检索历史案例：

| 检索路 | 方法 | 擅长 |
|---|---|---|
| 语义层 | pgvector 余弦相似度，Top-20 | 捕捉同类型但用词不同的违规模式 |
| 词法层 | PostgreSQL tsvector BM25，Top-20 | 精确匹配行业词、法规关键词 |

两路结果用 **Reciprocal Rank Fusion（RRF, k=60）** 融合，取 Top-3 注入 Verdict Agent 上下文。效果：系统见过的违规模式越多，同类文案的判断越准确，本质上是让系统"越用越准"。

**降级策略**：未配置 `DATABASE_URL` 时，所有记忆函数静默返回空值，主流程不受任何影响。

---

## 可观测性

接入 **Langfuse**，每次 `/scan` 请求生成一条完整 Trace：

- 每个 Agent（节点）的调用独立记录为 Observation
- 完整 prompt / LLM response / token 消耗可逐层查看
- 审核完成后写入 `verdict_score`（违规=0 / 存疑=0.5 / 合规=1.0），方便聚合分析准确率趋势

**实测各节点耗时（本地，Qwen-Plus）**：

| 节点 | 耗时 |
|---|---|
| Guardian | ~3.7s |
| Orchestrator | ~5.5s |
| 三路并行（compliance / factcheck / tone） | 最慢路 ~5s，并行总耗时 ~5s |
| Verdict | ~4s |
| Fix | ~7s |
| **端到端总计** | **~28s** |

并行执行比串行节省约 **40%** 时间（三路串行约需 15s，并行仅需最慢一路的时间）。

---

## 评测结果

自建标注数据集（100 条：50 条已知违规 + 50 条合规），运行三套系统对比：

| 系统 | Precision | Recall | F1 | Accuracy |
|---|---|---|---|---|
| Baseline 1：关键词匹配 | 0.9333 | 0.8400 | 0.8842 | 0.8900 |
| Baseline 2：单 Agent | 0.9804 | 1.0000 | 0.9901 | 0.9900 |
| **HalluScan Multi-Agent** | **0.9615** | **1.0000** | **0.9804** | **0.9800** |

**关键结论**：

- HalluScan **Recall = 1.0，零漏报**，比关键词基线 F1 高 **+9.6 个百分点**
- 单 Agent 基线 F1 略高于 HalluScan（差 1 个 FP，100 条样本内的统计波动）。Multi-Agent 的实际优势不在准确率数字，而在**可解释性**：每次审核给出具体违规条款、搜索证据、逐条修改建议——单 Agent 无法提供这个粒度的报告
- HalluScan 精确率从开发初期的 0.54 通过三层迭代提升到 0.96：① Prompt 工程优化（明确区分"需要标记"和"不需要标记"的场景）；② 后处理过滤（去除产品规格类 not_applicable 声明）；③ Python 规则兜底（三路全低风险强制合规）

---

## 技术栈

| 层 | 技术选型 | 说明 |
|---|---|---|
| Agent 框架 | LangGraph 1.1.8 | StateGraph，支持 fan-out/fan-in 并行，astream 逐节点推送 |
| LLM | 阿里百炼 Qwen-Plus | 通过 OpenAI 兼容接口调用（非 langchain-dashscope，原因见下方） |
| Embedding | DashScope text-embedding-v3 | 1024 维，用于记忆系统语义检索 |
| 搜索 | Tavily API | 专为 AI Agent 设计的搜索 API，免费额度够用 |
| 违规词库 | 自建 JSON | 6 类别，含法规条款和风险等级，支持关键词 + 正则两种匹配 |
| 记忆 | PostgreSQL + pgvector + BM25 + RRF | 混合检索，Docker 容器化，pgvector/pgvector:pg16 |
| 安全层 | Guardian Agent | 基于 LLM 的提示词注入检测 |
| 可观测性 | Langfuse Cloud | 全链路追踪，v4 接口 |
| 后端 | FastAPI + SSE | 流式推送各节点进度，CORS 支持前端跨域 |
| 前端 | Next.js 14 + TypeScript + Tailwind CSS | SSE 消费，实时更新 Agent 状态 |

---

## 目录结构

```
halluscan/
├── backend/
│   ├── app.py                      # FastAPI 入口，POST /scan + GET /scan/stream
│   ├── requirements.txt
│   ├── config/
│   │   ├── .env                    # 本地配置（不提交）
│   │   └── .env.example            # 配置模板
│   ├── data/
│   │   └── violations.json         # 违规词库（6 类别，每条含法规条款 + 风险等级）
│   ├── graph/
│   │   ├── agents.py               # 9 个 Agent 函数
│   │   └── workflow.py             # LangGraph StateGraph + HalluScanState
│   ├── tools/
│   │   ├── violation_db.py         # 关键词 + 正则扫描，懒加载
│   │   └── search.py               # Tavily 搜索封装，单例 Client
│   ├── memory/
│   │   └── store.py                # init_db / save_memory / retrieve_memories
│   └── observability/
│       └── tracer.py               # Langfuse callback handler（v4 接口）
│
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── layout.tsx          # 根布局
│       │   └── page.tsx            # 主页（Input + Timeline + Report 三栏布局）
│       ├── components/
│       │   ├── ScanInput.tsx       # 文案输入框 + 提交按钮
│       │   ├── AgentCard.tsx       # 单个 Agent 状态卡片（等待/运行中/完成）
│       │   ├── AgentTimeline.tsx   # 多 Agent 并行执行时间线
│       │   └── VerdictReport.tsx   # 结构化合规报告 + 修复版本展示
│       └── lib/
│           ├── api.ts              # SSE 客户端，消费后端流式推送
│           └── store.tsx           # Zustand 全局状态（phase / agentNodes / report）
│
└── eval/
    ├── dataset.json                # 100 条标注样本（50 违规 + 50 合规）
    ├── run_eval.py                 # 评测入口，支持 --limit / --systems 参数
    ├── baseline_keyword.py         # 关键词匹配基线
    ├── baseline_single_agent.py    # 单 Agent 基线
    ├── metrics.py                  # Precision / Recall / F1 / Accuracy 计算
    └── results/                    # 评测结果 JSON 输出
```

---

## 本地运行

### 前置条件

- Python 3.10+（推荐用 conda 虚拟环境）
- Node.js 18+
- Docker（用于 PostgreSQL + pgvector）
- [阿里百炼 API Key](https://bailian.console.aliyun.com/)（免费额度充足）
- [Tavily API Key](https://app.tavily.com/)（免费额度足够开发使用）
- [Langfuse 账号](https://cloud.langfuse.com/)（可选，用于可观测性）

### 第一步：启动数据库

```bash
# 首次创建容器
docker run -d \
  --name halluscan-db \
  -e POSTGRES_USER=halluscan \
  -e POSTGRES_PASSWORD=halluscan123 \
  -e POSTGRES_DB=halluscan \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# 每次重启电脑后执行
docker start halluscan-db
```

> 如果不需要记忆系统，可以跳过这一步。不配置 `DATABASE_URL` 时，系统会自动禁用记忆功能，其余功能完全正常。

### 第二步：配置并启动后端

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 复制配置模板并填入 API Key
cp config/.env.example config/.env
```

编辑 `backend/config/.env`：

```env
# 必填
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxx
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxx

# 记忆系统（可选，不填则禁用记忆功能）
DATABASE_URL=postgresql://halluscan:halluscan123@localhost:5432/halluscan

# Langfuse 可观测性（可选，不填则禁用追踪）
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx
LANGFUSE_HOST=https://cloud.langfuse.com
```

```bash
# 启动后端（开发模式，热重载）
uvicorn app:app --port 8000 --reload
```

后端启动时会自动建表并检测 embedding 维度，看到 `[Memory] DB initialized` 和 `[Memory] Embedding dim = 1024` 说明记忆系统已就绪。

### 第三步：启动前端

```bash
cd frontend
npm install
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。

### 第四步：运行评测（可选）

```bash
cd eval

# 快速验证（前10条，只跑关键词基线，最快）
python run_eval.py --limit 10 --systems keyword

# 跑两个基线（不消耗 HalluScan API 配额）
python run_eval.py --limit 10 --systems keyword,single_agent

# 完整评测（100条，三套系统，约需 50 分钟）
python run_eval.py
```

结果保存在 `eval/results/`，包含每条样本的预测明细和汇总指标。

---

## API 文档

### POST /scan — 同步审核

```
POST http://localhost:8000/scan
Content-Type: application/json

{
  "text": "本品采用纳米技术，7天美白，临床证明有效率97.3%，全球最好用！"
}
```

响应示例：

```json
{
  "verdict": {
    "verdict": "违规",
    "verdict_emoji": "🔴",
    "overall_risk": "high",
    "summary": "含极限词'最好用'及无依据的时效性功效声明",
    "key_issues": ["极限词", "虚假功效声明"],
    "law_references": ["广告法第9条", "广告法第28条"]
  },
  "compliance_result": { ... },
  "factcheck_result": { ... },
  "tone_result": { ... },
  "fixed_text": "本品采用纳米技术，有助于改善肌肤状态，个体效果可能有差异。",
  "fix_changes": [
    {
      "original": "7天美白",
      "fixed": "有助于改善肌肤状态",
      "reason": "删除无依据的时效性功效声明"
    }
  ]
}
```

### GET /scan/stream — SSE 流式审核

```
GET http://localhost:8000/scan/stream?text=...
Accept: text/event-stream
```

推送事件序列：

```
data: {"event": "start"}

data: {"event": "node_complete", "node": "guardian", "label": "安全检测", "data": {"is_safe": true}}

data: {"event": "node_complete", "node": "orchestrator", "label": "审核调度", "data": {"content_type": "美妆", "risk_summary": "..."}}

data: {"event": "node_complete", "node": "compliance", "label": "广告法合规检测", "data": {...}}

data: {"event": "node_complete", "node": "factcheck", "label": "事实核查", "data": {...}}

data: {"event": "node_complete", "node": "tone", "label": "语气分析", "data": {...}}

data: {"event": "node_complete", "node": "verdict", "label": "裁决", "data": {...}}

data: {"event": "node_complete", "node": "fix", "label": "文案修复", "data": {...}}

data: {"event": "done"}
```

如果 Guardian 拦截：

```
data: {"event": "blocked", "reason": "检测到提示词注入攻击"}
```

---

## 关键设计决策

**1. 为什么用 langchain-openai 而不是 langchain-dashscope？**

`langchain-dashscope` 内部依赖 `pydantic_v1`，与 `langchain-core >= 0.3` 不兼容（pydantic_v1 已被移除），会在启动时报 `ImportError`。阿里百炼提供 OpenAI 兼容接口，直接用 `langchain-openai` + `openai_api_base` 切换 endpoint 即可，稳定且无依赖冲突。

**2. Compliance Agent 为什么要词库 + LLM 两层？**

- 纯 LLM：擅长语义，但对极限词这种固定词汇的召回不稳定（有时漏判）
- 纯词库：召回稳定，但语境判断能力差（如"100%纯棉"不是违规，但"100%有效"是违规）
- 两层结合：词库保召回，LLM 做语境补充和误报过滤，准确率最高

**3. Verdict Agent 为什么加规则兜底？**

LLM 倾向于保守，在三路检测均无实质风险时仍可能输出"存疑"。加了 Python 规则：三路 risk_level 全为 low 时强制输出合规。这让精确率从 0.54 跳升至接近最终水平。

**4. 记忆系统为什么用 RRF 而不是纯向量检索？**

向量检索在语义相似度上表现好，但对行业专有词汇（"广告法第28条"、"保健食品"）匹配不稳定。BM25 对这类关键词精确匹配好但语义理解弱。RRF 融合取两者之长，且 k=60 的设置对小数据集友好（惩罚排名靠后的结果）。

**5. 部署注意事项**

Tavily 服务器在美国，若后端部署在中国大陆服务器会被墙。解决方案：将 Fact-Check Agent 中的 Tavily 搜索替换为阿里百炼 `qwen-plus-search`（内置联网搜索，国内可用）。当前开发环境（本地）不受影响。
