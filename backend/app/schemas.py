import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class NodeConfig(BaseModel):
    model_config = {"extra": "allow"}


class NodeCreate(BaseModel):
    type: str = Field(..., description="start | llm | http | db | code | end")
    label: str
    config: dict = Field(default_factory=dict)
    position_x: float = 0
    position_y: float = 0


class NodeResponse(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    type: str
    label: str
    config: dict
    position_x: float
    position_y: float

    model_config = {"from_attributes": True}


class EdgeCreate(BaseModel):
    source_node_id: uuid.UUID
    target_node_id: uuid.UUID
    condition: str | None = None


class EdgeResponse(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    source_node_id: uuid.UUID
    target_node_id: uuid.UUID
    condition: str | None = None

    model_config = {"from_attributes": True}


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    nodes: list[NodeCreate] = Field(default_factory=list, min_length=2)
    edges: list[EdgeCreate] = Field(default_factory=list, min_length=1)


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    nodes: list[NodeCreate] | None = None
    edges: list[EdgeCreate] | None = None


class AgentResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    nodes: list[NodeResponse] = []
    edges: list[EdgeResponse] = []

    model_config = {"from_attributes": True}


class ExecutionResponse(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    input: dict
    output: dict | None
    status: str
    error_message: str | None
    started_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class RunRequest(BaseModel):
    input: dict = Field(..., description="Input data for the agent execution")


class RunResponse(BaseModel):
    execution_id: uuid.UUID
    status: str
    output: dict | None
    error_message: str | None


class AgentListResponse(BaseModel):
    items: list[AgentResponse]
    total: int
