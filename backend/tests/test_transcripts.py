import pytest


@pytest.mark.asyncio
async def test_get_transcript_json(client):
    create_resp = await client.post("/api/v1/sessions", json={"title": "Transcript Test"})
    session_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/sessions/{session_id}/transcript")
    assert resp.status_code == 404  # no chunks processed yet


@pytest.mark.asyncio
async def test_get_transcript_not_found(client):
    import uuid
    resp = await client.get(f"/api/v1/sessions/{uuid.uuid4()}/transcript")
    assert resp.status_code == 404