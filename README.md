# Reflector (反思者)

**记录对话 · 区分说话人 · AI 驱动的深度反思**

Reflector 是一款录音 + 语音转文字 + 说话人分离 + AI 反思分析的移动应用。它每 5 分钟将录制的音频转为带说话人标签的文本，然后通过 AI 分析为你提供对话总结、主题提炼、行动建议和改进方向。

音频仅在临时处理期间保留，转写成功后立即删除——只存储文本。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| 🎙️ 录音 | 自动分片录制 (5 分钟/片)，支持后台录制 |
| 📝 语音转文字 | 基于 WhisperX 的高精度转写 |
| 👥 说话人分离 | 自动区分不同说话人 (如你和同事/朋友) |
| 🧠 AI 分析 | 可插拔架构，内置 Claude API 支持，可扩展 OpenAI/Ollama |
| 📊 反思复盘 | 自动生成对话总结、主题、行动项、改进建议 |
| 🔒 隐私优先 | 处理完毕立即删除音频，只存储文本 |

---

## 系统架构概览

```
┌──────────────────────────────────────┐
│      React Native App (Expo)         │
│  录音 → 上传 → 轮询 → 展示           │
└──────────────┬───────────────────────┘
               │ HTTPS
               ▼
┌──────────────────────────────────────┐
│      FastAPI Backend (Python)        │
│  REST API + Celery 异步任务          │
│  WhisperX 原生集成 (无需子进程)      │
│  SQLAlchemy + SQLite             │
└──────────────────────────────────────┘
```

详细架构说明见 [docs/architecture.md](docs/architecture.md)。
完整 API 文档见 [docs/api.md](docs/api.md)。
部署指南见 [docs/deployment.md](docs/deployment.md)。
性能优化见 [docs/performance.md](docs/performance.md)。
常见问题见 [docs/troubleshooting.md](docs/troubleshooting.md)。

---

## 技术栈

### 后端

| 技术 | 用途 |
|------|------|
| Python 3.12 | 运行环境 |
| FastAPI | Web 框架 (REST API) |
| LangChain | LLM 统一编排层 (Claude / OpenAI / Ollama) |
| Celery + Redis | 异步任务队列 |
| SQLAlchemy (async) + Alembic | ORM + 数据迁移 |
| SQLite / PostgreSQL | 数据库 (开发/生产) |
| WhisperX | 语音转文字 + 说话人分离 |

### 移动端

| 技术 | 用途 |
|------|------|
| React Native (Expo) | 跨平台框架 |
| expo-av | 音频录制 |
| expo-file-system | 文件管理 + SHA-256 |
| Zustand | 状态管理 |
| React Navigation | 页面导航 |
| TanStack Query | 服务端状态管理 |

---

## 项目结构

