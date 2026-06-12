# 架构文档

> 本文档描述 M1（核心录音管线）的现状架构。产品定位见 [vision.md](vision.md)。M2+ 的演进设计见 [roadmap.md](roadmap.md)、[design-context.md](design-context.md)（位置/声纹/语义时间）、[design-growth.md](design-growth.md)（每日反思/承诺/RAG/教练）、[design-knowledge.md](design-knowledge.md)（数据资产/知识库）、[design-learning.md](design-learning.md)（学习提升系统）。

## 1. 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                     React Native App (Expo)                  │
│                                                               │
│  ┌──────────┐   ┌────────────┐   ┌───────────┐              │
│  │ Recorder │──>│   Upload   │   │App State  │              │
│  │ Module   │   │  Manager   │   │(Zustand)  │              │
│  │(5min     │   │(retry,     │   └─────┬─────┘              │
│  │ chunks)  │   │ queue)     │         │                     │
│  └──────────┘   └─────┬──────┘         │                     │
│                        │                │                     │
│                        ▼                ▼                     │
│                ┌──────────────┐                               │
│                │ API Client   │                               │
│                │ (TanStack    │                               │
│                │  Query)      │                               │
│                └──────┬───────┘                               │
└───────────────────────┼───────────────────────────────────────┘
                        │ HTTPS (multipart/form-data)
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Python)                    │
│                                                               │
│  ┌──────────────┐    ┌──────────────────┐                     │
│  │ REST API     │───>│  Celery Worker   │                     │
│  │ (uvicorn)    │    │  (process_chunk) │                     │
│  └──────────────┘    └────────┬─────────┘                     │
│                               │                               │
│         ┌─────────────────────┼─────────────────────┐        │
│         ▼                     ▼                      ▼        │
│  ┌────────────┐      ┌────────────────┐     ┌─────────────┐  │
│  │  WhisperX  │      │ AI Analysis    │     │  PostgreSQL │  │
│  │  (原生集成) │      │ Provider       │     │  (SQLAlchemy)│  │
│  │ STT+Diari  │      │ (Claude/OpenAI)│     └─────────────┘  │
│  └────────────┘      └────────────────┘                      │
└──────────────────────────────────────────────────────────────┘
```

### 关键优势 (TypeScript vs Python 对比)

| 方面 | Python (当前方案) | TypeScript (备选) |
|------|------------------|-------------------|
| WhisperX 集成 | 原生调用，无需进程间通信 | 需子进程/HTTP微服务 |
| 数据科学生态 | 丰富 (numpy, torch, whisper) | 受限 |
| 任务队列 | Celery (成熟稳定) | BullMQ (功能等价) |
| 类型安全 | Pydantic + mypy | TypeScript 原生 |
| 前后端统一 | 否 | 是 |

**选中 Python 的理由**: WhisperX 是 Python 原生库，Python 方案可以直接在 Celery Worker 进程中加载模型、转写、分析，无需进程间通信。TypeScript 方案需要额外维护 Python 子进程的生命周期、通信协议、错误处理——增加了不必要的架构复杂度。

---

## 2. 核心数据流

### 2.1 录音 → 转写 → 分析 (每 5 分钟一次)

```
Step 1: 用户点击录音
        └─ expo-av 开始采集 44100Hz 16-bit PCM mono WAV
        └─ 每 5 分钟: 保存当前文件, 立即开始下一个文件

Step 2: UploadManager 检测到新 chunk
        └─ 计算 SHA-256 校验和 (幂等性)
        └─ POST /api/v1/sessions/{id}/chunks (multipart)
        └─ 失败重试 (指数退避, 最多 3 次)

Step 3: FastAPI 接收 chunk
        └─ 保存到 /tmp/reflector/{session_id}/{chunk_index}.wav
        └─ 创建 Chunk 记录 status=uploaded
        └─ 入队 Celery 任务: process_chunk(session_id, chunk_index, file_path)

Step 4: Celery Worker 执行处理管线
        └─ Phase 1 - 转写: WhisperX transcribe (whisper large-v3)
        └─ Phase 2 - 对齐: WhisperX align (词级时间戳)
        └─ Phase 3 - 分离: whisperx.DiarizationPipeline (pyannote)
        └─ Phase 4 - 赋值: assign_word_speakers
        └─ Phase 5 - 存储: 批量插入 segments (带 speaker_label)
        └─ Phase 6 - 分析: AnalysisProvider.analyze(transcript) → Reflection
        └─ Phase 7 - 清理: os.remove(audio_file), 更新 status=completed

