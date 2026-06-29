import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import (
    AgentCreate, AgentUpdate, AgentResponse, AgentListResponse,
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
        nodes=[{"id": n.id, "agent_id": n.agent_id, "type": n.type, "label": n.label, "config": n.config, "position_x": n.position_x, "position_y": n.position_y} for n in agent.nodes],
        edges=[{"id": e.id, "agent_id": e.agent_id, "source_node_id": e.source_node_id, "target_node_id": e.target_node_id, "condition": e.condition} for e in agent.edges],
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
            nodes=[{"id": n.id, "agent_id": n.agent_id, "type": n.type, "label": n.label, "config": n.config, "position_x": n.position_x, "position_y": n.position_y} for n in agent.nodes],
            edges=[{"id": e.id, "agent_id": e.agent_id, "source_node_id": e.source_node_id, "target_node_id": e.target_node_id, "condition": e.condition} for e in agent.edges],
        ))
    return AgentListResponse(items=items, total=len(items))


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
        nodes=[{"id": n.id, "agent_id": n.agent_id, "type": n.type, "label": n.label, "config": n.config, "position_x": n.position_x, "position_y": n.position_y} for n in agent.nodes],
        edges=[{"id": e.id, "agent_id": e.agent_id, "source_node_id": e.source_node_id, "target_node_id": e.target_node_id, "condition": e.condition} for e in agent.edges],
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
        nodes=[{"id": n.id, "agent_id": n.agent_id, "type": n.type, "label": n.label, "config": n.config, "position_x": n.position_x, "position_y": n.position_y} for n in agent.nodes],
        edges=[{"id": e.id, "agent_id": e.agent_id, "source_node_id": e.source_node_id, "target_node_id": e.target_node_id, "condition": e.condition} for e in agent.edges],
    )


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = AgentService(db)
    deleted = await service.delete_agent(agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent not found")


@router.post("/{agent_id}/run", response_model=RunResponse)
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
