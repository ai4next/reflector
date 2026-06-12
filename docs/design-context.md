# 情境化设计：何人、何时、何地

> 状态: 设计中 (M2) · 关联: [roadmap.md](roadmap.md) · 基础架构见 [architecture.md](architecture.md)

目标：把 M1 的匿名转写记录（`SPEAKER_00 在某段时间说了什么`）升级为情境化记录：

> **张三**（何人）在 **周三早晨**（何时）于 **公司会议室**（何地）说了 **「这个方案风险在于…」**（何事）

三者全部是对现有 schema 的**增量**改动，不破坏 M1 数据。

---

## 1. 何地：位置采集与语义地点

### 1.1 移动端采集 (expo-location)

```
录音开始 ──> 取一次 GPS (精度 balanced, 超时 10s 降级为 last known)
录音期间 ──> 监听显著位移 (>100m) 时补点
录音结束 ──> 取一次 GPS
```

- 位置点随 session 元数据上传，**不阻塞录音**：定位失败时 session 照常创建，location 为空。
- 权限策略：仅"使用期间"权限即可（录音本身就在前台）；用户拒绝定位时全功能降级可用。

### 1.2 数据模型

原始坐标存入现有 `sessions.metadata` JSONB（无 schema 迁移风险）：

```json
{
  "locations": [
    {"lat": 39.99, "lng": 116.31, "accuracy": 12.5, "ts": "2026-06-12T09:30:00+08:00"}
  ],
  "geocoded_address": "海淀区xx路xx号"
}
```

语义地点新增 `places` 表，session 通过 geo-fence 匹配后写入 `place_id`：

```python
class PlaceModel(Base):
    __tablename__ = "places"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)        # "家" / "公司" / "健身房"
    category = Column(String(50), nullable=True)      # home | work | gym | other
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    radius_meters = Column(Float, nullable=False, default=150)
    created_at = Column(DateTime(timezone=True), ...)

# sessions 表新增列
place_id = Column(UUID(as_uuid=True), ForeignKey("places.id", ondelete="SET NULL"), nullable=True)
```

### 1.3 匹配流程

```
session 创建/更新携带 location
  → 计算与该用户所有 places 的球面距离 (haversine)
  → 距离 < radius_meters 的最近 place → 写 session.place_id
  → 无命中 → place_id 为空, UI 显示逆地理地址
```

- 用户在会话详情页可手动「把这里保存为常用地点」→ 创建 place 并回填当前 session。
- places 数量级为个位数到几十，全表扫描即可，无需空间索引；后续量大再加 PostGIS。

### 1.4 API 变更

- `POST /sessions` / `PATCH /sessions/{id}`：接受可选 `location` 字段
- `GET /places` / `POST /places` / `PATCH /places/{id}` / `DELETE /places/{id}`
- Session 响应中增加 `place: {id, name, category} | null` 与 `geocoded_address`

