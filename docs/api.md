# API 文档

**Base URL**: `http://<host>:8000/api/v1`

---

## 健康检查

### `GET /health`

检查服务器状态、GPU 可用性和数据库连接。

**Response** `200`:
```json
{
  "status": "ok",
  "gpu_available": true,
  "gpu_device": "Apple M3 Max",
  "database_connected": true
}
```

---

## 会话管理

### `POST /sessions`

创建新的录音会话。

**Request Body**:
```json
{
  "title": "团队周会 - 2026-05-10"
}
```

**Response** `201`:
```json
{
  "id": "uuid",
  "title": "团队周会 - 2026-05-10",
  "status": "recording",
  "started_at": "2026-05-10T10:00:00Z",
  "chunks": [],
  "reflections": []
}
```

---

### `GET /sessions`

获取会话列表。支持分页和状态过滤。

**Query Parameters**:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| status | string | - | 过滤: recording / processing / completed |
| limit | int | 20 | 每页数量 (最大 100) |
| offset | int | 0 | 偏移量 |

**Response** `200`:
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "团队周会",
      "status": "completed",
      "started_at": "2026-05-10T10:00:00Z",
      "ended_at": "2026-05-10T10:30:00Z",
      "total_duration_seconds": 1800,
      "chunk_count": 6
    }
  ],
  "total": 1,
  "offset": 0,
  "limit": 20
}
```

---

### `GET /sessions/{session_id}`

获取会话详情，包含所有 chunks、segments 和 reflections。

**Response** `200` (截取):
```json
{
  "id": "uuid",
  "title": "团队周会",
  "status": "completed",
  "chunks": [
    {
      "id": "uuid",
      "chunk_index": 0,
      "status": "completed",
      "duration_seconds": 300,
      "segments": [
        {
          "speaker_label": "SPEAKER_00",
          "text": "今天我们讨论一下 Q2 的产品路线图",
          "start_time": 0.5,
          "end_time": 3.2,
          "confidence": 0.98
        },
        {
          "speaker_label": "SPEAKER_01",
          "text": "好的，我先分享一下用户调研的结果",
          "start_time": 3.5,
          "end_time": 8.1,
          "confidence": 0.96
        }
      ]
    }
  ],
  "reflections": [
    {
      "provider_name": "claude",
      "summary": "团队讨论了 Q2 产品路线图...",
      "key_themes": ["产品规划", "用户调研"],
      "action_items": ["跟进用户调研结果", "准备技术方案评审"],
      "improvement_suggestions": ["建议在讨论前先分发议程"],
      "sentiment_overview": {
        "SPEAKER_00": "positive",
        "SPEAKER_01": "neutral"
      }
    }
  ]
}
```

---

### `PATCH /sessions/{session_id}`

更新会话属性。

**Request Body** (可选字段):
```json
{
  "title": "更新后的标题",
  "status": "completed",
  "ended_at": "2026-05-10T10:30:00Z",
  "total_duration_seconds": 1800
}
```

**Response** `200`: 完整的 Session 对象。

---

### `DELETE /sessions/{session_id}`

删除会话及所有关联数据。

**Response** `204`: No Content。

---

## 音频上传

### `POST /sessions/{session_id}/chunks`

上传一个 5 分钟的音频分片。

**Request**: `multipart/form-data`

| 字段 | 类型 | 说明 |
|------|------|------|
| audio | File | WAV 文件 (44100Hz, 16-bit PCM, mono) |
| chunk_index | int | 分片序号 (0-based) |
| checksum | string | SHA-256 校验和 (可选, 用于幂等) |

**Response** `202`:
```json
{
  "chunk_id": "uuid",
  "status": "uploaded"
}
```

**幂等性**: 如果相同 checksum 的 chunk 已存在, 返回已存在的 chunk_id。

---

### `GET /sessions/{session_id}/chunks/{chunk_id}/status`

查询分片处理状态。App 端每 3 秒轮询此接口。

**Response** `200`:
```json
{
  "id": "uuid",
  "chunk_index": 0,
  "status": "processing",
  "stage": "transcribing",
  "progress_pct": 45,
  "error_message": null
}
```

**status 字段含义**:

| 状态 | 说明 |
|------|------|
| uploaded | 已上传, 等待处理 |
| processing | 正在处理中 |
| completed | 处理完成, 可拉取结果 |
| failed | 处理失败, 见 error_message |

---

## 转写文本

### `GET /sessions/{session_id}/transcript`

获取完整转写文本 (所有 chunks 合并)。

**Query Parameters**:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| format | string | "json" | json / text |

**format=json** 返回 Segment 数组, **format=text** 返回纯文本。

---

## AI 分析

### `GET /sessions/{session_id}/reflections`

获取会话的所有 AI 反思分析结果。

**Response** `200`:
```json
[
  {
    "id": "uuid",
    "chunk_id": "uuid",
    "provider_name": "claude",
    "model_name": "claude-sonnet-4-6",
    "summary": "团队讨论了 Q2 产品路线图和用户调研结果...",
    "key_themes": ["产品规划", "用户调研", "资源分配"],
    "action_items": [
      "跟进用户调研结果",
      "准备技术方案评审",
      "下周再次同步进度"
    ],
    "improvement_suggestions": [
      "建议在讨论前先分发议程",
      "每个议题设定时间限制"
    ],
    "sentiment_overview": {
      "SPEAKER_00": "positive",
      "SPEAKER_01": "neutral"
    },
    "tokens_used": 1250,
    "processing_time_ms": 3200
  }
]
```

---

### `POST /sessions/{session_id}/regenerate-reflection`

对会话中所有已完成的 chunk 重新运行 AI 分析 (不会重新执行 WhisperX 转写)。

**Response** `202`:
```json
{
  "status": "accepted",
  "session_id": "uuid",
  "chunks_queued": 3
}
```

---

### `POST /sessions/{session_id}/analyze-global`

触发**会话级全局分析**: 合并所有已完成的 chunk 文本, 进行一次整体性 AI 分析 (而非逐 chunk 分析)。

可以更好地识别跨 chunk 的主题演进、全局行动项和长期趋势。

返回结果存储在 `Reflections` 列表中, `chunk_id` 为 `null`。

**Response** `202`:
```json
{
  "status": "accepted",
  "session_id": "uuid",
  "message": "Global analysis queued"
}
```

---

## AI 分析结果的类型

| 类型 | `chunk_id` | 触发时机 | 说明 |
|------|-----------|---------|------|
| per-chunk | 非空 | 每个 chunk 处理完成后 | 局部逐片段分析 |
| session-level | `null` | 所有 chunk 完成后自动触发; 也可手动通过 POST `/analyze-global` 触发 | 全局整体分析 |

---

## 错误格式

所有错误响应使用统一格式:

```json
{
  "detail": "Session not found"
}
```

| HTTP 状态码 | 说明 |
|-------------|------|
| 404 | 资源不存在 |
| 422 | 请求参数验证失败 |
| 500 | 服务器内部错误 |