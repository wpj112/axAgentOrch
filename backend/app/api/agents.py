import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import (
    AgentCreate, AgentUpdate, AgentResponse, AgentListResponse, AgentExport,
    RunRequest, RunResponse, ExecutionResponse,
)
from app.services.agent_service import AgentService

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.post("", response_model=AgentResponse, status_code=201)
async def create_agent(data: AgentCreate, db: AsyncSession = Depends(get_db)):
    service = AgentService(db)
    agent = await service.create_agent(data)
    return AgentResponse(
        id=agent.id,
        name=agent.name,
        description=agent.description,
        llm_model=agent.llm_model,
        llm_temperature=agent.llm_temperature,
        created_at=agent.created_at,
        updated_at=agent.updated_at,
        nodes=[{"id": n.id, "agent_id": n.agent_id, "type": n.type, "label": n.label, "config": n.config, "position_x": n.position_x, "position_y": n.position_y, "parent_id": n.parent_id} for n in agent.nodes],
        edges=[{"id": e.id, "agent_id": e.agent_id, "source_node_id": e.source_node_id, "target_node_id": e.target_node_id, "source_handle": e.source_handle, "condition": e.condition} for e in agent.edges],
    )


@router.get("", response_model=AgentListResponse)
async def list_agents(search: str | None = None, db: AsyncSession = Depends(get_db)):
    service = AgentService(db)
    agents = await service.list_agents(search)
    items = []
    for agent in agents:
        items.append(AgentResponse(
            id=agent.id,
            name=agent.name,
            description=agent.description,
            created_at=agent.created_at,
            updated_at=agent.updated_at,
            nodes=[{"id": n.id, "agent_id": n.agent_id, "type": n.type, "label": n.label, "config": n.config, "position_x": n.position_x, "position_y": n.position_y, "parent_id": n.parent_id} for n in agent.nodes],
            edges=[{"id": e.id, "agent_id": e.agent_id, "source_node_id": e.source_node_id, "target_node_id": e.target_node_id, "source_handle": e.source_handle, "condition": e.condition} for e in agent.edges],
        ))
    return AgentListResponse(items=items, total=len(items))


