# 常见问题

## 安装与环境

### Q: WhisperX 安装失败？

WhisperX 依赖 PyTorch 和 CUDA/MPS 运行时。

**解决方案**:
```bash
# 先安装 PyTorch (根据你的硬件选择)
# CUDA:
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
# Apple Silicon:
pip install torch torchaudio

# 然后安装 WhisperX
pip install whisperx
```

### Q: WhisperX 模型下载慢？

模型文件较大 (~3GB)，首次下载可能很慢。

**解决方案**:
```bash
# 手动下载 large-v3 模型
mkdir -p ~/.cache/whisperx/
wget https://openaipublic.azureedge.net/main/whisper/models/large-v3.pt \
  -O ~/.cache/whisperx/large-v3.pt

# 或使用更小的模型 (faster, less accurate)
# 设置 WHISPER_MODEL=turbo 或 WHISPER_MODEL=base
```

### Q: pyannote 说话人分离需要什么？

需要 HuggingFace 账号授权:
1. 注册 https://huggingface.co
2. 创建 Access Token: https://huggingface.co/settings/tokens
3. 同意 pyannote 使用条款:
   - https://huggingface.co/pyannote/speaker-diarization-3.1
   - https://huggingface.co/pyannote/segmentation-3.0
4. 设置 `HF_TOKEN=hf_xxxx` 到 `.env`

### Q: LangChain 集成需要额外安装？

根据你使用的模型提供商安装对应包:
```bash
# Claude
pip install langchain-anthropic

# OpenAI
pip install langchain-openai

# Ollama (本地部署)
pip install langchain-ollama
```

---

## 使用问题

### Q: 说话人分离不准确？

- **背景噪音**: 确保录音环境安静
- **说话人重叠**: 引导用户轮流发言
- **录音距离**: 说话人离麦克风距离保持一致
- **模型限制**: WhisperX 说话人分离在 2-4 人场景效果最佳

### Q: AI 分析结果为空？

1. 检查 API Key 是否配置正确
2. 检查网络是否能访问 API 端点
3. 查看 Celery Worker 日志中的错误信息
4. 尝试切换到其他分析提供商 (claude ↔ openai)

### Q: 上传大文件失败？

- 默认限制 50MB (约 2 个 5 分钟 WAV 分片)
- 确保 `MAX_UPLOAD_SIZE_MB` 配置正确
- 检查 `AUDIO_TEMP_DIR` 是否有足够磁盘空间

### Q: 录音处理时间太长？

| 音频时长 | CPU (int8) | Apple Silicon | NVIDIA GPU |
|---------|------------|---------------|------------|
| 5 分钟   | 3-5 分钟   | 30-60 秒     | 20-30 秒  |

- **CPU 用户**: 考虑使用 `turbo` 模型 (更快, 略低精度)
- **GPU 用户**: 确认 `torch.cuda.is_available()` 返回 true

---

## 开发问题

### Q: 如何切换 AI 分析提供商？

```env
# .env
DEFAULT_ANALYSIS_PROVIDER=openai  # claude | openai | ollama
```

### Q: 移动端真机测试连不上后端？

```
Android 模拟器: EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000/api/v1
iOS 模拟器:     EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
真机:           EXPO_PUBLIC_API_BASE_URL=http://<局域网IP>:8000/api/v1
```

### Q: 如何添加自定义分析提供商？

LangChain 架构下, 只需将新模型添加到 `PROVIDER_REGISTRY`:

```python
# app/services/analysis/langchain_provider.py
PROVIDER_REGISTRY["groq"] = ("langchain_groq", "ChatGroq")
PROVIDER_MODEL_MAP["groq"] = "llama-3.1-70b-versatile"
```

然后在 `factory.py` 中注册:
```python
class _GroqProvider(LangChainAnalysisProvider):
    def __init__(self):
        super().__init__("groq")

AnalysisProviderFactory.register("groq", _GroqProvider)
```

---

## 部署问题

### Q: Docker 中 GPU 不可用？

1. 安装 NVIDIA Container Toolkit
2. 确保 `nvidia-smi` 可正常运行
3. Docker Compose 需配置 `deploy.resources.reservations.devices`

### Q: Celery Worker 内存占用高？

WhisperX 模型需要约 5GB 内存 (large-v3 + 对齐 + 说话人分离):
- 使用 `turbo` 模型减小内存占用
- 增加 Worker 数量以减少每 Worker 负载
- 确保 `worker_prefetch_multiplier=1`