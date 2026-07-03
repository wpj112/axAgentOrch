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
async def test_create_agent_persists_loop_and_if_else_refs_from_submitted_ids(client):
    payload = {
        "name": "Config Ref Agent",
        "nodes": [
            {"id": "start-temp", "type": "start", "label": "Start", "config": {}},
            {"id": "loop-temp", "type": "loop", "label": "Loop", "config": {"max_iterations": 5, "start_node_id": "score-temp", "end_condition": {"operator": "gte", "variable_selector": ["score-temp", "text"], "value": 0.8}}},
            {"id": "end-temp", "type": "end", "label": "End", "config": {}},
            {"id": "eval-temp", "type": "http", "label": "Eval", "parent_id": "loop-temp", "config": {"url": "http://example.invalid", "method": "POST"}},
            {"id": "score-temp", "type": "llm", "label": "Score", "parent_id": "loop-temp", "config": {"system_prompt": "return score", "prompt_variables": [{"name": "eval_result", "variable_selector": ["eval-temp", "result"]}]}},
            {"id": "if-temp", "type": "if_else", "label": "Router", "parent_id": "loop-temp", "config": {"cases": [{"case_id": "done-temp", "conditions": [{"variable_selector": ["score-temp", "text"], "operator": "gte", "value": 0.8}]}], "default_case_id": "retry-temp", "branches": [{"case_id": "done-temp"}, {"case_id": "retry-temp"}]}},
            {"id": "done-temp", "type": "llm", "label": "Done", "parent_id": "loop-temp", "config": {"system_prompt": "done"}},
            {"id": "retry-temp", "type": "http", "label": "Retry", "parent_id": "loop-temp", "config": {"url": "http://example.invalid/retry", "method": "POST", "body_mode": "fields", "body_fields": [{"target_path": "score", "source_type": "node", "variable_selector": ["score-temp", "text"], "value_type": "number"}]}},
        ],
        "edges": [
            {"source_node_id": "start-temp", "target_node_id": "loop-temp"},
            {"source_node_id": "loop-temp", "target_node_id": "end-temp", "source_handle": "loop_exit"},
            {"source_node_id": "eval-temp", "target_node_id": "score-temp"},
            {"source_node_id": "score-temp", "target_node_id": "if-temp"},
            {"source_node_id": "if-temp", "target_node_id": "done-temp", "source_handle": "done-temp", "condition": "done-temp"},
            {"source_node_id": "if-temp", "target_node_id": "retry-temp", "source_handle": "retry-temp", "condition": "retry-temp"}
        ],
    }

    resp = await client.post("/api/agents", json=payload)
    assert resp.status_code == 201, resp.text
    data = resp.json()

    nodes_by_label = {node["label"]: node for node in data["nodes"]}
    loop_node = nodes_by_label["Loop"]
    score_node = nodes_by_label["Score"]
    router_node = nodes_by_label["Router"]
    done_node = nodes_by_label["Done"]
    retry_node = nodes_by_label["Retry"]
    done_edge = next(edge for edge in data["edges"] if edge["target_node_id"] == done_node["id"])
    retry_edge = next(edge for edge in data["edges"] if edge["target_node_id"] == retry_node["id"])

    assert loop_node["config"]["start_node_id"] == score_node["id"]
    assert loop_node["config"]["end_condition"]["variable_selector"][0] == score_node["id"]
    assert router_node["config"]["cases"][0]["case_id"] == done_node["id"]
    assert router_node["config"]["cases"][0]["conditions"][0]["variable_selector"][0] == score_node["id"]
    assert score_node["config"]["prompt_variables"][0]["variable_selector"][0] == nodes_by_label["Eval"]["id"]
    assert router_node["config"]["branches"][0]["case_id"] == done_node["id"]
    assert router_node["config"]["branches"][1]["case_id"] == retry_node["id"]
    assert router_node["config"]["default_case_id"] == retry_node["id"]
    assert retry_node["config"]["body_fields"][0]["variable_selector"][0] == score_node["id"]
    assert done_edge["source_handle"] == done_node["id"]
    assert retry_edge["source_handle"] == retry_node["id"]
    assert done_node["parent_id"] == loop_node["id"]
    assert retry_node["parent_id"] == loop_node["id"]