```
reflector/
├── mobile/                   # React Native (Expo) App
│   ├── App.tsx               # 入口 (QueryClient + Navigation)
│   └── src/
│       ├── api/client.ts     # API 客户端 (fetch + 错误处理)
│       ├── components/       # UI 组件
│       │   ├── UI.tsx        # 基础组件 (Button, Card, Badge)
│       │   ├── Recorder.tsx  # 录音按钮 + 状态指示
│       │   ├── TranscriptView.tsx  # 转写文本展示
│       │   └── ReflectionCard.tsx  # AI 分析结果卡片
│       ├── screens/          # 页面
│       │   ├── HomeScreen.tsx         # 首页 (录音 + 快速操作)
│       │   ├── HistoryScreen.tsx      # 历史会话列表
│       │   └── SessionDetailScreen.tsx # 会话详情 (转写 + 分析)
│       ├── store/            # Zustand 状态
│       ├── services/         # 业务服务
│       │   ├── recorder.ts   # 5分钟分片录音
│       │   ├── uploader.ts   # 上传队列 + 重试 + SHA-256
│       │   └── poller.ts     # 处理状态轮询
│       ├── hooks/            # React Hooks
│       │   ├── useRecording.ts   # 录音生命周期编排
│       │   └── useSession.ts     # TanStack Query hooks
│       ├── navigation/       # 导航配置
│       └── types/            # TypeScript 类型
│
├── backend/                  # Python FastAPI
│   ├── app/
│   │   ├── main.py           # FastAPI 入口 (lifespan, middleware)
│   │   ├── config.py         # pydantic-settings 配置
│   │   ├── middleware.py     # 请求 ID / 日志 / 错误处理
│   │   ├── logging_config.py # 日志配置
│   │   ├── dependencies.py   # 依赖注入
│   │   ├── api/v1/           # REST 端点
│   │   │   ├── health.py
│   │   │   ├── sessions.py
│   │   │   ├── chunks.py
│   │   │   ├── transcripts.py
│   │   │   └── reflections.py
│   │   ├── models/           # SQLAlchemy 模型
│   │   ├── schemas/          # Pydantic 模型
│   │   ├── services/         # 业务逻辑
│   │   │   ├── whisperx_pipeline.py  # WhisperX 原生集成
│   │   │   └── analysis/     # AI 分析 (LangChain 统一抽象)
│   │   │       ├── base.py   # 抽象基类
│   │   │       ├── langchain_provider.py  # LangChain 统一实现
│   │   │       ├── factory.py# 工厂模式
│   │   │       └── prompts.py# Prompt 模板
│   │   ├── tasks/            # Celery 任务
│   │   │   ├── celery_app.py # Celery 配置
│   │   │   └── processing.py # 处理管线 + 重分析
│   │   └── db/               # 数据库配置
│   │       ├── session.py
│   │       └── migrations/   # Alembic 迁移
│   ├── tests/                # 测试套件
│   ├── alembic.ini
│   └── requirements.txt
│
├── docker/                   # Docker 部署
│   ├── docker-compose.yml
│   └── Dockerfile
│
└── docs/                     # 文档
    ├── architecture.md
    ├── api.md
    ├── setup.md
    └── design-decisions.md
```

---

## 快速开始

### 开发环境 (后端)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# 编辑 .env, 填入 API Key

# 启动依赖 (PostgreSQL + Redis)
docker compose up -d postgres redis

# 初始化数据库
python -c "import asyncio; from app.db.session import init_db; asyncio.run(init_db())"

# 启动 API 服务 (终端 1)
uvicorn app.main:app --reload --port 8000

# 启动 Celery Worker (终端 2)
celery -A app.tasks.celery_app worker --loglevel=info --concurrency=1
```

### 开发环境 (移动端)

```bash
cd mobile
npm install
npx expo start
```

详细指引见 [docs/setup.md](docs/setup.md)。

---

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/health` | 健康检查 |
| `POST` | `/api/v1/sessions` | 创建录音会话 |
| `GET` | `/api/v1/sessions` | 会话列表 |
| `GET` | `/api/v1/sessions/{id}` | 会话详情 |
| `POST` | `/api/v1/sessions/{id}/chunks` | 上传音频 |
| `GET` | `/api/v1/sessions/{id}/transcript` | 获取转写文本 |
| `GET` | `/api/v1/sessions/{id}/reflections` | 获取 AI 分析 (per-chunk + session-level) |
| `POST` | `/api/v1/sessions/{id}/regenerate-reflection` | 重新运行分片分析 |
| `POST` | `/api/v1/sessions/{id}/analyze-global` | 触发会话级全局分析 |

完整 API 文档见 [docs/api.md](docs/api.md)。

---

## 实现状态

- [x] Phase 1 — MVP 核心链路
- [x] Phase 2 — 生产加固 (Celery 重试, 详情页, 错误处理)
- [x] Phase 3 — 更多 AI Provider (Claude / OpenAI / Ollama via LangChain)
- [ ] 后台录音能力
- [ ] 推送通知替代轮询
- [x] 会话级全局分析 (per-chunk + session-level 双重分析)

---

## 设计原则

- **隐私优先**: 音频临时处理，转写后立即删除
- **可插拔**: AI 分析模块化设计，支持切换后端
- **增量反馈**: 每个 5 分钟分片独立处理，用户能实时看到进展
- **幂等上传**: SHA-256 校验，避免重复处理