详见 [api.md](api.md#地点管理)。

---

## 2. 何人：声纹身份绑定

### 2.1 数据模型

```python
class SpeakerModel(Base):
    __tablename__ = "speakers"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    display_name = Column(String(255), nullable=False)   # "我" / "张三"
    is_self = Column(Boolean, default=False)
    embedding = Column(Vector(256), nullable=True)       # pgvector, 多样本均值
    sample_count = Column(Integer, default=0)            # 参与均值的样本数
    created_at = Column(DateTime(timezone=True), ...)

# segments 表新增列（保留原 speaker_label 作为 diarization 原始输出）
speaker_id = Column(UUID(as_uuid=True), ForeignKey("speakers.id", ondelete="SET NULL"), nullable=True)
```

设计要点：
- `speaker_label`（SPEAKER_00）是 **chunk 内局部标签**，`speaker_id` 才是全局身份。两者并存：label 用于回溯 diarization 结果，id 用于跨会话聚合。
- embedding 维度取决于模型（pyannote/embedding 为 256 维，ECAPA-TDNN 为 192 维），建库前锁定。

### 2.2 处理管线变更 (process_chunk)

关键约束：**音频在处理成功后即删除**（见 architecture.md §2.2），因此声纹提取必须在管线内完成，不能事后补提。

```
Phase 3  diarization (现有)
Phase 3.5 声纹提取与匹配 (新增):
  对每个 SPEAKER_xx:
    1. 拼接该说话人累计时长最长的语音段 (取 ≥5s, 上限 30s)
    2. 提取 embedding (pyannote/embedding, 与 diarization 同生态)
    3. 与该用户 speakers 库做余弦相似度匹配
         similarity ≥ 0.72        → 绑定 speaker_id, 并按比例更新均值 embedding
         0.60 ≤ similarity < 0.72 → 不绑定, 但在 chunk 元数据记录候选 (UI 提示"可能是张三?")
         similarity < 0.60        → 保持匿名
    4. 无论是否命中, 将本 chunk 各 SPEAKER_xx 的 embedding 暂存到
       chunk 级元数据表 (speaker_embeddings), 供事后认领使用
Phase 4  assign_word_speakers (现有)
Phase 5  存 segments 时一并写 speaker_id (现有改动点)
```

新增辅助表（认领的关键，否则音频删除后无法回溯）：

```python
class ChunkSpeakerEmbeddingModel(Base):
    __tablename__ = "chunk_speaker_embeddings"
    id            = ...
    chunk_id      = ForeignKey("chunks.id", ondelete="CASCADE")
    speaker_label = Column(String(50))      # SPEAKER_00
    embedding     = Column(Vector(256))
    duration_seconds = Column(Float)        # 参与提取的语音总时长
```

### 2.3 认领与纠错（用户闭环）

```
场景 A: 首次认领
  用户在回放界面看到 "SPEAKER_01" → 点击「这是张三」
  → POST /speakers (display_name="张三") 或选择已有 speaker
  → 后端取该 chunk 的 speaker_label embedding, 写入/合并到 speaker.embedding
  → 回填本 session 中该 label 的所有 segments.speaker_id

场景 B: 纠错
  系统标成了"张三"但其实是"李四"
  → 用户改标 → segments.speaker_id 改写为李四
  → 该 embedding 从张三的均值中剔除并入李四 (按 sample_count 加权)
```

- 均值更新公式：`new_mean = (mean * n + emb) / (n + 1)`，`sample_count += 1`。
- "我"的声纹建议引导用户首次使用时朗读 30 秒注册（`is_self=true`），自我识别是后续沟通分析（说话占比等）的基础。
- **合规底线**：未匹配的说话人永远保持匿名编号，系统不猜测身份；认领动作只能由用户发起。

### 2.4 API 变更

- `GET /speakers` / `POST /speakers` / `PATCH /speakers/{id}` / `DELETE /speakers/{id}`
- `POST /sessions/{sid}/chunks/{cid}/claim-speaker`：`{speaker_label, speaker_id}` 认领/纠错
- Segment 响应中增加 `speaker: {id, display_name} | null`

---

## 3. 何时：语义时间

无需新表。在分析阶段从 `started_at` 派生（按用户时区）：

| 派生维度 | 取值 |
|---------|------|
| day_type | 工作日 / 周末 / 节假日（可选接节假日表） |
| time_of_day | 清晨(5-8) / 上午(8-12) / 午后(12-14) / 下午(14-18) / 晚上(18-23) / 深夜(23-5) |

实现为纯函数 `semantic_time(dt, tz) -> str`（如「工作日早晨」），在构建 `AnalysisContext` 时计算。

---

## 4. AI 分析的情境注入

`AnalysisContext`（`app/services/analysis/base.py`）扩展：

```python
@dataclass
class AnalysisContext:
    ...                          # 现有字段不变
    place_label: str | None      # "公司" / 逆地理地址 / None
    participants: list[str]      # ["我", "张三", "SPEAKER_02"]
    time_semantic: str           # "工作日早晨"
```

Prompt 模板（`prompts.py`）相应升级，使反思输出从：

> "讨论了 Q2 路线图，SPEAKER_00 情绪积极"

升级为：

> "周三早晨在公司与张三的讨论：你在张三提出风险点后立即反驳，未先确认对方的核心担忧…"

`sentiment_overview` 等 per-speaker 输出的 key 从 `SPEAKER_00` 替换为真实姓名（未识别的保持原 label）。

### 脱敏选项

配置项 `ANALYSIS_ANONYMIZE_NAMES=true` 时，送第三方 LLM 前将真实姓名替换为「同事A/朋友B」占位符，响应中再映射回来。

---

## 5. 迁移与兼容

| 改动 | 迁移方式 |
|------|---------|
| pgvector 扩展 | Alembic migration: `CREATE EXTENSION IF NOT EXISTS vector` |
| places / speakers / chunk_speaker_embeddings 新表 | 新增 migration，不影响存量 |
| sessions.place_id / segments.speaker_id | nullable 新列，存量数据为 NULL，UI 兼容显示 |
| SQLite 开发环境 | pgvector 不可用 → 开发环境声纹匹配降级为内存余弦计算（numpy），接口不变 |

实施顺序建议：**位置（1 周）→ 语义时间 + Prompt（0.5 周）→ 声纹（2 周）→ 认领 UI（0.5 周）**。位置链路简单先行打样，声纹是 M2 最重的部分。
