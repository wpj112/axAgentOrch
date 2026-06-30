"""End-to-end test for LoopNode execution."""
import os
os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("OPENAI_BASE_URL", "http://localhost:99999/v1")

import pytest
import pytest_asyncio
import httpx
from httpx import ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler
from sqlalchemy.dialects.postgresql import JSONB

SQLiteTypeCompiler.visit_JSONB = SQLiteTypeCompiler.visit_JSON

from app.main import app
from app.database import Base, get_db

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    test_engine = create_async_engine(TEST_DB_URL, echo=False, poolclass=StaticPool)
    test_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async def override_get_db():
        async with test_session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_loop_execution(client):
    """Create agent with loop, set parent_id via index, run and verify."""
    payload = {
        "name": "loop_e2e",
        "nodes": [
            {"type": "start", "label": "Start", "config": {}},
            {"type": "loop", "label": "CounterLoop",
             "config": {
                 "max_iterations": 5,
                 "condition": {"variable_selector": ["child", "counter"], "operator": "lt", "value": 3},
                 "start_node_id": "",
                 "end_node_id": "",
             }},
            {"type": "code", "label": "Counter",
             "config": {"language": "python", "source_code": "import json\nprint(json.dumps({'counter': 1}))"},
             "parent_id": 1},
            {"type": "end", "label": "End", "config": {}},
        ],
        "edges": [
            {"source_node_id": 0, "target_node_id": 1},
            {"source_node_id": 1, "target_node_id": 3, "source_handle": "loop_exit"},
        ],
    }

    resp = await client.post("/api/agents", json=payload)
    assert resp.status_code == 201, resp.text
    agent = resp.json()
    agent_id = agent["id"]
    print(f"\nCreated: {agent_id[:8]}...")

    # Get real UUIDs for condition config
    loop_node = next(n for n in agent["nodes"] if n["type"] == "loop")
    code_node = next(n for n in agent["nodes"] if n["type"] == "code")
    code_uuid = code_node["id"]

    # Update condition with real UUID
    update_payload = {
        "name": "loop_e2e",
        "nodes": [
            {"type": "start", "label": "Start", "config": {}},
            {"type": "loop", "label": "CounterLoop",
             "config": {
                 "max_iterations": 5,
                 "condition": {"variable_selector": [code_uuid, "counter"], "operator": "lt", "value": 3},
                 "start_node_id": code_uuid,
                 "end_node_id": code_uuid,
             }},
            {"type": "code", "label": "Counter",
             "config": {"language": "python", "source_code": "import json\nprint(json.dumps({'counter': 1}))"},
             "parent_id": 1},
            {"type": "end", "label": "End", "config": {}},
        ],
        "edges": [
            {"source_node_id": 0, "target_node_id": 1},
            {"source_node_id": 1, "target_node_id": 3, "source_handle": "loop_exit"},
        ],
    }

    resp = await client.put(f"/api/agents/{agent_id}", json=update_payload)
    assert resp.status_code == 200, resp.text
    print("Updated condition with real UUID")

    # Run
    run_resp = await client.post(f"/api/agents/{agent_id}/run", json={"input": {"message": "go"}}, timeout=30)
    assert run_resp.status_code == 200, run_resp.text

    data = run_resp.json()
    print(f"Status: {data['status']}")
    if data.get("error_message"):
        print(f"Error: {data['error_message']}")
    if data.get("output"):
        steps = data["output"].get("execution_steps", [])
        iter_count = len([s for s in steps if 'iter' in (s.get('node_id',''))])
        print(f"Iteration steps: {iter_count}")

    assert data["status"] == "success", f"Failed: {data}"
    print("✓ Loop executed successfully")
