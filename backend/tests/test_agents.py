import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler
from sqlalchemy.dialects.postgresql import JSONB

# Monkey-patch: make SQLite compiler render PostgreSQL JSONB as JSON
SQLiteTypeCompiler.visit_JSONB = SQLiteTypeCompiler.visit_JSON

from app.main import app
from app.database import Base, get_db
from app.models import Agent, Node, Edge

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    test_engine = create_async_engine(
        TEST_DB_URL, echo=False, poolclass=StaticPool
    )
    test_session = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def override_get_db():
        async with test_session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_create_agent(client):
    payload = {
        "name": "Test Agent",
        "description": "A test agent",
        "nodes": [
            {"type": "start", "label": "Start", "config": {}},
            {"type": "llm", "label": "LLM Node", "config": {"model": "gpt-4o", "system_prompt": "You are helpful."}},
            {"type": "end", "label": "End", "config": {}},
        ],
        "edges": [
            {"source_node_id": 0, "target_node_id": 1},
            {"source_node_id": 1, "target_node_id": 2},
        ],
    }
    resp = await client.post("/api/agents", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Agent"
    assert len(data["nodes"]) == 3
    assert len(data["edges"]) == 2
    return data["id"]


@pytest.mark.asyncio
async def test_create_agent_without_edges(client):
    payload = {
        "name": "Draft Agent",
        "description": "No edges yet",
        "nodes": [
            {"type": "start", "label": "Start", "config": {}},
            {"type": "llm", "label": "Judge", "config": {}},
        ],
        "edges": [],
    }
    resp = await client.post("/api/agents", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Draft Agent"
    assert len(data["edges"]) == 0


@pytest.mark.asyncio
async def test_list_agents(client):
    resp = await client.get("/api/agents")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_get_agent(client):
    agent_id = await test_create_agent(client)
    resp = await client.get(f"/api/agents/{agent_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Test Agent"


@pytest.mark.asyncio
async def test_update_agent(client):
    agent_id = await test_create_agent(client)
    payload = {
        "name": "Updated Agent",
        "description": "Updated description",
        "nodes": [
            {"type": "start", "label": "Start", "config": {}},
            {"type": "llm", "label": "LLM", "config": {}},
            {"type": "end", "label": "End", "config": {}},
        ],
        "edges": [
            {"source_node_id": 0, "target_node_id": 1},
            {"source_node_id": 1, "target_node_id": 2},
        ],
    }
    resp = await client.put(f"/api/agents/{agent_id}", json=payload)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Agent"


@pytest.mark.asyncio
async def test_update_agent_without_edges(client):
    agent_id = await test_create_agent(client)
    payload = {
        "name": "Draft Agent Updated",
        "description": "Disconnected draft",
        "nodes": [
            {"type": "start", "label": "Start", "config": {}},
            {"type": "llm", "label": "Judge", "config": {}},
        ],
        "edges": [],
    }
    resp = await client.put(f"/api/agents/{agent_id}", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Draft Agent Updated"
    assert len(data["edges"]) == 0


@pytest.mark.asyncio
async def test_delete_agent(client):
    agent_id = await test_create_agent(client)
    resp = await client.delete(f"/api/agents/{agent_id}")
    assert resp.status_code == 204

    resp = await client.get(f"/api/agents/{agent_id}")
    assert resp.status_code == 404
