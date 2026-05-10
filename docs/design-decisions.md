# 设计决策说明

本文档记录了 Reflector 项目中的关键设计决策、权衡和取舍理由。

---

## 1. Python 后端 vs TypeScript 后端

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Python (FastAPI + Celery + SQLAlchemy)** | WhisperX 原生集成; 数据科学生态成熟; 架构统一 | 前后端语言不一致 |
| TypeScript (Hono + Prisma + BullMQ) | 前后端统一语言; 类型系统更强 | WhisperX 需子进程/HTTP 微服务; 增加架构复杂度 |

**决策**: Python 后端。

**理由**: 核心因素——WhisperX 是 Python 原生库。Python 方案可以在同一进程中加载模型、转写、分离说话人、AI 分析，模型常驻内存复用。TypeScript 方案需要额外管理 Python 子进程的生命周期、JSON-RPC 通信协议、进程崩溃恢复、模型预热——这些复杂度远超"语言统一"带来的收益。

**架构简洁性对比:**

| 环节 | Python (当前) | TypeScript (备选) |
|------|--------------|-------------------|
| WhisperX 调用 | `import whisperx; model.transcribe(audio)` | spawn Python 子进程 + JSON-RPC |
| 模型缓存 | 模块级变量, 进程内 | 另外维护常驻 Python 进程 |
| 部署 | 单一 Docker 镜像 | 需要 Node + Python 两个 runtime |
| 管线编排 | Celery task 直接调用 | Worker 需管理子进程通信 |

---

## 2. 5 分钟分片 vs 实时流式转写

| 方案 | 优点 | 缺点 |
|------|------|------|
| **5 分钟分片** | WhisperX 有足够声学上下文; 说话人分离依赖声音连续性; 架构简单 | 用户需等待 5 分钟+处理时间才能看到结果 |
| 流式 (每 10s) | 延迟低 | 转写质量差; 说话人分离不可靠 |

**决策**: 5 分钟分片。用户核心场景是对话结束后的回顾反思, 而非实时字幕。

---

## 3. WhisperX vs 云端 STT API

| 方案 | 优点 | 缺点 |
|------|------|------|
| **WhisperX (本地)** | 完全离线; 无 API 费用; 数据不出设备 | GPU 需求; 首次模型下载 ~3GB |
| 云端 API | 无需 GPU; 准确率高 | 持续费用; 音频需上传云端 |

**决策**: WhisperX 本地处理, 符合用户指定的"说话人分离用本地处理"的要求。

---

## 4. 轮询 vs WebSocket

| 方案 | 优点 | 缺点 |
|------|------|------|
| **轮询 (3 秒间隔)** | 实现简单; 无需连接管理 | 略微浪费带宽 |
| WebSocket | 实时推送 | 长连接管理; 断线重连 |

**决策**: 轮询。处理耗时 30-90s, 3s 轮询粒度足够。后续可升级 WebSocket。

---

## 5. WAV vs 压缩格式

| 方案 | 5 分钟大小 | 优点 | 缺点 |
|------|-----------|------|------|
| **16-bit PCM WAV** | ~25 MB | 零编解码; WhisperX 原生读取 | 文件较大 |
| AAC/Opus | ~2-5 MB | 上传快 | 编解码 CPU 开销; 有损 |

**决策**: WAV。25MB 在 WiFi 下秒级上传。后续可切换 Opus + 服务端解码。

---

## 6. per-chunk vs per-session AI 分析

| 方案 | 优点 | 缺点 |
|------|------|------|
| **per-chunk (默认)** | 结果实时增量呈现; 用户无需等待 | 缺乏全局视角 |
| **per-session (叠加)** | 完整上下文; 更准确 | 需等所有 chunk 处理完 |

**决策**: per-chunk + per-session 双重分析。每个 chunk 处理完后立即生成局部分析; 所有 chunk 完成后自动触发全局分析 (Celery task `analyze_session`)。用户也可手动 POST `/analyze-global` 触发。全局分析结果以 `chunk_id=null` 标识存储在 `reflections` 表中。

---

## 7. Expo 托管 vs 裸 React Native

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Expo 托管** | 零原生配置; expo-av 开箱即用 | 后台录音有限制 |
| 裸 React Native | 完全控制原生层 | 配置复杂 |

**决策**: Expo 托管 (MVP)。需要后台录音时再 eject。

---

## 8. SQLite vs PostgreSQL 开发

| 方案 | 优点 | 缺点 |
|------|------|------|
| **SQLite (开发)** | 零配置; 快速启动 | 不支持并发; 无 JSONB 查询 |
| PostgreSQL | 完整功能 | 需要 Docker |

**决策**: 开发用 SQLite, 生产用 PostgreSQL。SQLAlchemy 一行 `DATABASE_URL` 切换。

---

## 9. Celery vs 其他异步方案

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Celery + Redis** | 成熟稳定; 重试/队列/并发控制 | 需要 Redis |
| FastAPI background tasks | 无需额外组件 | 进程重启丢失; 无重试 |
| Arq | 纯 async; 轻量 | 生态较小 |

**决策**: Celery。WhisperX 处理 5 分钟 chunk 需 30-90 秒, 必须异步。Celery 的成熟度、重试机制、并发控制经过大规模验证。

---

## 10. 单用户 vs 多用户

**决策**: MVP 单用户, User 模型已预留。后续认证只需在中间件解析 token 设置 `user_id`。

---

## 11. 幂等上传

SHA-256 校验和 + `UNIQUE(session_id, chunk_index)` 双重保障, 防止:
- 网络重试导致重复处理
- 重复扣费 (AI API 按 token 计费)
- 数据库冲突

---

## 12. GPU 需求

WhisperX CPU 上 5 分钟音频需 3-5 分钟, 可能跟不上录音速度。GPU 仅需 20-30 秒。

| 场景 | 方案 |
|------|------|
| Apple Silicon 开发 | 原生运行, MPS 自动启用 |
| NVIDIA GPU 部署 | Docker + nvidia-container-toolkit |
| CPU only | 增加 Celery Worker 并发数, 仍有积压风险 |

---

## 13. LangChain vs 原生 SDK

| 方案 | 优点 | 缺点 |
|------|------|------|
| **LangChain (当前)** | 统一接口屏蔽模型差异; 添加新 Provider 只需配置; 社区维护集成包 | 额外依赖; 抽象层带来轻微性能开销 |
| 原生 SDK (备选) | 零依赖; 直接控制 API 调用 | 每个 Provider 需独立实现; 重复的错误处理/重试/解析逻辑 |

**决策**: LangChain。

**理由**: 三个 Provider (Claude/OpenAI/Ollama) 的核心逻辑完全相同——构建消息 → 调用 API → 解析 JSON。原生 SDK 方案中, claude.py 和 openai.py 的代码结构几乎一致, 只是 import 和 client 初始化不同。LangChain 的 `ChatModel.ainvoke()` 消除了这种重复, 且添加新 Provider (Groq, Mistral, Gemini) 只需一行注册。

性能权衡: 分析耗时主要在网络延迟和 LLM 推理 (数秒), LangChain 抽象层的微秒级开销可忽略。

---

## 14. Alembic vs init_db()

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Alembic (生产)** | 版本控制; 可回滚; 团队协作 | 需要额外配置 |
| init_db() (开发) | 零配置启动 | 无版本管理; 无法回滚 |

**决策**: 开发用 init_db() 快速启动, 生产用 Alembic 管理迁移。`Base.metadata.create_all` 在开发环境中保持可用。