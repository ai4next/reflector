# 学习提升系统设计

> 状态: 设计中 (M3/M4) · 关联: [vision.md](vision.md), [roadmap.md](roadmap.md) · 前置: [design-knowledge.md](design-knowledge.md)（资产层）, [design-context.md](design-context.md)（情境数据）

「个人资产 + 反思 + 学习 + 成长」四个核心属性中，**学习是把输入变成能力的引擎**。本文档把学习从"知识收藏 + 复习"升级为完整的学习提升系统。

## 0. 核心理念：证据驱动的学习闭环

市面上的学习工具（Anki、Readwise、各类课程 App）都止步于「输入 → 记住」。但记住不等于学会——**学会的唯一证据是行为改变**。Reflector 的不公平优势恰好在这里：它持续记录你的真实对话，能客观检验"你学的东西有没有用出来"。

```
       学什么                 怎么学                  学会了吗
  ┌──────────────┐      ┌──────────────┐      ┌──────────────────┐
  │ 缺口检测      │      │ 知识内化      │      │ 应用检测          │
  │ 从真实对话中  │ ──>  │ 复习队列      │ ──>  │ 从后续对话转写中  │
  │ 发现你不会的  │      │ 检验式提问    │      │ 检测知识被运用    │
  └──────────────┘      └──────────────┘      └────────┬─────────┘
         ▲                                              │
         └────────────── 反思反馈（L2 日报）<────────────┘
```

四个环节全部建立在已有基建之上：缺口检测和应用检测复用录音转写管线，内化复用资产层的知识卡片，反馈复用 L2 日报。

---

## 1. 技能模型 (Skills)

学习的对象不只是「知识」，更是「技能」。系统维护用户的技能树，每项技能的水平评估**基于对话证据**而非自评。

### 1.1 数据模型

```python
class SkillModel(Base):
    __tablename__ = "skills"
    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id     = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name        = Column(String(255), nullable=False)    # "倾听" / "结构化表达" / "向上汇报"
    category    = Column(String(50), nullable=True)      # communication | leadership | domain | ...
    description = Column(Text, nullable=True)            # 用户对"做到什么程度算好"的定义
    status      = Column(String(20), default="active")   # active | paused | achieved
    goal_id     = Column(UUID(as_uuid=True), ForeignKey("goals.id"), nullable=True)
    created_at  = Column(DateTime(timezone=True), ...)


class SkillEvidenceModel(Base):
    """技能的证据轨迹——每条评估都可回溯到原始对话。"""
    __tablename__ = "skill_evidence"
    id          = ...
    skill_id    = Column(UUID(as_uuid=True), ForeignKey("skills.id", ondelete="CASCADE"))
    session_id  = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"))
    direction   = Column(String(10))      # positive | negative
    note        = Column(Text)            # "在张三质疑时先复述了对方观点再回应"
    segment_ids = Column(JSONB, default=list)   # 证据引用，可点开验证
    created_at  = ...
```

### 1.2 评估机制

- L1 分析（每个 session）时，对照用户的 active skills 检查转写中的正反例，写入 `skill_evidence`。Prompt 中注入技能定义与最近 3 条证据，避免重复啰嗦的评判。
- **不打分数**。技能水平不用 1-5 星量化（自我认知系统不做仪表盘，见 [vision.md](vision.md) 非目标），而是呈现**证据轨迹**：「倾听：最近 30 天 7 条正例 / 2 条反例，对比上月反例减少」。
- L2 日报中带技能小结：「今天有一次'结构化表达'的好例子（点开看原文）」。

---

## 2. 缺口检测：从对话中发现该学什么

学什么不该全靠用户自省——对话里藏着客观信号：

| 信号 | 示例 | 产出 |
|------|------|------|
| 知识盲区 | 会议中你说"这个我不太懂，回头查一下" | 学习建议：「你本周 3 次提到不熟悉 K8s 网络，要建一个学习主题吗？」 |
| 重复模式 | 多次会话中同类沟通问题（被打断后放弃表达） | 技能建议：建议把"守住话语权"加入技能树 |
| 承诺缺口 | 承诺了"我研究一下方案"但后续对话再未提及 | 与 commitments 联动提醒 |

实现：L2 日报生成时附带一个轻量「缺口扫描」步骤（输入当日摘要 + 现有 skills/learning_topics 清单，输出 0-2 条学习建议）。建议只在日报中呈现，**用户确认才创建**学习主题或技能——系统提议，用户决定。

---

## 3. 知识内化：从收藏到记住

承接 [design-knowledge.md](design-knowledge.md) §2 的知识卡片（insight 资产），内化机制在此细化：

### 3.1 复习队列（间隔重复）

```python
class ReviewStateModel(Base):
    __tablename__ = "review_states"
    id            = ...
    asset_id      = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"))
    interval_days = Column(Integer, default=1)     # 简化 SM-2: 1 → 3 → 7 → 21 → 60
    ease          = Column(Float, default=2.5)
    due_date      = Column(Date, nullable=False)
    review_count  = Column(Integer, default=0)
    lapse_count   = Column(Integer, default=0)
```

- 知识卡创建时进入队列；每日随 L2 日报推送 **2-3 张**到期卡片（平静技术：不单独 push，不积压焦虑，过期卡自动顺延）。
- 回顾结果 `quality 0-5` 更新间隔（标准 SM-2 简化版）。