Step 5: App 轮询 /chunks/{id}/status (每 3 秒)
        └─ status=completed 时拉取 transcript + reflection 展示
```

### 2.2 音频生命周期

```
录音开始
  │
  ▼
5分钟 WAV 文件 (约 25MB)
  │
  ├── 上传成功 ──> /tmp 临时存储 ──> WhisperX 处理 (同一进程)
  │                                      │
  │                            ┌─────────┴─────────┐
  │                            ▼                   ▼
  │                     处理成功               处理失败
  │                     删除音频              保留音频供重试
  │                     ↓                      ↓
  │              只存文本在 DB           最多重试 3 次
  │
  └── 上传失败 ──> 重试 (指数退避, 最多 3 次)
                     ├── 成功: 走上面流程
                     └── 失败: chunk status=failed
```

## 3. 数据库设计

### 3.1 ER 图

```
users ──1:N── sessions ──1:N── chunks ──1:N── segments
                    │
                    └──1:N── reflections
                    │
              processing_jobs ──1:1── chunks
```

### 3.2 SQLAlchemy 模型

```python
# app/models/session.py

class UserModel(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=True)
    display_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)

class SessionModel(Base):
    __tablename__ = "sessions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    title = Column(String(500), nullable=True)
    status = Column(String(50), default="recording")  # recording | processing | completed
    started_at = Column(DateTime(timezone=True))
    ended_at = Column(DateTime(timezone=True), nullable=True)
    total_duration_seconds = Column(Integer, nullable=True)
    metadata_ = Column("metadata", JSONB, default=dict)

class ChunkModel(Base):
    __tablename__ = "chunks"
    __table_args__ = (UniqueConstraint("session_id", "chunk_index"),)
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"))
    chunk_index = Column(Integer, nullable=False)
    status = Column(String(50), default="uploaded")  # uploaded | processing | completed | failed
    file_hash = Column(String(64), nullable=True)
    duration_seconds = Column(Float, nullable=True)
    error_message = Column(Text, nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)

class SegmentModel(Base):
    __tablename__ = "segments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chunk_id = Column(UUID(as_uuid=True), ForeignKey("chunks.id", ondelete="CASCADE"))
    speaker_label = Column(String(50), nullable=False)  # SPEAKER_00, SPEAKER_01...
    text = Column(Text, nullable=False)
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    confidence = Column(Float, nullable=True)
    __table_args__ = (
        Index("idx_segments_chunk", "chunk_id"),
        Index("idx_segments_chunk_speaker", "chunk_id", "speaker_label"),
    )

class ReflectionModel(Base):
    __tablename__ = "reflections"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"))
    chunk_id = Column(UUID(as_uuid=True), ForeignKey("chunks.id", ondelete="SET NULL"), nullable=True)
    provider_name = Column(String(100))       # claude | openai | ollama
    summary = Column(Text)
    key_themes = Column(JSONB, default=list)
    action_items = Column(JSONB, default=list)
    improvement_suggestions = Column(JSONB, default=list)
    sentiment_overview = Column(JSONB, default=dict)
    tokens_used = Column(Integer, nullable=True)
    processing_time_ms = Column(Integer, nullable=True)
```

### 3.3 核心索引

| 表 | 索引 | 用途 |
|----|------|------|
| chunks | UNIQUE(session_id, chunk_index) | 防重复上传 |
| segments | idx_segments_chunk | 按 chunk 查询 |
| segments | idx_segments_chunk_speaker | 按说话人过滤 |
| reflections | idx_reflections_session | 按会话查询分析 |

---

## 4. 可插拔 AI 分析架构

### 4.1 设计模式: 策略模式 + 工厂模式 + LangChain 抽象

```
AnalysisProvider (ABC)
│
└── LangChainAnalysisProvider    ← 统一实现 (LangChain ChatModel)
    │
    ├── ChatAnthropic (claude)   ← langchain-anthropic
    ├── ChatOpenAI (openai)      ← langchain-openai
    └── ChatOllama (ollama)      ← langchain-ollama

