# 个人数据资产与知识库设计

> 状态: 设计中 (M3/M4) · 关联: [roadmap.md](roadmap.md) · 前置: [design-context.md](design-context.md), [design-growth.md](design-growth.md)

Reflector 的核心属性：**个人数据资产 + 反思 + 学习 + 个人成长**。

录音只是数据入口之一。本文档定义系统的资产层——让所有个人数据（对话、反思、上传的文档、笔记、收藏）沉淀为**可检索、可复利、归用户所有**的数字资产，并在其上构建学习与成长闭环。

```
输入层          资产层 (本文档)              消费层
─────────      ─────────────────           ─────────────────
录音对话   ──┐                          ┌── 回忆检索 (RAG)
日记/速记  ──┤   统一资产模型 (assets)   ├── 反思日报 (引用资产)
用户上传   ──┤ → 知识提炼 (knowledge)  ──├── AI 教练 (基于全部资产)
反思回应   ──┤   向量化 + 实体关联       ├── 学习计划与复习
AI 洞察    ──┘                          └── 数据导出 (资产归属用户)
```

---

## 1. 统一资产模型 (Asset)

### 1.1 设计原则

1. **一切皆资产**：录音转写、AI 反思、用户上传的 PDF、随手记的一段笔记，统一抽象为 `asset`，共享检索/标签/引用能力。
2. **来源可追溯**：每个资产记录 `source_type` 与原始引用，AI 生成的资产必须能回溯到证据。
3. **归属用户**：所有资产支持一键导出（Markdown + JSON），删除即彻底删除。

### 1.2 数据模型

```python
class AssetModel(Base):
    __tablename__ = "assets"
    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id     = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    asset_type  = Column(String(30), nullable=False)
    # conversation | reflection | journal | document | note | link | insight
    title       = Column(String(500), nullable=True)
    content     = Column(Text, nullable=True)          # 文本内容 (文档为提取后全文)
    source_type = Column(String(30), nullable=False)   # recording | upload | manual | ai_generated
    source_ref  = Column(UUID(as_uuid=True), nullable=True)  # session_id / reflection_id 等
    file_path   = Column(String(1000), nullable=True)  # 上传文件的存储路径
    mime_type   = Column(String(100), nullable=True)
    tags        = Column(JSONB, default=list)
    metadata_   = Column("metadata", JSONB, default=dict)  # 地点/人物/原始链接等
    occurred_at = Column(DateTime(timezone=True), nullable=True)  # 内容发生时间 (≠创建时间)
    created_at / updated_at = ...
```

| asset_type | 来源 | 示例 |
|------------|------|------|
| conversation | 录音管线自动生成 | 一次会议的结构化转写 + 摘要 |
| reflection | L1/L2/L3 分析自动生成 | 每日反思日报 |
| journal | 用户语音/文字日记 | 「记一下：刚才面试感觉…」 |
| document | 用户上传 | PDF / Word / Markdown / TXT |
| note | 用户手动创建 | 读书笔记、想法速记 |
| link | 用户收藏 | 网页链接（抓取正文存档） |
| insight | 知识提炼自动生成 (§2) | 「张三关于定价的观点」知识卡片 |

录音 session 完成后由管线自动创建 `conversation` 资产（`source_ref=session_id`），存量数据可一次性回填。

### 1.3 用户上传链路

```
POST /assets (multipart: file 或 {content, asset_type})
  → 类型校验 (pdf/docx/md/txt/图片, 单文件 ≤50MB)
  → 文本提取:
      PDF/Docx → pypdf / python-docx
      图片     → OCR (可选, 后期)
      链接     → 抓取正文 (readability)
  → 创建 asset 记录 (status=processing)
  → Celery 任务: 分块 → 向量化入 embeddings 表 (复用 M3 RAG 基建)
  → LLM 轻量分析: 自动打标签、生成摘要、抽取实体 (人物/主题)
  → status=ready, 进入知识库可检索
```

文件存储：本地目录（自用）或 S3 兼容对象存储，路径写 `file_path`；与音频不同，**上传的文档是资产本体，永久保留**（除非用户删除）。

---

## 2. 知识提炼 (Knowledge Distillation)

资产是原料，知识是提炼物。系统定期从资产中提炼**知识卡片 (insight)**：

### 2.1 提炼来源与触发

| 触发 | 提炼内容 |
|------|---------|
| 对话分析时 (L1) | 对话中有价值的观点/事实/决策 →「金句卡」「决策卡」 |
| 文档上传后 | 文档核心论点 →「文献卡」 |
| 周期反思时 (L2/L3) | 跨资产的模式洞察 →「模式卡」（如"你在压力下倾向于回避冲突"） |
| 用户手动 | 选中任意文本「存为知识卡」 |

知识卡片本身也是 asset（`asset_type=insight, source_type=ai_generated`），附 evidence 引用原始资产。

### 2.2 实体与关联

复用 M2 的 speakers / places 作为实体维度，新增主题标签：

