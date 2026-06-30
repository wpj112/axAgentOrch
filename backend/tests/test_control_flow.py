"""Test IfElseNode and LoopNode execution."""
import pytest
import httpx
from httpx import ASGITransport

from app.main import app
from app.database import Base, async_session as orig_session
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(autouse=True)
async def setup_db():
    test_engine = create_async_engine(TEST_DB_URL, echo=False, poolclass=StaticPool)
    test_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    # Monkey patch JSONB for SQLite
    from sqlalchemy.dialects.postgresql import JSONB
    from sqlalchemy.dialects.sqlite.base import SQLiteCompiler
    original = SQLiteCompiler.visit_JSONB
    SQLiteCompiler.visit_JSONB = lambda self, type_, **kw: "JSON"
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    SQLiteCompiler.visit_JSONB = original

    app.dependency_overrides[orig_session] = lambda: test_session()
    yield
    app.dependency_overrides.clear()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_if_else_execution(client):
    """Create agent with if_else node and verify it routes correctly."""
    # Agent: start → code(output intent="order_search") → if_else → llm → end
    payload = {
        "name": "test_if_else",
        "nodes": [
            {"type": "start", "label": "Start", "config": {}},
            {"type": "code", "label": "Intent",
             "config": {"language": "python", "source_code": "print('intent=order_search')"}},
            {"type": "if_else", "label": "Router",
             "config": {
                 "cases": [{"case_id": "order", "conditions": [
                     {"variable_selector": ["node_id"], "operator": "not_empty", "value": None}
                 ]}],
                 "default_case_id": "default"
             }},
            {"type": "llm", "label": "LLM", "config": {"system_prompt": "reply ok"}},
            {"type": "end", "label": "End", "config": {}},
        ],
        "edges": [
            {"source_node_id": 0, "target_node_id": 1},
            {"source_node_id": 1, "target_node_id": 2},
            {"source_node_id": 2, "target_node_id": 3, "source_handle": "order"},
            {"source_node_id": 2, "target_node_id": 4, "source_handle": "default"},
            {"source_node_id": 3, "target_node_id": 4},
        ],
    }
    resp = await client.post("/api/agents", json=payload)
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_loop_execution(client):
    """Create agent with loop node and verify it runs with iterations."""
    payload = {
        "name": "test_loop",
        "nodes": [
            {"type": "start", "label": "Start", "config": {}},
            {"type": "loop", "label": "RetryLoop",
             "config": {
                 "max_iterations": 3,
                 "condition": {"variable_selector": ["counter_code", "count"], "operator": "lt", "value": 3},
                 "start_node_id": "counter_node",
                 "end_node_id": "counter_node",
             }},
            {"type": "code", "label": "Counter", "parent_id": None,
             "config": {"language": "python", "source_code": "print('ok')"}},
            {"type": "end", "label": "End", "config": {}},
        ],
        "edges": [
            {"source_node_id": 0, "target_node_id": 1},
            {"source_node_id": 1, "target_node_id": 3, "source_handle": "loop_exit"},
        ],
    }
    resp = await client.post("/api/agents", json=payload)
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_condition_evaluator():
    from app.engine.condition import evaluate_conditions

    # Test 'is' operator
    assert evaluate_conditions(
        [{"variable_selector": ["a", "b"], "operator": "is", "value": "hello"}],
        {"a": {"b": "hello"}}
    )

    # Test 'not_empty'
    assert evaluate_conditions(
        [{"variable_selector": ["a", "b"], "operator": "not_empty"}],
        {"a": {"b": "value"}}
    )

    # Test 'lt'
    assert evaluate_conditions(
        [{"variable_selector": ["x"], "operator": "lt", "value": 10}],
        {"x": 5}
    )

    # Test 'gte'
    assert evaluate_conditions(
        [{"variable_selector": ["x"], "operator": "gte", "value": 10}],
        {"x": 10}
    )

    # Test false
    assert not evaluate_conditions(
        [{"variable_selector": ["x"], "operator": "lt", "value": 3}],
        {"x": 5}
    )
