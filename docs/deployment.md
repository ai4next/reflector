# 部署指南

## 架构概览

生产部署需要以下服务:

| 服务 | 用途 | 资源需求 |
|------|------|---------|
| API (uvicorn) | REST API 服务 | 2 CPU, 4GB RAM |
| Celery Worker | 异步处理管线 (WhisperX + AI) | 4+ CPU, 16GB RAM, GPU |
| PostgreSQL | 持久化存储 | 2 CPU, 4GB RAM, 50GB SSD |
| Redis | Celery 消息队列 + 结果后端 | 1 CPU, 2GB RAM |

---

## Docker Compose 部署 (推荐)

### 1. 配置环境变量

```bash
cd docker
cp ../backend/.env.example .env
# 编辑 .env 填入 API Key
```

关键配置项:

```env
# 生产必须用 PostgreSQL
DATABASE_URL=postgresql+asyncpg://reflector:password@postgres:5432/reflector

# HuggingFace Token (说话人分离必需)
HF_TOKEN=hf_xxxxxxxxxxxx

# AI 分析 (至少配置一个)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxx
```

### 2. 启动全部服务

```bash
docker compose up -d
```

### 3. 初始化数据库

```bash
docker compose exec api python -c "
import asyncio
from app.db.session import init_db
asyncio.run(init_db())
"
```

### 4. 验证

```bash
curl http://localhost:8000/api/v1/health
```

---

## GPU 支持

### NVIDIA GPU (CUDA)

1. 安装 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
2. 确保 `docker-compose.yml` 中包含 GPU 资源配置

### Apple Silicon (MPS)

原生支持, 无需额外配置。

---

## 环境变量参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./reflector.db` | 数据库连接串 |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis 连接串 |
| `WHISPER_MODEL` | `large-v3` | Whisper 模型大小 |
| `DEFAULT_LANGUAGE` | `zh` | 默认语言 |
| `HF_TOKEN` | - | HuggingFace Token |
| `DEFAULT_ANALYSIS_PROVIDER` | `claude` | 默认 AI 分析提供商 |
| `ANTHROPIC_API_KEY` | - | Claude API Key |
| `OPENAI_API_KEY` | - | OpenAI API Key |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama 地址 |
| `AUDIO_TEMP_DIR` | `/tmp/reflector` | 临时音频目录 |
| `MAX_CHUNK_DURATION_SECONDS` | `300` | 每分片时长(秒) |
| `MAX_UPLOAD_SIZE_MB` | `50` | 上传大小限制 |

---

## 扩展 Celery Worker

```bash
# 增加 Worker 并发数
docker compose exec celery-worker \
  celery -A app.tasks.celery_app worker --loglevel=info --concurrency=4

# 单独部署额外 Worker (Kubernetes)
celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2
```

---

## 备份与恢复

### PostgreSQL 备份

```bash
docker compose exec postgres pg_dump -U reflector reflector > backup.sql

# 恢复
cat backup.sql | docker compose exec -T postgres psql -U reflector reflector
```

---

## 监控

- API: `/api/v1/health` 端点提供基本的健康检查
- Celery: `celery -A app.tasks.celery_app status` 查看 Worker 状态
- 日志: `docker compose logs -f api celery-worker` 查看实时日志
- Prometheus: Celery 支持 [flower](https://github.com/mher/flower) 监控

```bash
# 启动 Flower 监控
celery -A app.tasks.celery_app flower --port=5555
```