### 3.2 检验式回顾（Socratic Recall）

重读是低效的，**提取练习 (retrieval practice)** 才有效。AI 把知识卡转成问题：

```
知识卡: "谈判中先问后说——先了解对方约束再出方案"（来源: 6/3 与张三的对话）
  ↓ 回顾时 AI 提问
"上周你存的那条谈判原则是什么？它在什么前提下不适用？"
  ↓ 用户语音/文字回答（回答本身入资产流, asset_type=journal）
  ↓ AI 对照原卡给反馈，按回答质量更新 review_state
```

### 3.3 情境唤醒

复用 M2 情境数据做**对的时间出现的知识**：
- 日历/录音开始时检测到与张三的会议 → 推送与"张三"或"谈判"关联的知识卡（「上次你总结过：张三在意成本超过进度」）。
- 这是被动复习——知识在即将用到时出现一次，胜过十次例行回顾。

---

## 4. 应用检测与刻意练习：学习系统的差异化所在

### 4.1 练习意图 (Practice Intention)

刻意练习需要「带着明确意图进入真实场景」。流程：

```
录音开始前（可选）: 用户设定本次练习意图
  "这次会议我练习：让对方把话说完再回应"
   ↓ 关联到 skill, 存入 session.metadata.practice_intention
录音结束 L1 分析时: Prompt 注入练习意图, 重点检验
   ↓
反馈: "你在 12:03 和 12:47 两次等对方说完（点开），但 12:15 仍有一次打断"
   ↓ 写入 skill_evidence, 计入该技能的证据轨迹
```

这是市面上任何学习/成长产品都做不到的功能——它需要真实行为数据。

### 4.2 被动应用检测

不设意图时，L1 分析也对照「最近 30 天复习过的知识卡 + active skills」做轻量检测：发现明确运用即写入知识卡的 `metadata.applied_count` 与 skill_evidence。检测从严：只记录高置信的明确运用，宁缺毋滥（证据先于观点）。

### 4.3 学以致用报告

L3 周报中呈现学习闭环健康度：本周输入了什么（上传/收藏）、内化了什么（复习/回答质量）、**用出来了什么（应用证据）**、哪些知识停留在收藏层从未被运用（提示：删掉或安排练习）。

---

## 5. 学习主题与计划 (Learning Topics)

`learning_topics`（[design-knowledge.md](design-knowledge.md) §3.1）扩展为学习的组织单元：

- **主题 = 资料 + 知识卡 + 技能 + 练习记录**的聚合视图：「谈判技巧」主题下能看到收藏的书摘、提炼的卡片、关联技能的证据轨迹。
- **AI 学习计划**（可选，轻量）：用户建主题时 AI 给出建议路径（学什么 → 练什么场景 → 如何检验），写入 `learning_topics.plan` JSONB，用户可编辑。不做课程式重计划，保持「资料自由进、练习有反馈」的松结构。
- 与目标（goals）关联：学习主题服务于成长目标，L2/L3 报告中按目标聚合学习投入。

---

## 6. API 设计（规划）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET/POST/PATCH` | `/skills` | 技能管理 |
| `GET` | `/skills/{id}/evidence` | 技能证据轨迹（含 segment 引用） |
| `POST` | `/sessions/{id}/practice-intention` | 录音前设定练习意图 `{skill_id, intention}` |
| `GET` | `/knowledge/review-queue` | 今日到期知识卡（含 AI 生成的检验问题） |
| `POST` | `/knowledge/{id}/review` | 提交回顾 `{quality, answer_text?}` |
| `GET` | `/learning-topics/{id}` | 主题聚合视图（资料/卡片/技能/练习） |
| `GET` | `/learning/weekly-report` | 学以致用报告（L3 的学习切片） |

---

## 7. 实施切分与优先级

| 阶段 | 内容 | 依赖 |
|------|------|------|
| M3 | 复习队列 + 检验式回顾（知识卡基建之上增量最小） | design-knowledge 知识卡 |
| M3 末 | 缺口检测（L2 日报附带扫描，纯 Prompt 改动） | L2 日报 |
| M4 | 技能模型 + 证据轨迹 + 练习意图（学习系统的差异化核心） | M2 声纹（识别"我"的发言） |
| M4 | 被动应用检测、情境唤醒、学以致用周报 | 技能模型 + L3 |

优先级理由：复习/缺口检测成本低先行验证；**练习意图 → 应用检测**是真正无可替代的功能，但依赖 M2 声纹识别（必须能区分"我"说的话）和数据积累，放 M4 主推。

---

## 8. 与产品原则的对齐（见 [vision.md](vision.md)）

| 原则 | 在学习系统中的体现 |
|------|------|
| 证据先于观点 | 技能评估只呈现证据轨迹不打分；应用检测从严，宁缺毋滥 |
| 提问先于答案 | 检验式回顾用提取练习代替重读；缺口建议由用户确认 |
| 平静技术 | 每日 2-3 张卡随日报推送，不单独轰炸；过期自动顺延无羞辱 |
| 数据资产 | 回顾回答入资产流；技能证据可导出 |
| 长期复利 | 证据轨迹随时间显现成长曲线——一年后回看"反例减少"本身就是被看见时刻 |
