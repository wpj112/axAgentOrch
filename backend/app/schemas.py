import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class NodeConfig(BaseModel):
    model_config = {"extra": "allow"}


class NodeCreate(BaseModel):
    type: str = Field(..., description="start | llm | http | db | code | end | if_else | loop")
    label: str
    config: dict = Field(default_factory=dict)
    parent_id: uuid.UUID | None = None
    position_x: float = 0
    position_y: float = 0


class NodeResponse(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    type: str
    label: str
    config: dict
    parent_id: uuid.UUID | None = None
    position_x: float
    position_y: float

    model_config = {"from_attributes": True}


class EdgeCreate(BaseModel):
    source_node_id: int | uuid.UUID
    target_node_id: int | uuid.UUID
    source_handle: str | None = None
    condition: str | None = None


class EdgeResponse(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    source_node_id: uuid.UUID
    target_node_id: uuid.UUID
    source_handle: str | None = None
    condition: str | None = None

    model_config = {"from_attributes": True}


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    llm_model: str | None = None
    llm_temperature: str | None = None
    nodes: list[NodeCreate] = Field(default_factory=list, min_length=2)
    edges: list[EdgeCreate] = Field(default_factory=list, min_length=1)


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    llm_model: str | None = None
    llm_temperature: str | None = None
    nodes: list[NodeCreate] | None = None
    edges: list[EdgeCreate] | None = None


class AgentResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    llm_model: str | None = None
    llm_temperature: str | None = None
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


class SettingsRequest(BaseModel):
    model: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    temperature: str | None = None


class SettingsResponse(BaseModel):
    model: str = ""
    api_key: str = ""
    base_url: str = ""
    temperature: str = "0.7"
