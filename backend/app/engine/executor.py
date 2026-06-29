import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import Agent, Execution, GlobalSetting
from app.engine.builder import build_graph


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
        result = graph.invoke({"messages": [], "input": input_data})

        final_messages = result.get("messages", [])
        last_message = final_messages[-1] if final_messages else None
        output_content = last_message.content if last_message and hasattr(last_message, "content") else str(result)

        execution.status = "success"
        execution.output = {"result": output_content}
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
