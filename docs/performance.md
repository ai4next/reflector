# 性能优化指南

## WhisperX 模型选择

| 模型 | GPU 处理时间 (5min) | CPU 处理时间 | 内存 | 准确率 |
|------|-------------------|-------------|------|--------|
| `large-v3` (默认) | ~25s | ~4min | ~5GB | 最佳 |
| `turbo` | ~15s | ~2min | ~3GB | 良好 |
| `base` | ~5s | ~45s | ~1GB | 一般 |

```bash
# 使用 turbo 模型 (推荐非 GPU 环境)
WHISPER_MODEL=turbo
```

---

## 并发优化

### Celery Worker 并发

```bash
# 单 GPU Worker (推荐: WhisperX 独占 GPU)
celery -A app.tasks.celery_app worker --concurrency=1

# CPU Worker (可增加并发)
celery -A app.tasks.celery_app worker --concurrency=4
```

**关键配置** (`celery_app.py`):

| 参数 | 值 | 说明 |
|------|-----|------|
| `worker_prefetch_multiplier` | 1 | 防止 Worker 预取过多任务 |
| `task_acks_late` | true | 任务完成后才确认, 崩溃可重试 |
| `task_soft_time_limit` | 600 | 单任务软限制 (10 分钟) |
| `task_time_limit` | 900 | 单任务硬限制 (15 分钟) |

### WhisperX 批处理

```python
# whisperx_pipeline.py
result = model.transcribe(audio, batch_size=16)
```

- `batch_size` 增加 → 更快但更耗 GPU 显存
- `batch_size=16` 在 16GB 显存下安全
- 24GB+ 显存可提升到 `batch_size=32`

---

## 数据库优化

### 连接池

```python
# SQLAlchemy 连接池配置 (PostgreSQL 生产)
engine = create_async_engine(
    settings.database_url,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # 连接健康检查
)
```

### 索引

所有核心索引已在迁移中创建:

| 索引 | 用途 |
|------|------|
| `uq_chunk_session_index` | 防止重复上传 |
| `idx_chunks_session` | 按会话查询分片 |
| `idx_segments_chunk` | 按 chunk 查询转写结果 |
| `idx_segments_chunk_speaker` | 按说话人过滤 |
| `idx_reflections_session` | 按会话查询分析 |

---

## 网络优化

### 音频上传

- 5 分钟 WAV ~25MB (44100Hz, 16-bit, mono)
- WiFi 环境下上传 < 1 秒
- 后续可加入 Opus 压缩 (→ ~2-5MB) 减少移动网络消耗

### 轮询频率

当前 3 秒间隔, 处理耗时 20-90 秒:
- 3s × 10-30 次轮询 = 低流量开销
- 如需优化: 可在 `chunk.status` 变更时增加 polling interval 的指数退避

---

## 性能基准

| 场景 | 端到端延迟 | 说明 |
|------|----------|------|
| 5min 音频 (GPU) | ~30s | 上传 + WhisperX + AI 分析 |
| 5min 音频 (Apple Silicon) | ~60s | MPS 加速 |
| 5min 音频 (CPU) | ~5min | 可能积压, 建议减少并发录音数 |
| AI 分析 (Claude) | ~2-5s | 取决于 token 数 |
| AI 分析 (Ollama 本地) | ~10-30s | 取决于硬件 |