```python
class AssetLinkModel(Base):
    __tablename__ = "asset_links"
    id         = ...
    asset_id   = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"))
    entity_type = Column(String(20))   # speaker | place | topic | asset
    entity_id   = Column(UUID(as_uuid=True), nullable=True)  # speaker_id/place_id/关联 asset_id
    topic       = Column(String(100), nullable=True)         # entity_type=topic 时使用
```

由此支持的查询视图：
- 按人物聚合：「张三相关的所有对话、知识卡、文档」
- 按主题聚合：「'定价策略' 主题下的全部资产」
- 资产间关联：知识卡 ←→ 来源对话 ←→ 相关文档

### 2.3 检索升级

M3 的 `POST /ask`（[design-growth.md](design-growth.md) §3）检索范围从 segments 扩展到**全部资产**：embeddings 表的 `source_type` 已预留 `segment | summary | reflection`，扩展为 `segment | summary | reflection | asset_chunk`。问「上次读的那本书里讲拖延的部分」与问「上个月张三说的预算」走同一条链路。

---

## 3. 学习闭环 (Learning Loop)

> 本节是学习能力的最初草案。完整的学习提升系统（技能模型、缺口检测、检验式回顾、练习意图与应用检测）已扩展为独立文档：**[design-learning.md](design-learning.md)**。本节保留资产层视角的概述，细节以该文档为准。

资产沉淀后的核心消费场景——把「收集」变成「内化」：

### 3.1 学习主题 (Learning Topics)

```python
class LearningTopicModel(Base):
    __tablename__ = "learning_topics"
    id         = ...
    user_id    = ...
    title      = Column(String(255))      # "谈判技巧" / "Rust 语言"
    goal_id    = Column(UUID, ForeignKey("goals.id"), nullable=True)  # 关联成长目标
    status     = Column(String(20), default="active")  # active | paused | done
```

- 用户上传/收藏的资料可归入学习主题；对话中出现相关讨论时 AI 自动关联（「今天与张三的对话涉及你正在学习的'谈判技巧'」）。
- L2 日报包含学习投入统计：本日/本周在各主题上的输入（阅读、对话）与输出（笔记、实践）。

### 3.2 复习与内化

- **回顾队列**：知识卡片按遗忘曲线（简化 SM-2 间隔：1/3/7/21 天）进入每日回顾，随 L2 日报推送 2-3 张。
- **检验式回顾**：不只是重读，AI 把知识卡转成提问（「上周你存的那条定价原则是什么？它适用于什么前提？」），用户回答后 AI 给反馈——回答本身又成为 journal 资产。
- **学以致用追踪**：AI 在后续对话转写中检测知识的实际运用（「你今天在会议中用到了上周学的'先问后说'技巧」），写入该知识卡的 `metadata.applied_count`。

### 3.3 与成长闭环的协同

```
上传资料/对话输入 → 资产沉淀 → 知识提炼 → 复习内化 → 实践检测(录音) → 反思(L2) → 新一轮输入
```

这条循环就是「个人资产 + 反思 + 学习 + 成长」四个核心属性的连接方式：资产是底座，反思和学习是两个消费引擎，成长是输出。

---

## 4. API 设计 (规划)

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/assets` | 创建资产（multipart 上传文件 或 JSON 提交 note/link） |
| `GET` | `/assets?asset_type=&tag=&speaker_id=&q=` | 资产列表，多维过滤 + 关键词 |
| `GET` | `/assets/{id}` | 资产详情（含关联实体与引用关系） |
| `PATCH` | `/assets/{id}` | 编辑标题/标签/内容 |
| `DELETE` | `/assets/{id}` | 删除（含向量与文件） |
| `GET` | `/assets/{id}/related` | 相关资产（向量相似 + 实体共现） |
| `POST` | `/assets/{id}/distill` | 手动触发知识提炼 |
| `GET` | `/knowledge/review-queue` | 今日待回顾知识卡 |
| `POST` | `/knowledge/{id}/review` | 提交回顾结果 `{quality: 0-5}` 更新间隔 |
| `GET` | `/learning-topics` / `POST` / `PATCH` | 学习主题管理 |
| `GET` | `/export` | 全量导出个人数据资产（Markdown + JSON 打包） |

---

## 5. 实施切分

| 阶段 | 内容 | 依赖 |
|------|------|------|
| M3 内 | assets 表 + conversation/reflection 自动入资产 + 上传链路（文档/笔记）+ 检索范围扩展 | M3 embeddings 基建 |
| M3 内 | 全量导出 `/export`（资产归属感的底线功能，宜早不宜晚） | assets 表 |
| M4 | 知识提炼卡片、实体关联视图、学习主题 | M2 speakers/places |
| M4 | 复习队列、检验式回顾、学以致用追踪 | 知识卡片 + L2 日报 |

成本与隐私沿用既有约束：提炼用小模型批处理；上传文档默认仅本地存储；导出/删除即彻底。
