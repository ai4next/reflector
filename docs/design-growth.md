# 个人成长扩展设计

> 状态: 设计中 (M3/M4) · 关联: [roadmap.md](roadmap.md) · 前置: [design-context.md](design-context.md)

M1/M2 解决「记录」，本文档解决「成长」：让 AI 从单次会话分析升级为跨会话的反思闭环。

分析分层：

```
L1  per-chunk / per-session 分析      (M1 已有, reflections 表)
L2  每日反思日报                       (M3, 本文档 §1)
L3  周/月深度洞察                      (M4, 复用 L2 架构, period 不同)
```

---

## 1. L2 每日反思日报

### 1.1 触发与输入

- **触发**：Celery Beat 定时任务 `generate_daily_reflection`，每日 22:00（用户本地时区）；也可手动 `POST /reflections/daily` 触发。
- **输入**（成本关键：只喂摘要不喂原文）：
  - 当日所有 session 的 **session-level reflection**（summary/themes/action_items/sentiment）
  - 每个 session 的情境元数据：place、participants、时长、time_semantic
  - 未关闭的历史承诺清单（§2）
  - 用户画像卡（§4.2）

### 1.2 输出结构

```json
{
  "date": "2026-06-12",
  "time_allocation": [
    {"place": "公司", "minutes": 310, "people": ["张三", "李四"]},
    {"place": "家", "minutes": 45, "people": []}
  ],
  "key_moments": [
    {"session_id": "...", "note": "与张三的方案争论, 你打断对方 3 次"}
  ],
  "communication_patterns": ["今天你的发言占比 68%, 高于本周均值"],
  "commitments_review": {"new": [...], "due_soon": [...], "overdue": [...]},
  "reflection_questions": [
    "张三提出风险时你立即反驳, 当时你担心的是什么?",
    "...",
    "..."
  ]
}
```

### 1.3 存储：复用 reflections 表

不新建表，在 `reflections` 表上扩展（与现有 per-chunk/session-level 的判别方式一致）：

```python
# ReflectionModel 新增列
period_type  = Column(String(20), nullable=False, default="session")
               # session | chunk | daily | weekly | monthly
period_date  = Column(Date, nullable=True)       # daily/weekly/monthly 时使用
content      = Column(JSONB, default=dict)       # L2/L3 的结构化输出
# session_id 对 daily 反思为 NULL → 需将该列改为 nullable
```

判别规则更新：

| 类型 | session_id | chunk_id | period_type |
|------|-----------|----------|-------------|
| per-chunk | 非空 | 非空 | chunk |
| session-level | 非空 | NULL | session |
| 每日日报 | NULL | NULL | daily |

每条洞察附 `evidence`（session/segment id 列表），UI 可点开回溯原始对话——这是建立信任的关键。

### 1.4 反思问题的回应即新数据

日报中的 3 个反思问题支持用户语音/文字回应，回应作为一个 `metadata.kind="journal"` 的特殊 session 进入事件流，参与次日及周度分析。这形成「AI 提问 → 用户反思 → AI 理解加深」的飞轮。

---

## 2. 承诺追踪 (Commitments)

把 L1 已经在产出的 `action_items` 从"一次性展示"升级为"有生命周期的承诺"。

### 2.1 数据模型

```python
class CommitmentModel(Base):
    __tablename__ = "commitments"
    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id     = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    session_id  = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True)
    text        = Column(Text, nullable=False)        # "周五前把方案发给李总"
    committed_to = Column(UUID(as_uuid=True), ForeignKey("speakers.id"), nullable=True)  # 向谁承诺
    due_hint    = Column(String(100), nullable=True)  # LLM 提取的时间线索 "周五前"
    due_date    = Column(Date, nullable=True)         # 解析/用户确认后的日期
    status      = Column(String(20), default="open")  # open | done | dropped
    created_at / closed_at = ...
```

### 2.2 流程

```
L1 分析提取 action_items (现有)
  → 升级 Prompt: 区分「我对他人的承诺」(commitment) 与「一般待办」
  → 自动创建 commitment 记录 (status=open, 关联 session 与 committed_to speaker)
  → 用户可编辑/确认 due_date, 标记 done/dropped
  → L2 日报固定包含 commitments_review 段落, 逾期持续提醒
```

