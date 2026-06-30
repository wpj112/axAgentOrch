import uuid
import json
from datetime import datetime, timezone
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import Agent, Execution, GlobalSetting
from app.engine.builder import build_graph


def _extract_result_text(state: dict) -> str:
    messages = state.get('messages', []) or []
    for message in reversed(messages):
        content = getattr(message, 'content', None)
        if isinstance(content, str) and content.strip():
            return content.strip()
        if content not in (None, '', []):
            return str(content)

    node_outputs = state.get('node_outputs', {}) or {}
    for value in reversed(list(node_outputs.values())):
        if isinstance(value, dict):
            text_value = value.get('text')
            if isinstance(text_value, str) and text_value.strip():
                return text_value.strip()
            result_value = value.get('result')
            if isinstance(result_value, str) and result_value.strip():
                return result_value.strip()
            if result_value not in (None, '', [], {}):
                return json.dumps(result_value, ensure_ascii=False)
            if value == {'status': 'ok'}:
                continue
            if set(value.keys()) == {'iterations'}:
                continue
            if value:
                return json.dumps(value, ensure_ascii=False)
        elif isinstance(value, str) and value.strip():
            return value.strip()
        elif value not in (None, '', [], {}):
            return json.dumps(value, ensure_ascii=False)

    return ''


async def _get_db_settings(db: AsyncSession) -> dict[str, str]:
    result = await db.execute(select(GlobalSetting))
    return {r.key: r.value for r in result.scalars().all()}


async def run_agent(db: AsyncSession, agent_id: uuid.UUID, input_data: dict) -> Execution:
    stmt = select(Agent).where(Agent.id == agent_id).options(selectinload(Agent.nodes), selectinload(Agent.edges))
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()
    if not agent:
        raise ValueError(f"Agent not found: {agent_id}")

    db_settings = await _get_db_settings(db)

    model = agent.llm_model or db_settings.get("model")
    api_key = db_settings.get("api_key")
    base_url = db_settings.get("base_url")
    temp = float(agent.llm_temperature or db_settings.get("temperature") or "0.7")

    execution = Execution(
        agent_id=agent_id,
        input=input_data,
        status="running",
        started_at=datetime.now(timezone.utc),
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    try:
        graph = build_graph(agent.nodes, agent.edges, model=model, api_key=api_key, base_url=base_url, temperature=temp)
        result = graph.invoke({"messages": [], "input": input_data, "execution_steps": [], "node_outputs": {}, "tool_results": {}})

        output_content = _extract_result_text(result)
        execution_steps = result.get("execution_steps", [])

        execution.status = "success"
        execution.output = {"result": output_content, "execution_steps": execution_steps}
        execution.completed_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(execution)

    except Exception as e:
        execution.status = "failed"
        execution.error_message = str(e)
        execution.completed_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(execution)

    return execution


async def run_agent_stream(
    agent_id: uuid.UUID,
    input_data: dict,
    model: str | None,
    api_key: str | None,
    base_url: str | None,
    temperature: float,
    nodes: list,
    edges: list,
) -> AsyncGenerator[str, None]:
    """Stream per-node execution steps via SSE."""
    try:
        graph = build_graph(nodes, edges, model=model, api_key=api_key, base_url=base_url, temperature=temperature)

        last_steps: list[dict] = []
        final_result = ""
        async for event in graph.astream({"messages": [], "input": input_data, "execution_steps": [], "node_outputs": {}, "tool_results": {}}):
            for node_id, state in event.items():
                steps = state.get("execution_steps", [])
                candidate_result = _extract_result_text(state)
                if candidate_result:
                    final_result = candidate_result
                if steps != last_steps:
                    new_steps = [s for s in steps if s not in last_steps]
                    last_steps = steps
                    for step in new_steps:
                        yield f"data: {json.dumps({'event': 'step', **step}, ensure_ascii=False)}\n\n"

        yield f"data: {json.dumps({'event': 'done', 'status': 'success', 'steps': last_steps, 'result': final_result}, ensure_ascii=False)}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"