@pytest.mark.asyncio
async def test_exported_agent_json_can_be_imported(client):
    payload = {
        "name": "Export Import Agent",
        "nodes": [
            {"id": "start-temp", "type": "start", "label": "Start", "config": {}},
            {"id": "score-temp", "type": "llm", "label": "Score", "config": {"system_prompt": "score"}},
            {"id": "judge-temp", "type": "llm", "label": "Judge", "config": {"system_prompt": "score is {{score}}", "prompt_variables": [{"name": "score", "variable_selector": ["score-temp", "text"]}]}},
            {"id": "router-temp", "type": "if_else", "label": "Router", "config": {"cases": [{"case_id": "done-temp", "conditions": [{"variable_selector": ["judge-temp", "text"], "operator": "contains", "value": "ok"}]}], "default_case_id": "retry-temp", "branches": [{"case_id": "done-temp"}, {"case_id": "retry-temp"}]}},
            {"id": "done-temp", "type": "end", "label": "Done", "config": {}},
            {"id": "retry-temp", "type": "end", "label": "Retry", "config": {}},
        ],
        "edges": [
            {"source_node_id": "start-temp", "target_node_id": "score-temp"},
            {"source_node_id": "score-temp", "target_node_id": "judge-temp"},
            {"source_node_id": "judge-temp", "target_node_id": "router-temp"},
            {"source_node_id": "router-temp", "target_node_id": "done-temp", "source_handle": "done-temp", "condition": "done-temp"},
            {"source_node_id": "router-temp", "target_node_id": "retry-temp", "source_handle": "retry-temp", "condition": "retry-temp"},
        ],
    }

    created_resp = await client.post("/api/agents", json=payload)
    assert created_resp.status_code == 201, created_resp.text
    created = created_resp.json()

    export_resp = await client.get(f"/api/agents/{created['id']}/export")
    assert export_resp.status_code == 200, export_resp.text
    exported = export_resp.json()
    assert all("id" in node for node in exported["nodes"])

    import_resp = await client.post("/api/agents/import", json=exported)
    assert import_resp.status_code == 201, import_resp.text
    imported = import_resp.json()

    nodes_by_label = {node["label"]: node for node in imported["nodes"]}
    score_node = nodes_by_label["Score"]
    judge_node = nodes_by_label["Judge"]
    router_node = nodes_by_label["Router"]
    done_node = nodes_by_label["Done"]

    assert imported["id"] != created["id"]
    assert imported["name"].startswith(f"{created['name']}_")
    assert judge_node["config"]["prompt_variables"][0]["variable_selector"][0] == score_node["id"]
    assert router_node["config"]["cases"][0]["conditions"][0]["variable_selector"][0] == judge_node["id"]
    assert router_node["config"]["cases"][0]["case_id"] == done_node["id"]
    done_edge = next(edge for edge in imported["edges"] if edge["target_node_id"] == done_node["id"])
    assert done_edge["source_handle"] == done_node["id"]


@pytest.mark.asyncio
async def test_update_loop_agent_preserves_parent_nodes(client):
    create_payload = {
        "name": "Loop Save Agent",
        "nodes": [
            {"type": "start", "label": "Start", "config": {}},
            {"type": "loop", "label": "Loop", "config": {"max_iterations": 3}},
            {"type": "end", "label": "End", "config": {}},
            {"type": "llm", "label": "Inside", "config": {"system_prompt": "hello"}, "parent_id": 1},
        ],
        "edges": [
            {"source_node_id": 0, "target_node_id": 1},
            {"source_node_id": 1, "target_node_id": 2, "source_handle": "loop_exit"},
        ],
    }
    created = await client.post("/api/agents", json=create_payload)
    assert created.status_code == 201, created.text
    agent_id = created.json()["id"]

    update_payload = {
        "name": "Loop Save Agent",
        "nodes": [
            {"type": "start", "label": "Start", "config": {}},
            {"type": "loop", "label": "Loop", "config": {"max_iterations": 5, "start_node_id": "3", "end_node_id": "3", "end_condition": {"operator": "gte", "variable_selector": ["3", "text"], "value": 0.8}}},
            {"type": "end", "label": "End", "config": {}},
            {"type": "llm", "label": "Inside", "config": {"system_prompt": "hello again"}, "parent_id": 1},
        ],
        "edges": [
            {"source_node_id": 0, "target_node_id": 1},
            {"source_node_id": 1, "target_node_id": 2, "source_handle": "loop_exit"},
        ],
    }
    resp = await client.put(f"/api/agents/{agent_id}", json=update_payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    loop_node = next(node for node in data["nodes"] if node["type"] == "loop")
    llm_node = next(node for node in data["nodes"] if node["type"] == "llm")
    assert loop_node["config"]["max_iterations"] == 5
    assert loop_node["config"]["start_node_id"] == llm_node["id"]
    assert loop_node["config"]["end_node_id"] == llm_node["id"]
    assert loop_node["config"]["end_condition"]["variable_selector"][0] == llm_node["id"]
    assert llm_node["parent_id"] == loop_node["id"]


@pytest.mark.asyncio
async def test_delete_agent(client):
    agent_id = await test_create_agent(client)
    resp = await client.delete(f"/api/agents/{agent_id}")
    assert resp.status_code == 204

    resp = await client.get(f"/api/agents/{agent_id}")
    assert resp.status_code == 404
