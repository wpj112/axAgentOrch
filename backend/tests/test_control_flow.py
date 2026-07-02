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
    assert router_output['matched_case'] == 'Order End'
    assert router_output['matched_case_key'] == 'order'
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
        [{'variable_selector': ['a', 'b'], 'operator': 'contains', 'value': 'ell'}],
        {'a': {'b': 'hello'}}
    )
    assert evaluate_conditions(
        [{'variable_selector': ['a', 'b'], 'operator': 'starts_with', 'value': 'he'}],
        {'a': {'b': 'hello'}}
    )
    assert evaluate_conditions(
        [{'variable_selector': ['a', 'b'], 'operator': 'ends_with', 'value': 'lo'}],
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
    assert not evaluate_conditions(
        [{'variable_selector': ['a', 'b'], 'operator': 'contains', 'value': 'xyz'}],
        {'a': {'b': 'hello'}}
    )


def test_extract_result_text_prefers_node_outputs_when_messages_empty():
    from app.engine.executor import _extract_result_text

    state = {
        'messages': [],
        'node_outputs': {
            'start': {'status': 'ok'},
            'http': {'models': [{'name': 'gpt-oss:20b'}]},
            'loop': {'iterations': 3},
        },
    }

    result = _extract_result_text(state)
    assert 'gpt-oss:20b' in result


def test_extract_result_text_uses_non_empty_result_field():
    from app.engine.executor import _extract_result_text

    state = {
        'messages': [],
        'node_outputs': {
            'code': {'result': 'summary output'},
            'end': {'status': 'ok'},
        },
    }

    assert _extract_result_text(state) == 'summary output'


def test_code_node_python_ctx_handles_json_nulls():
    start = make_node('start', 'Start')
    code = make_node('code', 'Code', {
        'language': 'python',
        'source_code': "import json\nprint(json.dumps(_ctx))",
    })

    graph = build_graph(
        [start, code],
        [make_edge(start, code)],
        model='gpt-4o',
        api_key='test',
        base_url='https://example.invalid/v1',
        temperature=0.0,
    )

    result = graph.invoke({
        'messages': [],
        'input': {},
        'execution_steps': [],
        'node_outputs': {},
        'tool_results': {'fake_http': {'models': [{'name': 'demo', 'details': None}]}}
    })

    code_output = result['node_outputs'][str(code.id)]['result']
    assert '"details": null' in code_output


def test_loop_stops_after_first_iteration_when_end_condition_is_met():
    start = make_node('start', 'Start')
    loop = make_node('loop', 'RetryLoop', {
        'max_iterations': 3,
        'start_node_id': '',
        'end_node_id': '',
    })
    score = make_node('code', 'Score', {
        'language': 'python',
        'source_code': "print('1.0')",
    }, parent_id=loop.id)
    loop.config['end_condition'] = {
        'variable_selector': [str(score.id), 'result'],
        'operator': 'gte',
        'value': 0.8,
    }
    end = make_node('end', 'End')

    graph = build_graph(
        [start, loop, score, end],
        [
            make_edge(start, loop),
            make_edge(loop, end, source_handle='loop_exit'),
        ],
        model='gpt-4o',
        api_key='test',
        base_url='https://example.invalid/v1',
        temperature=0.0,
    )

    result = graph.invoke({
        'messages': [],
        'input': {},
        'execution_steps': [],
        'node_outputs': {},
        'tool_results': {},
    })

    iteration_steps = [
        step for step in result['execution_steps']
        if step.get('type') == 'loop_iter'
    ]
    assert len(iteration_steps) == 1
    assert result['node_outputs'][str(loop.id)]['iterations'] == 1
    assert result['node_outputs'][str(score.id)]['result'] == '1.0'


def test_loop_legacy_continue_condition_still_supported():
    start = make_node('start', 'Start')
    loop = make_node('loop', 'RetryLoop', {
        'max_iterations': 3,
        'start_node_id': '',
        'end_node_id': '',
    })
    score = make_node('code', 'Score', {
        'language': 'python',
        'source_code': "print('1.0')",
    }, parent_id=loop.id)
    loop.config['condition'] = {
        'variable_selector': [str(score.id), 'result'],
        'operator': 'lt',
        'value': 0.8,
    }
    end = make_node('end', 'End')

    graph = build_graph(
        [start, loop, score, end],
        [
            make_edge(start, loop),
            make_edge(loop, end, source_handle='loop_exit'),
        ],
        model='gpt-4o',
        api_key='test',
        base_url='https://example.invalid/v1',
        temperature=0.0,
    )

    result = graph.invoke({
        'messages': [],
        'input': {},
        'execution_steps': [],
        'node_outputs': {},
        'tool_results': {},
    })

    iteration_steps = [
        step for step in result['execution_steps']
        if step.get('type') == 'loop_iter'
    ]
    assert len(iteration_steps) == 1
    assert result['node_outputs'][str(loop.id)]['iterations'] == 1
    assert result['node_outputs'][str(score.id)]['result'] == '1.0'


def test_loop_records_each_child_execution_per_iteration(monkeypatch):
    import app.engine.builder as builder_module

    class FakeChatOpenAI:
        def __init__(self, *args, **kwargs):
            pass

        def invoke(self, messages):
            return SimpleNamespace(content='0.5')

    monkeypatch.setattr(builder_module, 'ChatOpenAI', FakeChatOpenAI)

    start = make_node('start', 'Start')
    loop = make_node('loop', 'RetryLoop', {
        'max_iterations': 2,
        'start_node_id': '',
        'end_node_id': '',
    })
    score = make_node('code', 'Score', {
        'language': 'python',
        'source_code': "print('0.5')",
    }, parent_id=loop.id)
    llm = make_node('llm', 'Judge', {
        'system_prompt': 'Return the score only.',
    }, parent_id=loop.id)
    loop.config['end_condition'] = {
        'variable_selector': [str(score.id), 'result'],
        'operator': 'gte',
        'value': 0.8,
    }
    end = make_node('end', 'End')

    graph = build_graph(
        [start, loop, score, llm, end],
        [
            make_edge(start, loop),
            make_edge(score, llm),
            make_edge(loop, end, source_handle='loop_exit'),
        ],
        model='gpt-4o',
        api_key='test',
        base_url='https://example.invalid/v1',
        temperature=0.0,
    )

    result = graph.invoke({
        'messages': [],
        'input': {'message': 'judge'},
        'execution_steps': [],
        'node_outputs': {},
        'tool_results': {},
    })

    score_steps = [step for step in result['execution_steps'] if step.get('ref_node_id') == str(score.id)]
    llm_steps = [step for step in result['execution_steps'] if step.get('ref_node_id') == str(llm.id)]
    assert len(score_steps) == 2
    assert len(llm_steps) == 2
    assert score_steps[0]['label'].startswith('Iter 1')
    assert score_steps[1]['label'].startswith('Iter 2')


def test_loop_llm_rebuilds_prompt_each_iteration(monkeypatch):
    import app.engine.builder as builder_module

    captured_messages = []

    class FakeChatOpenAI:
        def __init__(self, *args, **kwargs):
            pass

        def invoke(self, messages):
            captured_messages.append(messages)
            return SimpleNamespace(content='0.5')

    monkeypatch.setattr(builder_module, 'ChatOpenAI', FakeChatOpenAI)

    start = make_node('start', 'Start')
    loop = make_node('loop', 'RetryLoop', {
        'max_iterations': 2,
        'start_node_id': '',
        'end_node_id': '',
    })
    score = make_node('code', 'Score', {
        'language': 'python',
        'source_code': "print('0.5')",
    }, parent_id=loop.id)
    llm = make_node('llm', 'Judge', {
        'system_prompt': 'Return the score only.',
    }, parent_id=loop.id)
    loop.config['end_condition'] = {
        'variable_selector': [str(score.id), 'result'],
        'operator': 'gte',
        'value': 0.8,
    }
    end = make_node('end', 'End')

    graph = build_graph(
        [start, loop, score, llm, end],
        [
            make_edge(start, loop),
            make_edge(score, llm),
            make_edge(loop, end, source_handle='loop_exit'),
        ],
        model='gpt-4o',
        api_key='test',
        base_url='https://example.invalid/v1',
        temperature=0.0,
    )

    graph.invoke({
        'messages': [],
        'input': {'message': 'judge'},
        'execution_steps': [],
        'node_outputs': {},
        'tool_results': {},
    })

    assert len(captured_messages) == 2
    for prompt_messages in captured_messages:
        assert len(prompt_messages) == 2
        assert prompt_messages[0].content == 'Return the score only.'
        assert 'Previous node outputs:' in prompt_messages[1].content
        assert 'User request:' in prompt_messages[1].content
    assert '0.5' in captured_messages[1][1].content



def test_loop_if_else_executes_only_matched_branch():
    start = make_node('start', 'Start')
    loop = make_node('loop', 'RetryLoop', {
        'max_iterations': 1,
        'start_node_id': '',
        'end_node_id': '',
    })
    score = make_node('code', 'Score', {
        'language': 'python',
        'source_code': "print('0.5')",
    }, parent_id=loop.id)
    router = make_node('if_else', 'Router', {
        'cases': [
            {'case_id': 'retry', 'conditions': [{'variable_selector': [str(score.id), 'result'], 'operator': 'lt', 'value': 0.8}]},
            {'case_id': 'done', 'conditions': [{'variable_selector': [str(score.id), 'result'], 'operator': 'gte', 'value': 0.8}]},
        ],
        'default_case_id': 'default',
    }, parent_id=loop.id)
    retry_node = make_node('code', 'Retry', {
        'language': 'python',
        'source_code': "print('retry-branch')",
    }, parent_id=loop.id)
    done_node = make_node('code', 'Done', {
        'language': 'python',
        'source_code': "print('done-branch')",
    }, parent_id=loop.id)
    end = make_node('end', 'End')

    graph = build_graph(
        [start, loop, score, router, retry_node, done_node, end],
        [
            make_edge(start, loop),
            make_edge(score, router),
            make_edge(router, retry_node, source_handle='retry'),
            make_edge(router, done_node, source_handle='done'),
            make_edge(loop, end, source_handle='loop_exit'),
        ],
        model='gpt-4o',
        api_key='test',
        base_url='https://example.invalid/v1',
        temperature=0.0,
    )

    result = graph.invoke({
        'messages': [],
        'input': {},
        'execution_steps': [],
        'node_outputs': {},
        'tool_results': {},
    })

    assert result['node_outputs'][str(router.id)]['matched_case'] == 'Retry'
    assert result['node_outputs'][str(router.id)]['matched_case_key'] == 'retry'
    assert result['node_outputs'][str(retry_node.id)]['result'] == 'retry-branch'
    assert str(done_node.id) not in result['node_outputs']


def test_loop_does_not_execute_unreached_nodes_after_if_else_branch():
    start = make_node('start', 'Start')
    loop = make_node('loop', 'RetryLoop', {
        'max_iterations': 1,
        'start_node_id': '',
        'end_node_id': '',
    })
    score = make_node('code', 'Score', {
        'language': 'python',
        'source_code': "print('1.0')",
    }, parent_id=loop.id)
    router = make_node('if_else', 'Router', {
        'cases': [
            {'case_id': 'done', 'conditions': [{'variable_selector': [str(score.id), 'result'], 'operator': 'gte', 'value': 0.8}]},
        ],
        'default_case_id': 'default',
    }, parent_id=loop.id)
    done_node = make_node('code', 'Done', {
        'language': 'python',
        'source_code': "print('stop-now')",
    }, parent_id=loop.id)
    stray_node = make_node('code', 'Stray', {
        'language': 'python',
        'source_code': "print('should-not-run')",
    }, parent_id=loop.id)
    end = make_node('end', 'End')

    graph = build_graph(
        [start, loop, score, router, done_node, stray_node, end],
        [
            make_edge(start, loop),
            make_edge(score, router),
            make_edge(router, done_node, source_handle='done'),
            make_edge(loop, end, source_handle='loop_exit'),
        ],
        model='gpt-4o',
        api_key='test',
        base_url='https://example.invalid/v1',
        temperature=0.0,
    )

    result = graph.invoke({
        'messages': [],
        'input': {},
        'execution_steps': [],
        'node_outputs': {},
        'tool_results': {},
    })

    assert result['node_outputs'][str(router.id)]['matched_case'] == 'Done'
    assert result['node_outputs'][str(router.id)]['matched_case_key'] == 'done'
    assert result['node_outputs'][str(done_node.id)]['result'] == 'stop-now'
    assert str(stray_node.id) not in result['node_outputs']
