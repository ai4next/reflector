import io
import uuid

import pytest


@pytest.mark.asyncio
async def test_upload_chunk(client):
    create_resp = await client.post("/api/v1/sessions", json={"title": "Upload Test"})
    session_id = create_resp.json()["id"]

    fake_audio = io.BytesIO(b"\x00" * 1024)
    files = {"audio": ("test.wav", fake_audio, "audio/wav")}
    resp = await client.post(
        f"/api/v1/sessions/{session_id}/chunks",
        data={"chunk_index": 0},
        files=files,
    )
    assert resp.status_code == 202
    data = resp.json()
    assert "chunk_id" in data
    assert data["status"] == "uploaded"


@pytest.mark.asyncio
async def test_upload_chunk_with_checksum(client):
    import hashlib

    create_resp = await client.post("/api/v1/sessions", json={"title": "Checksum Test"})
    session_id = create_resp.json()["id"]

    audio_data = b"\x01" * 1024
    checksum = hashlib.sha256(audio_data).hexdigest()
    files = {"audio": ("test.wav", io.BytesIO(audio_data), "audio/wav")}
    resp = await client.post(
        f"/api/v1/sessions/{session_id}/chunks",
        data={"chunk_index": 0, "checksum": checksum},
        files=files,
    )
    assert resp.status_code == 202


@pytest.mark.asyncio
async def test_upload_chunk_idempotent(client):
    create_resp = await client.post("/api/v1/sessions", json={"title": "Idempotent Test"})
    session_id = create_resp.json()["id"]

    audio_data = b"\x02" * 1024
    files = {"audio": ("test.wav", io.BytesIO(audio_data), "audio/wav")}

    resp1 = await client.post(
        f"/api/v1/sessions/{session_id}/chunks",
        data={"chunk_index": 0},
        files=files,
    )
    assert resp1.status_code == 202

    resp2 = await client.post(
        f"/api/v1/sessions/{session_id}/chunks",
        data={"chunk_index": 0},
        files=files,
    )
    assert resp2.status_code == 202
    assert resp2.json()["chunk_id"] == resp1.json()["chunk_id"]


@pytest.mark.asyncio
async def test_get_chunk_status(client):
    create_resp = await client.post("/api/v1/sessions", json={"title": "Status Test"})
    session_id = create_resp.json()["id"]

    files = {"audio": ("test.wav", io.BytesIO(b"\x00" * 1024), "audio/wav")}
    upload_resp = await client.post(
        f"/api/v1/sessions/{session_id}/chunks",
        data={"chunk_index": 0},
        files=files,
    )
    chunk_id = upload_resp.json()["chunk_id"]

    resp = await client.get(f"/api/v1/sessions/{session_id}/chunks/{chunk_id}/status")
    assert resp.status_code == 200
    assert resp.json()["status"] in ("uploaded", "processing")


@pytest.mark.asyncio
async def test_upload_chunk_no_session(client):
    files = {"audio": ("test.wav", io.BytesIO(b"\x00" * 1024), "audio/wav")}
    resp = await client.post(
        f"/api/v1/sessions/{uuid.uuid4()}/chunks",
        data={"chunk_index": 0},
        files=files,
    )
    assert resp.status_code == 404