@router.post("/import", response_model=AgentResponse, status_code=201)
async def import_agent(data: AgentCreate, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select as sa_select
    from app.models import Agent

    service = AgentService(db)
    from datetime import datetime

    base_name = data.name.strip() or "Imported Agent"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    candidate = f"{base_name}_{timestamp}"
    suffix = 2
    while True:
        existing = await db.execute(sa_select(Agent.id).where(Agent.name == candidate))
        if existing.scalar_one_or_none() is None:
            break
        candidate = f"{base_name}_{timestamp}_{suffix}"
        suffix += 1
    agent = await service.create_agent(data.model_copy(update={"name": candidate}))
    return AgentResponse(
        id=agent.id,
        name=agent.name,
        description=agent.description,
        llm_model=agent.llm_model,
        llm_temperature=agent.llm_temperature,
        created_at=agent.created_at,
        updated_at=agent.updated_at,
        nodes=[{"id": n.id, "agent_id": n.agent_id, "type": n.type, "label": n.label, "config": n.config, "position_x": n.position_x, "position_y": n.position_y, "parent_id": n.parent_id} for n in agent.nodes],
        edges=[{"id": e.id, "agent_id": e.agent_id, "source_node_id": e.source_node_id, "target_node_id": e.target_node_id, "source_handle": e.source_handle, "condition": e.condition} for e in agent.edges],
    )


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return AgentResponse(
        id=agent.id,
        name=agent.name,
        description=agent.description,
        llm_model=agent.llm_model,
        llm_temperature=agent.llm_temperature,
        created_at=agent.created_at,
        updated_at=agent.updated_at,
        nodes=[{"id": n.id, "agent_id": n.agent_id, "type": n.type, "label": n.label, "config": n.config, "position_x": n.position_x, "position_y": n.position_y, "parent_id": n.parent_id} for n in agent.nodes],
        edges=[{"id": e.id, "agent_id": e.agent_id, "source_node_id": e.source_node_id, "target_node_id": e.target_node_id, "source_handle": e.source_handle, "condition": e.condition} for e in agent.edges],
    )


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: uuid.UUID, data: AgentUpdate, db: AsyncSession = Depends(get_db)):
    service = AgentService(db)
    agent = await service.update_agent(agent_id, data)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return AgentResponse(
        id=agent.id,
        name=agent.name,
        description=agent.description,
        llm_model=agent.llm_model,
        llm_temperature=agent.llm_temperature,
        created_at=agent.created_at,
        updated_at=agent.updated_at,
        nodes=[{"id": n.id, "agent_id": n.agent_id, "type": n.type, "label": n.label, "config": n.config, "position_x": n.position_x, "position_y": n.position_y, "parent_id": n.parent_id} for n in agent.nodes],
        edges=[{"id": e.id, "agent_id": e.agent_id, "source_node_id": e.source_node_id, "target_node_id": e.target_node_id, "source_handle": e.source_handle, "condition": e.condition} for e in agent.edges],
    )


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = AgentService(db)
    deleted = await service.delete_agent(agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent not found")


@router.post("/{agent_id}/run")
async def run_agent(
    agent_id: uuid.UUID,
    data: RunRequest,
    mode: str = Query(default="sync"),
    db: AsyncSession = Depends(get_db),
):
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if mode == "stream":
        db_settings = await _get_db_settings(db)
        model = agent.llm_model or db_settings.get("model")
        api_key = db_settings.get("api_key")
        base_url = db_settings.get("base_url")
        temp = float(agent.llm_temperature or db_settings.get("temperature") or "0.7")

        from app.engine.executor import run_agent_stream
        return StreamingResponse(
            run_agent_stream(agent_id, data.input, model, api_key, base_url, temp, agent.nodes, agent.edges),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    if mode == "async":
        from datetime import datetime, timezone
        from app.models import Execution
        from app.engine.async_task import run_agent_async

        execution = Execution(
            agent_id=agent_id,
            input=data.input,
            status="pending",
            started_at=datetime.now(timezone.utc),
        )
        db.add(execution)
        await db.commit()
        await db.refresh(execution)

        task = run_agent_async.delay(str(agent_id), data.input, str(execution.id))
        return RunResponse(
            execution_id=execution.id,
            status="pending",
            output={"task_id": task.id},
            error_message=None,
        )

    execution = await service.run_agent(agent_id, data.input)
    return RunResponse(
        execution_id=execution.id,
        status=execution.status,
        output=execution.output,
        error_message=execution.error_message,
    )


async def _get_db_settings(db: AsyncSession) -> dict[str, str]:
    from app.models import GlobalSetting
    from sqlalchemy import select as sa_select
    result = await db.execute(sa_select(GlobalSetting))
    return {r.key: r.value for r in result.scalars().all()}


@router.get("/{agent_id}/executions", response_model=list[ExecutionResponse])
async def list_executions(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = AgentService(db)
    executions = await service.get_executions(agent_id)
    return [ExecutionResponse(
        id=e.id, agent_id=e.agent_id, input=e.input, output=e.output,
        status=e.status, error_message=e.error_message,
        started_at=e.started_at, completed_at=e.completed_at,
    ) for e in executions]


@router.get("/executions/{execution_id}", response_model=ExecutionResponse)
async def get_execution(execution_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = AgentService(db)
    execution = await service.get_execution(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return ExecutionResponse(
        id=execution.id, agent_id=execution.agent_id, input=execution.input, output=execution.output,
        status=execution.status, error_message=execution.error_message,
        started_at=execution.started_at, completed_at=execution.completed_at,
    )


@router.get("/{agent_id}/export", response_model=AgentExport)
async def export_agent(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    nodes_list = list(agent.nodes)
    node_id_to_idx = {str(n.id): idx for idx, n in enumerate(nodes_list)}
    return AgentExport(
        name=agent.name,
        description=agent.description,
        llm_model=agent.llm_model,
        llm_temperature=agent.llm_temperature,
        nodes=[{
            "id": str(n.id), "type": n.type, "label": n.label, "config": n.config,
            "parent_id": node_id_to_idx.get(str(n.parent_id)) if n.parent_id else None,
            "position_x": n.position_x, "position_y": n.position_y,
        } for n in nodes_list],
        edges=[{
            "source_node_id": node_id_to_idx.get(str(e.source_node_id), 0),
            "target_node_id": node_id_to_idx.get(str(e.target_node_id), 0),
            "source_handle": e.source_handle, "condition": e.condition,
        } for e in agent.edges],
    )
