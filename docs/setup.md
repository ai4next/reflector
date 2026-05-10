# 开发环境搭建

## 前提条件

| 工具 | 版本要求 | 用途 |
|------|---------|------|
| Python | >= 3.12 | 后端运行环境 |
| Node.js | >= 20 LTS | 移动端开发 |
| Docker | >= 24 | 数据库和队列 |
| Redis | >= 7 | Celery 消息队列 |

### GPU 推荐

- **Apple Silicon (M1/M2/M3/M4)**: WhisperX 自动使用 MPS 加速
- **NVIDIA GPU**: 通过 CUDA 加速
- **纯 CPU**: 可用, 处理时间约 3-5 倍

---

## 后端设置

### 1. 创建虚拟环境

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

### 2. 安装依赖

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件:

```env
# 数据库 (开发用 SQLite, 生产用 PostgreSQL)
DATABASE_URL=sqlite+aiosqlite:///./reflector.db

# WhisperX
WHISPER_MODEL=large-v3
DEFAULT_LANGUAGE=zh
# HuggingFace Token (必需: pyannote 需要授权)
# 注册: https://huggingface.co/settings/tokens
# 同意条款: https://huggingface.co/pyannote/speaker-diarization-3.1
HF_TOKEN=hf_xxxxxxxxxxxx

# AI 分析
DEFAULT_ANALYSIS_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxx
OLLAMA_BASE_URL=http://localhost:11434

# Celery
REDIS_URL=redis://localhost:6379/0

# 临时音频存储
AUDIO_TEMP_DIR=/tmp/reflector
```

### 4. 启动依赖

```bash
# PostgreSQL + Redis
docker compose up -d postgres redis
```

### 5. 初始化数据库

```bash
python -c "import asyncio; from app.db.session import init_db; asyncio.run(init_db())"
```

### 6. 启动服务

**终端 1 — API 服务**:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**终端 2 — Celery Worker**:
```bash
celery -A app.tasks.celery_app worker --loglevel=info --concurrency=1
```

### 7. 验证

```bash
curl http://localhost:8000/api/v1/health
```

期望响应:
```json
{
  "status": "ok",
  "gpu_available": true,
  "gpu_device": "Apple M3 Max",
  "database_connected": true
}
```

---

## 移动端设置

### 1. 安装依赖

```bash
cd mobile
npm install
```

### 2. 配置 API 地址

创建 `mobile/.env`:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

> 真机测试时 localhost 需替换为开发机的局域网 IP:
> ```env
> EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:8000/api/v1
> ```

### 3. 启动 Expo

```bash
npx expo start
```

### 4. 在设备上运行

| 方式 | 命令 |
|------|------|
| iOS 模拟器 | 按 `i` |
| Android 模拟器 | 按 `a` |
| 真机 (Expo Go) | 用手机扫二维码 |

---

## Docker 部署

### 完整堆栈

```bash
cd docker

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API 密钥

# 启动所有服务
docker compose up -d

# 查看日志
docker compose logs -f
```

| 服务 | 镜像 | 端口 |
|------|------|------|
| postgres | postgres:16-alpine | 5432 |
| redis | redis:7-alpine | 6379 |
| api | backend (uvicorn) | 8000 |
| celery-worker | backend (celery) | - |

---

## 常见问题

### Q: WhisperX 模型下载慢？

模型首次加载时自动下载到 `~/.cache/whisperx/`。可手动下载:

```bash
mkdir -p ~/.cache/whisperx/
wget https://openaipublic.azureedge.net/main/whisper/models/large-v3.pt \
  -O ~/.cache/whisperx/large-v3.pt
```

### Q: 说话人分离准确率低？

- 确保录音质量, 避免背景噪音
- 说话人间保持合理距离
- 尝试将 `WHISPER_MODEL` 改为 `turbo` (加速) 或 `large-v3` (最佳质量)

### Q: 移动端真机连接不上后端？

- iOS 模拟器用 `localhost` 可以, 真机需用局域网 IP
- Android 模拟器用 `10.0.2.2` 代替 `localhost`
- macOS 防火墙可能阻止连接, 检查系统设置