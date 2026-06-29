import uuid
from datetime import datetime, timezone

from app.celery_app import celery_app
from app.engine.builder import build_graph
from app.models import Agent, Execution, GlobalSetting
from sqlalchemy import select
from sqlalchemy.orm import selectinload


@celery_app.task(bind=True, max_retries=0)
def run_agent_async(self, agent_id_str: str, input_data: dict, exec_id_str: str):
    from app.celery_app import _session_factory

    agent_id = uuid.UUID(agent_id_str)
    exec_id = uuid.UUID(exec_id_str)

    async def _run():
        async with _session_factory() as db:
            stmt = select(Agent).where(Agent.id == agent_id).options(selectinload(Agent.nodes), selectinload(Agent.edges))
            result = await db.execute(stmt)
            agent = result.scalar_one_or_none()
            if not agent:
                return

            settings_result = await db.execute(select(GlobalSetting))
            db_settings = {r.key: r.value for r in settings_result.scalars().all()}

            model = agent.llm_model or db_settings.get("model")
            api_key = db_settings.get("api_key")
            base_url = db_settings.get("base_url")
            temp = float(agent.llm_temperature or db_settings.get("temperature") or "0.7")

            execution = await db.get(Execution, exec_id)
            if not execution:
                return
            execution.status = "running"
            await db.commit()

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

            except Exception as e:
                execution.status = "failed"
                execution.error_message = str(e)
                execution.completed_at = datetime.now(timezone.utc)
                await db.commit()

    import asyncio
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_run())
    finally:
        loop.close()