AnalysisProviderFactory
│
├── register(name, provider_cls)    ← 注册
└── get_provider(name) → instance   ← 获取 (通过 LangChain)
```

**LangChain 优势**: 统一 `ainvoke()` 接口屏蔽模型差异, 添加新 Provider 只需更新配置表, 无需编写新的 Provider Class。

### 4.2 核心接口

```python
# app/services/analysis/base.py
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class AnalysisContext:
    session_id: str
    chunk_id: str
    transcript_text: str
    segments: list[dict]
    speaker_labels: list[str]
    chunk_index: int
    language: str = "zh"

@dataclass
class AnalysisResult:
    provider_name: str
    model_name: str
    summary: str
    key_themes: list[str]
    action_items: list[str]
    improvement_suggestions: list[str]
    sentiment_overview: dict
    tokens_used: int | None = None
    processing_time_ms: int | None = None

class AnalysisProvider(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str: ...

    @property
    @abstractmethod
    def model_name(self) -> str: ...

    @abstractmethod
    async def analyze(self, context: AnalysisContext) -> AnalysisResult: ...

    @abstractmethod
    async def health_check(self) -> bool: ...
```

### 4.3 添加新 Provider

LangChain 架构下, 添加新模型提供商只需要两步:

1. 安装对应的 LangChain 集成包:
```bash
pip install langchain-groq
```

2. 在 `langchain_provider.py` 中添加配置:
```python
PROVIDER_REGISTRY["groq"] = ("langchain_groq", "ChatGroq")
PROVIDER_MODEL_MAP["groq"] = "llama-3.1-70b-versatile"
```

3. 在 `factory.py` 中注册:
```python
class _GroqProvider(LangChainAnalysisProvider):
    def __init__(self):
        super().__init__("groq")

AnalysisProviderFactory.register("groq", _GroqProvider)
```

无需处理 SDK 差异、认证方式、消息格式——LangChain 统一处理。

---

## 5. WhisperX Pipeline

### 5.1 原生集成 (无子进程)

WhisperX 是 Python 库, 直接在 Celery Worker 进程中加载和调用:

```
Celery Worker (Python)
│
├── 启动时: 加载 WhisperX 模型 (缓存到模块级变量)
│   ├── ASR model (large-v3, ~3GB)
│   ├── Alignment model (~1GB)
│   └── Diarization pipeline (~1GB)
│
├── 每任务: process_chunk()
│   ├── whisperx.load_audio(file_path)
│   ├── model.transcribe(audio)            → 文本
│   ├── whisperx.align(segments, audio)     → 词级时间戳
│   ├── diarize(audio)                      → 说话人分段
│   ├── assign_word_speakers(segments)      → 说话人标签
│   └── 返回结构化的 segments
│
└── 模型常驻内存, 后续任务复用
```

### 5.2 调用代码

```python
# app/services/whisperx_pipeline.py

class WhisperXPipeline:
    _asr_model = None          # 类变量, 进程内缓存
    _align_cache = {}
    _diarize_pipeline = None

    def transcribe(self, audio_path: str) -> TranscriptionResult:
        # 1. 加载模型 (首次调用后缓存)
        model = self._get_asr_model()

        # 2. 转写
        audio = whisperx.load_audio(audio_path)
        result = model.transcribe(audio, batch_size=16)

        # 3. 对齐
        result = whisperx.align(result["segments"], ...)

        # 4. 说话人分离
        result = whisperx.assign_word_speakers(diarize_segments, result)

        return TranscriptionResult(segments=result["segments"], ...)
```

### 5.3 GPU 需求

| 设备 | 5 分钟音频处理时间 | 备注 |
|------|------------------|------|
| NVIDIA GPU (CUDA) | ~20-30 秒 | 推荐生产 |
| Apple Silicon (MPS) | ~30-60 秒 | 推荐开发 |
| CPU (int8) | ~3-5 分钟 | 仅测试 |

---

## 6. Celery 处理管线

### 6.1 任务流程

```
API Router                  Celery Queue                  Celery Worker
┌──────────┐    delay()   ┌──────────────┐   process()  ┌──────────────┐
│ POST     │─────────────>│  celery      │─────────────>│ process_chunk│
│ /chunks  │              │  (Redis)     │              │ .py          │
└──────────┘              └──────────────┘              └──────┬───────┘
                                                                │
                          ┌─────────────────────────────────────┤
                          ▼                                     ▼
                   ┌──────────────┐                     ┌──────────────┐
                   │ WhisperX     │                     │ AI Analysis  │
                   │ (同一进程)    │                     │ Provider     │
                   └──────────────┘                     └──────────────┘
                          │                                     │
                          └──────────────┬──────────────────────┘
                                         ▼
                                  ┌──────────────┐
                                  │ SQLAlchemy   │
                                  │ PostgreSQL   │
                                  └──────────────┘
```

### 6.2 Celery Task 伪代码

```python
# app/tasks/processing.py

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_chunk(self, session_id, chunk_index, file_path):
    """Full processing pipeline for one 5-minute audio chunk."""

    # 1. Update status
    update_chunk_status(chunk_id, "processing")

    # 2. WhisperX: transcribe + diarize (同一进程, 模型已缓存)
    pipeline = WhisperXPipeline()
    result = pipeline.transcribe(file_path)

    # 3. Store segments
    bulk_insert_segments(segments_from_whisperx)

    # 4. AI analysis
    provider = AnalysisProviderFactory.get_provider()
    analysis = provider.analyze(context)

    # 5. Store reflection
    insert_reflection(chunk_id, analysis)

    # 6. Cleanup
    os.remove(file_path)
    update_chunk_status(chunk_id, "completed")
```

---

## 7. 演进方向（M2+，规划中）

以下为已规划但尚未实现的架构演进，详细设计见对应文档：

### 7.1 情境化管线（M2，[design-context.md](design-context.md)）

处理管线在 Phase 3（diarization）后新增声纹阶段：

```
Phase 3   diarization (现有)
Phase 3.5 声纹提取与匹配 (新增):
          每个 SPEAKER_xx 提取 embedding → 与 speakers 声纹库余弦匹配
          → 命中绑定 speaker_id; embedding 存入 chunk_speaker_embeddings 供事后认领
Phase 4   assign_word_speakers (现有)
Phase 5   存 segments 时一并写 speaker_id
```

约束：音频处理完即删（见 §2.2），声纹提取必须在 `process_chunk` 内完成。

### 7.2 新增数据模型

```
users ──1:N── sessions ──1:N── chunks ──1:N── segments
        │         │                │              │
        │         └── place_id ──> places         └── speaker_id ──> speakers
        │         │                                chunk_speaker_embeddings
        │         └──1:N── reflections (扩展 period_type: chunk/session/daily/weekly)
        ├──1:N── commitments        (M3, 承诺追踪)
        ├──1:N── embeddings         (M3, pgvector RAG)
        ├──1:N── assets ──1:N── asset_links   (M3, 数据资产层, 见 design-knowledge.md)
        │            └──1:1── review_states   (M3, 间隔重复复习, 见 design-learning.md)
        ├──1:N── skills ──1:N── skill_evidence (M4, 技能证据轨迹)
        └──1:N── learning_topics               (M4, 学习主题)
```

### 7.3 新增基础设施

| 组件 | 用途 | 里程碑 |
|------|------|--------|
| 移动端 expo-location | 录音时采集 GPS, 逆地理编码 | M2 |
| pgvector 扩展 | 声纹 embedding 匹配 + RAG 向量检索 | M2/M3 |
| Celery Beat | 每日 22:00 触发 L2 日报任务 | M3 |
| bge-m3 (本地 embedding) | segments/summaries 向量化 | M3 |

成长闭环（L2 日报、承诺追踪、RAG 检索、AI 教练）的设计见 [design-growth.md](design-growth.md)；数据资产层（assets 统一模型、用户上传、知识提炼、全量导出）见 [design-knowledge.md](design-knowledge.md)；学习提升系统（技能证据轨迹、复习队列、练习意图与应用检测）见 [design-learning.md](design-learning.md)。

---

## 8. 错误处理

| 类别 | 场景 | 处理方式 |
|------|------|---------|
| 上传 | 文件缺失、格式不对 | FastAPI/Pydantic 返回 422 |
| WhisperX | CUDA OOM、模型下载失败 | Celery 重试 (指数退避, 最多 3 次) |
| AI 分析 | API Key 无效、限流 | 降级返回 "分析不可用", 不阻塞管线 |
| 存储 | DB 连接丢失 | Celery 重试 |
| 音频删除 | 文件已被清理 | 静默忽略 (文件级最终一致性) |