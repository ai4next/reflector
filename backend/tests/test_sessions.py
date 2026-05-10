import pytest


@pytest.mark.asyncio
async def test_create_session(client):
    resp = await client.post("/api/v1/sessions", json={"title": "Test Meeting"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Test Meeting"
    assert data["status"] == "recording"
    assert "id" in data
    assert "chunks" in data
    assert "reflections" in data


@pytest.mark.asyncio
async def test_create_session_without_title(client):
    resp = await client.post("/api/v1/sessions", json={})
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] is None


@pytest.mark.asyncio
async def test_list_sessions(client):
    await client.post("/api/v1/sessions", json={"title": "Session 1"})
    await client.post("/api/v1/sessions", json={"title": "Session 2"})

    resp = await client.get("/api/v1/sessions")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    assert data["items"][0]["title"] == "Session 2"  # newest first


@pytest.mark.asyncio
async def test_list_sessions_with_status_filter(client):
    await client.post("/api/v1/sessions", json={"title": "Active"})

    resp = await client.get("/api/v1/sessions?status=completed")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0

    resp = await client.get("/api/v1/sessions?status=recording")
    assert data["total"] > 0


@pytest.mark.asyncio
async def test_get_session_detail(client):
    create_resp = await client.post("/api/v1/sessions", json={"title": "Detail Test"})
    session_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/sessions/{session_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == session_id
    assert data["title"] == "Detail Test"


@pytest.mark.asyncio
async def test_get_session_not_found(client):
    resp = await client.get("/api/v1/sessions/00000000-0000-0000-0000-000000000099")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_session(client):
    create_resp = await client.post("/api/v1/sessions", json={"title": "Old Title"})
    session_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/sessions/{session_id}",
        json={"title": "New Title", "status": "completed"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "New Title"
    assert data["status"] == "completed"


@pytest.mark.asyncio
async def test_delete_session(client):
    create_resp = await client.post("/api/v1/sessions", json={"title": "To Delete"})
    session_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/sessions/{session_id}")
    assert resp.status_code == 204

    resp = await client.get(f"/api/v1/sessions/{session_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_pagination(client):
    for i in range(5):
        await client.post("/api/v1/sessions", json={"title": f"Session {i}"})

    resp = await client.get("/api/v1/sessions?limit=2&offset=0")
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["total"] == 5
    assert data["limit"] == 2
    assert data["offset"] == 0

    resp = await client.get("/api/v1/sessions?limit=2&offset=2")
    data = resp.json()
    assert len(data["items"]) == 2