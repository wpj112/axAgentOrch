import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import Agent, Execution
from app.engine.builder import build_graph


async def run_agent(db: AsyncSession, agent_id: uuid.UUID, input_data: dict) -> Execution:
    stmt = select(Agent).where(Agent.id == agent_id).options(selectinload(Agent.nodes), selectinload(Agent.edges))
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()
    if not agent:
        raise ValueError(f"Agent not found: {agent_id}")

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
        graph = build_graph(agent.nodes, agent.edges)
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
