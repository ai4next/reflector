import pytest


@pytest.mark.asyncio
async def test_get_reflections_empty(client):
    create_resp = await client.post("/api/v1/sessions", json={"title": "Reflection Test"})
    session_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/sessions/{session_id}/reflections")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_regenerate_reflection(client):
    create_resp = await client.post("/api/v1/sessions", json={"title": "Regen Test"})
    session_id = create_resp.json()["id"]

    resp = await client.post(f"/api/v1/sessions/{session_id}/regenerate-reflection")
    assert resp.status_code == 202