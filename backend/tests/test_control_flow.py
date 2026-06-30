"""Tests for IfElseNode and LoopNode execution and persistence."""
import uuid
from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler

SQLiteTypeCompiler.visit_JSONB = SQLiteTypeCompiler.visit_JSON

from app.main import app
from app.database import Base, get_db
from app.engine.builder import build_graph

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

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def make_node(node_type: str, label: str, config: dict | None = None, parent_id=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        type=node_type,
        label=label,
        config=config or {},
        parent_id=parent_id,
    )


def make_edge(source, target, source_handle=None, condition=None):
    return SimpleNamespace(
        source_node_id=source.id,
        target_node_id=target.id,
        source_handle=source_handle,
        condition=condition,
    )


def test_if_else_can_read_direct_upstream_output():
    start = make_node('start', 'Start')
    code = make_node('code', 'Intent', {'language': 'python', 'source_code': "print('order_search')"})
    router = make_node('if_else', 'Router', {
        'field_path': 'result',
        'operator': 'is',
        'branches': [
            {'case_id': 'order', 'value': 'order_search'},
        ],
        'default_case_id': 'default',
    })
    order_end = make_node('end', 'Order End')
    default_end = make_node('end', 'Default End')

    graph = build_graph(
        [start, code, router, order_end, default_end],
        [
            make_edge(start, code),
            make_edge(code, router),
            make_edge(router, order_end, condition='order'),
            make_edge(router, default_end, condition='default'),
        ],
        model='gpt-4o',
        api_key='test',
        base_url='https://example.invalid/v1',
        temperature=0.0,
    )

    result = graph.invoke({'messages': [], 'input': {}, 'execution_steps': [], 'node_outputs': {}, 'tool_results': {}})
    router_output = result['node_outputs'][str(router.id)]
    assert router_output['matched_case'] == 'order'
    assert router_output['upstream_output']['result'] == 'order_search'


@pytest.mark.asyncio
async def test_create_agent_persists_source_handle_and_parent_id(client):
    payload = {
        'name': 'test_loop_create',
        'nodes': [
            {'type': 'start', 'label': 'Start', 'config': {}},
            {'type': 'loop', 'label': 'RetryLoop', 'config': {'max_iterations': 2, 'condition': {'variable_selector': ['status'], 'operator': 'is', 'value': 'ok'}, 'start_node_id': 'child', 'end_node_id': 'child'}},
            {'type': 'code', 'label': 'Child', 'parent_id': 1, 'config': {'language': 'python', 'source_code': "print('ok')"}},
            {'type': 'end', 'label': 'End', 'config': {}},
        ],
        'edges': [
            {'source_node_id': 0, 'target_node_id': 1},
            {'source_node_id': 1, 'target_node_id': 3, 'source_handle': 'loop_exit'},
        ],
    }

    resp = await client.post('/api/agents', json=payload)
    assert resp.status_code == 201, resp.text
    data = resp.json()

    loop_node = next(node for node in data['nodes'] if node['type'] == 'loop')
    child_node = next(node for node in data['nodes'] if node['label'] == 'Child')
    loop_edge = next(edge for edge in data['edges'] if edge['source_node_id'] == loop_node['id'])

    assert child_node['parent_id'] == loop_node['id']
    assert loop_edge['source_handle'] == 'loop_exit'


@pytest.mark.asyncio
async def test_update_agent_remaps_parent_id_and_preserves_source_handle(client):
    create_payload = {
        'name': 'test_loop_update',
        'nodes': [
            {'type': 'start', 'label': 'Start', 'config': {}},
            {'type': 'loop', 'label': 'RetryLoop', 'config': {'max_iterations': 2, 'condition': {'variable_selector': ['status'], 'operator': 'is', 'value': 'ok'}, 'start_node_id': 'child', 'end_node_id': 'child'}},
            {'type': 'code', 'label': 'Child', 'parent_id': 1, 'config': {'language': 'python', 'source_code': "print('ok')"}},
            {'type': 'end', 'label': 'End', 'config': {}},
        ],
        'edges': [
            {'source_node_id': 0, 'target_node_id': 1},
            {'source_node_id': 1, 'target_node_id': 3, 'source_handle': 'loop_exit'},
        ],
    }

    create_resp = await client.post('/api/agents', json=create_payload)
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    agent_id = created['id']

    old_loop = next(node for node in created['nodes'] if node['type'] == 'loop')
    old_child = next(node for node in created['nodes'] if node['label'] == 'Child')

    update_payload = {
        'name': 'test_loop_update_v2',
        'nodes': [
            {'type': 'start', 'label': 'Start', 'config': {}},
            {'type': 'loop', 'label': 'RetryLoop', 'config': {'max_iterations': 3, 'condition': {'variable_selector': ['status'], 'operator': 'is', 'value': 'ok'}, 'start_node_id': 'child', 'end_node_id': 'child'}},
            {'type': 'code', 'label': 'Child', 'parent_id': old_loop['id'], 'config': {'language': 'python', 'source_code': "print('still ok')"}},
            {'type': 'end', 'label': 'End', 'config': {}},
        ],
        'edges': [
            {'source_node_id': 0, 'target_node_id': 1},
            {'source_node_id': old_loop['id'], 'target_node_id': 3, 'source_handle': 'loop_exit'},
        ],
    }

    update_resp = await client.put(f'/api/agents/{agent_id}', json=update_payload)
    assert update_resp.status_code == 200, update_resp.text
    updated = update_resp.json()

    new_loop = next(node for node in updated['nodes'] if node['type'] == 'loop')
    new_child = next(node for node in updated['nodes'] if node['label'] == 'Child')
    loop_edge = next(edge for edge in updated['edges'] if edge['source_node_id'] == new_loop['id'])

    assert old_loop['id'] != new_loop['id']
    assert old_child['id'] != new_child['id']
    assert new_child['parent_id'] == new_loop['id']
    assert loop_edge['source_handle'] == 'loop_exit'


def test_condition_evaluator():
    from app.engine.condition import evaluate_conditions

    assert evaluate_conditions(
        [{'variable_selector': ['a', 'b'], 'operator': 'is', 'value': 'hello'}],
        {'a': {'b': 'hello'}}
    )
    assert evaluate_conditions(
        [{'variable_selector': ['a', 'b'], 'operator': 'not_empty'}],
        {'a': {'b': 'value'}}
    )
    assert evaluate_conditions(
        [{'variable_selector': ['x'], 'operator': 'lt', 'value': 10}],
        {'x': 5}
    )
    assert evaluate_conditions(
        [{'variable_selector': ['x'], 'operator': 'gte', 'value': 10}],
        {'x': 10}
    )
    assert not evaluate_conditions(
        [{'variable_selector': ['x'], 'operator': 'lt', 'value': 3}],
        {'x': 5}
    )