去重：新承诺与已有 open 承诺做语义相似度比对（embedding 余弦 > 0.85 提示合并），避免同一件事跨会话重复创建。

---

## 3. 回忆检索 (RAG)

自然语言问自己的历史：「上个月张三跟我说的那个预算是多少？」

### 3.1 向量化

- **粒度**：以 segment 为基本单元，过短的（<20 字）与相邻同 speaker segment 合并后再向量化；session summary 单独向量化（粗粒度召回）。
- **存储**：pgvector，新表：

```python
class EmbeddingModel(Base):
    __tablename__ = "embeddings"
    id          = ...
    user_id     = ...
    source_type = Column(String(20))    # segment | summary | reflection
    source_id   = Column(UUID(as_uuid=True), nullable=False)
    session_id  = Column(UUID(as_uuid=True), index=True)   # 过滤用冗余
    speaker_id  = Column(UUID(as_uuid=True), nullable=True)
    occurred_at = Column(DateTime(timezone=True))           # 时间过滤
    text        = Column(Text)
    embedding   = Column(Vector(1024))   # bge-m3
    __table_args__ = (Index("idx_embeddings_hnsw", "embedding",
                            postgresql_using="hnsw",
                            postgresql_ops={"embedding": "vector_cosine_ops"}),)
```

- **Embedding 模型**：bge-m3（本地，中文强，1024 维），与"数据不出本机"的隐私立场一致；Worker 内常驻加载，与 WhisperX 同模式。
- **写入时机**：process_chunk Phase 5 存 segments 后追加 Phase 5.5 向量化（同步完成，量小不必另起任务）。

### 3.2 查询链路 `POST /ask`

```
用户问题
  → LLM 解析查询意图: 提取 人物/时间范围/地点 过滤条件 + 改写检索 query
  → pgvector 余弦 TopK (k=12) + 结构化过滤 (speaker_id, occurred_at, place)
  → 召回 segment 及其前后文 (同 chunk 相邻 ±2 segments)
  → LLM 生成答案, 强制附引用 [session_id, segment_id]
  → 响应: {answer, sources: [{session_title, occurred_at, speaker, text}]}
```

无召回或低相关时如实回答「没有找到相关记录」，禁止编造。

---

## 4. AI 教练对话 (M4)

### 4.1 形态

一个多轮对话接口 `POST /coach/chat`，区别于 §3 的单轮问答：

- 教练**了解你的全部历史**：每轮对话前 RAG 检索相关记忆 + 注入用户画像卡
- 教练**主动引导**而非被动回答：苏格拉底式提问，引用真实数据
  - "你三周前说要每周健身三次，但记录显示只去过一次，发生了什么？"
- 对话本身入事件流，成为画像更新的来源

### 4.2 用户画像卡 (Profile Card)

一份持续维护的结构化文档，作为所有 L2/L3/教练 Prompt 的系统上下文：

```json
{
  "values_and_goals": ["希望成为更好的倾听者", "今年完成转岗"],
  "communication_patterns": ["倾向于快速反驳", "对下属耐心高于对平级"],
  "coaching_preferences": "直接指出问题, 不要客套",
  "updated_at": "..."
}
```

- 存储：`users` 表加 `profile_card JSONB` 列（或独立单行表）。
- 更新机制：每次 L2/L3 反思后，LLM 输出「画像增量建议」，**经用户确认后**合并——画像必须用户可见、可编辑、可删除，不做黑箱。

---

## 5. 实施优先级与依赖

```
M3:  L2 日报 ──> 承诺追踪 (日报中追踪)
      │
      └────────> RAG 检索 (embeddings 基建)
M4:  AI 教练 (依赖 RAG + 画像卡)
     习惯/目标/人际图谱/情绪曲线 (依赖 M2 places/speakers, 按数据反馈排序)
```

| 顺序 | 功能 | 理由 |
|------|------|------|
| 1 | L2 日报 | 系统价值核心，把"分析"变成"每天的反思仪式" |
| 2 | 承诺追踪 | 把"分析"变成"行动"，留存价值最高 |
| 3 | RAG 检索 | embeddings 基建同时服务承诺去重和后续教练 |
| 4 | AI 教练 | 数据消费的最终出口，需前三者数据积累 |

成本预估（自用单人）：L1 用小模型，L2 每日一次大模型调用（输入 ~3K tokens 摘要），RAG embedding 本地——月成本控制在个位数美元。
