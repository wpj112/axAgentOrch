# AgentOrch 智能体编排系统 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an LLM agent orchestration system where users define agent workflows (nodes + edges) via a React UI, and each agent is exposed as a REST API endpoint for third-party invocation.

**Architecture:** Monolithic FastAPI backend serving both REST API and React SPA static files. LangGraph executes agent workflows using tools for HTTP calls, database queries, and code execution. PostgreSQL persists agent definitions and execution history. Docker Compose orchestrates backend, PostgreSQL, and Redis.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, LangGraph, LangChain-OpenAI, React 18, TypeScript, Vite, PostgreSQL 16, Redis 7

## Global Constraints

- No authentication (single-user MVP)
- No drag-and-drop (form-based editor only)
- Synchronous execution only (30s timeout)
- LLM API key via environment variable, never exposed to frontend
- Code execution via subprocess with timeout, no strict sandbox
- OpenAI-compatible LLM API (supports Ollama)

---

### Task 1: Project Scaffolding & Docker

**Files:**
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `backend/Dockerfile`
- Create: `backend/requirements.txt`
- Create: `frontend/Dockerfile`

**Interfaces:**
- Produces: `docker-compose up` starts 3 services: backend (port 8000), db (postgres:16), redis (redis:7-alpine)
- Produces: `.env.example` with all required environment variables

- [ ] **Step 1: Write .env.example**

```
# PostgreSQL
POSTGRES_USER=agentorch
POSTGRES_PASSWORD=agentorch_secret
POSTGRES_DB=agentorch
DATABASE_URL=postgresql+psycopg2://agentorch:agentorch_secret@db:5432/agentorch

# Redis
REDIS_URL=redis://redis:6379/0

# LLM (OpenAI-compatible)
OPENAI_API_KEY=sk-your-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o

# App
APP_HOST=0.0.0.0
APP_PORT=8000
```

- [ ] **Step 2: Write docker-compose.yml**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      OPENAI_BASE_URL: ${OPENAI_BASE_URL}
      LLM_MODEL: ${LLM_MODEL}
      APP_HOST: ${APP_HOST}
      APP_PORT: ${APP_PORT}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./backend/app:/app/app  # dev hot reload
      - ./frontend/dist:/app/frontend_dist

volumes:
  pgdata:
```

- [ ] **Step 3: Write backend/Dockerfile**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY alembic/ alembic/

CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

- [ ] **Step 4: Write backend/requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
sqlalchemy==2.0.35
alembic==1.13.2
psycopg2-binary==2.9.9
pydantic==2.9.0
pydantic-settings==2.5.0
langgraph==0.2.0
langchain-openai==0.2.0
langchain-core==0.3.0
httpx==0.27.0
redis==5.1.0
pytest==8.3.0
pytest-asyncio==0.24.0
aiosqlite==0.20.0
```

- [ ] **Step 5: Write frontend/Dockerfile** (will be used later, create now)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* .
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

- [ ] **Step 6: Verify** — `docker-compose config` validates without errors

```bash
docker-compose config
```

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml .env.example backend/Dockerfile backend/requirements.txt frontend/Dockerfile
git commit -m "feat: add Docker scaffolding with docker-compose, Dockerfiles, and env template"
```

---

### Task 2: Backend Core — Config, Database, Models, Alembic

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/database.py`
- Create: `backend/app/models.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/engine/__init__.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`

**Interfaces:**
- Produces: `Settings` class from `app.config` with all env vars
- Produces: `get_db()` async generator for SQLAlchemy sessions
- Produces: ORM models: `Agent`, `Node`, `Edge`, `Execution`
- Produces: Alembic migration system initialized

- [ ] **Step 1: Create package init files**

```bash
touch backend/app/__init__.py
touch backend/app/api/__init__.py
touch backend/app/services/__init__.py
touch backend/app/engine/__init__.py
```

- [ ] **Step 2: Write backend/app/config.py**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://agentorch:agentorch_secret@localhost:5432/agentorch"
    redis_url: str = "redis://localhost:6379/0"
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    frontend_dist_dir: str = "/app/frontend_dist"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
```

- [ ] **Step 3: Write backend/app/database.py**

```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url.replace("postgresql+psycopg2://", "postgresql+asyncpg://"), echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
```

Note: We use `asyncpg` at runtime. The `postgresql+psycopg2` in DATABASE_URL is for Alembic (sync). The backend auto-converts for async.

- [ ] **Step 4: Update backend/requirements.txt** — add `asyncpg`

Edit line: after `psycopg2-binary==2.9.9`, add `asyncpg==0.30.0`

- [ ] **Step 5: Write backend/app/models.py**

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Float, ForeignKey, Enum as SAEnum, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    nodes: Mapped[list["Node"]] = relationship("Node", back_populates="agent", cascade="all, delete-orphan")
    edges: Mapped[list["Edge"]] = relationship("Edge", back_populates="agent", cascade="all, delete-orphan")
    executions: Mapped[list["Execution"]] = relationship("Execution", back_populates="agent", cascade="all, delete-orphan")


class Node(Base):
    __tablename__ = "nodes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    position_x: Mapped[float] = mapped_column(Float, default=0)
    position_y: Mapped[float] = mapped_column(Float, default=0)

    agent: Mapped["Agent"] = relationship("Agent", back_populates="nodes")
    outgoing_edges: Mapped[list["Edge"]] = relationship(
        "Edge", foreign_keys="Edge.source_node_id", back_populates="source_node", cascade="all, delete-orphan"
    )
    incoming_edges: Mapped[list["Edge"]] = relationship(
        "Edge", foreign_keys="Edge.target_node_id", back_populates="target_node", cascade="all, delete-orphan"
    )


class Edge(Base):
    __tablename__ = "edges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    source_node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("nodes.id"), nullable=False)
    target_node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("nodes.id"), nullable=False)
    condition: Mapped[str | None] = mapped_column(Text, nullable=True)

    agent: Mapped["Agent"] = relationship("Agent", back_populates="edges")
    source_node: Mapped["Node"] = relationship("Node", foreign_keys=[source_node_id], back_populates="outgoing_edges")
    target_node: Mapped["Node"] = relationship("Node", foreign_keys=[target_node_id], back_populates="incoming_edges")


class Execution(Base):
    __tablename__ = "executions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    input: Mapped[dict] = mapped_column(JSONB, default=dict)
    output: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    agent: Mapped["Agent"] = relationship("Agent", back_populates="executions")
```

- [ ] **Step 6: Write backend/alembic.ini**

```ini
[alembic]
script_location = alembic
sqlalchemy.url = postgresql+psycopg2://agentorch:agentorch_secret@localhost:5432/agentorch

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

- [ ] **Step 7: Write backend/alembic/env.py**

```python
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

from app.database import Base
from app.models import Agent, Node, Edge, Execution

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(config.get_section(config.config_ini_section), prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 8: Write backend/alembic/script.py.mako** (Alembic generates migrations directory; we need the template)

Create directory `backend/alembic/versions/` and place a `.gitkeep`:
```bash
mkdir -p backend/alembic/versions
touch backend/alembic/versions/.gitkeep
```

- [ ] **Step 9: Initialize alembic and generate migration**

```bash
cd backend && alembic revision --autogenerate -m "init" && cd ..
```

Expected: creates `backend/alembic/versions/XXXX_init.py`

- [ ] **Step 10: Commit**

```bash
git add backend/app/__init__.py backend/app/config.py backend/app/database.py backend/app/models.py backend/app/api/__init__.py backend/app/services/__init__.py backend/app/engine/__init__.py backend/alembic.ini backend/alembic/ backend/requirements.txt
git commit -m "feat: add backend core — config, db, models, alembic migrations"
```

---

### Task 3: Backend — Pydantic Schemas

**Files:**
- Create: `backend/app/schemas.py`

**Interfaces:**
- Produces: `NodeCreate`, `NodeResponse`, `EdgeCreate`, `EdgeResponse`, `AgentCreate`, `AgentUpdate`, `AgentResponse`, `ExecutionResponse`, `RunRequest`, `RunResponse` Pydantic models
- Consumes: Node types from models.py: start, llm, http, db, code, end

- [ ] **Step 1: Write backend/app/schemas.py**

```python
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
```

- [ ] **Step 2: Verify** — Python imports without error

```bash
cd backend && python -c "from app.schemas import AgentCreate, AgentResponse, RunRequest, RunResponse; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas.py
git commit -m "feat: add Pydantic schemas for Agent, Node, Edge, Execution"
```

---

### Task 4: Backend — Engine Tools

**Files:**
- Create: `backend/app/engine/tools.py`

**Interfaces:**
- Produces: `http_call(url, method, headers, body) -> dict`
- Produces: `db_query(connection_string, query) -> dict`
- Produces: `run_code(language, source_code, context) -> dict`
- Each tool is decorated with `@tool` for LangChain compatibility

- [ ] **Step 1: Write backend/app/engine/tools.py**

```python
import json
import subprocess
import tempfile

import httpx
from langchain_core.tools import tool
from sqlalchemy import create_engine, text


@tool
def http_call(url: str, method: str = "GET", headers: str = "{}", body: str = "{}") -> str:
    """Make an HTTP request to an external API. Returns the response body as a string.
    
    Args:
        url: The URL to call
        method: HTTP method (GET, POST, PUT, DELETE)
        headers: JSON string of headers
        body: JSON string of request body (for POST/PUT)
    """
    try:
        parsed_headers = json.loads(headers) if isinstance(headers, str) else headers
        parsed_body = json.loads(body) if isinstance(body, str) else body
    except json.JSONDecodeError as e:
        return json.dumps({"error": f"Invalid JSON in headers or body: {str(e)}"})

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.request(
                method=method.upper(),
                url=url,
                headers=parsed_headers,
                json=parsed_body if method.upper() in ("POST", "PUT", "PATCH") else None,
            )
            response.raise_for_status()
            return json.dumps({"status_code": response.status_code, "body": response.text})
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"HTTP {e.response.status_code}: {e.response.text}"})
    except httpx.RequestError as e:
        return json.dumps({"error": f"Request failed: {str(e)}"})


@tool
def db_query(connection_string: str, query: str) -> str:
    """Execute a SQL query against a database. Returns results as a JSON string.
    Only SELECT queries are allowed for safety.

    Args:
        connection_string: Database connection string (e.g., postgresql://user:pass@host/db)
        query: SQL SELECT query to execute
    """
    query_stripped = query.strip().upper()
    if not query_stripped.startswith("SELECT"):
        return json.dumps({"error": "Only SELECT queries are allowed"})

    try:
        engine = create_engine(connection_string)
        with engine.connect() as conn:
            result = conn.execute(text(query))
            rows = [dict(row._mapping) for row in result]
            return json.dumps({"rows": rows, "count": len(rows)}, default=str)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def run_code(language: str, source_code: str, context: str = "{}") -> str:
    """Execute a code snippet in a subprocess. Supports Python and JavaScript.
    Returns the stdout output or error.

    Args:
        language: Programming language ('python' or 'javascript')
        source_code: The source code to execute
        context: JSON string of variables available to the code
    """
    try:
        ctx = json.loads(context) if isinstance(context, str) else context
    except json.JSONDecodeError:
        return json.dumps({"error": "Invalid JSON in context parameter"})

    with tempfile.NamedTemporaryFile(mode="w", suffix=".py" if language == "python" else ".js", delete=False) as f:
        if language == "python":
            f.write("import json\n")
            f.write(f"_context = {json.dumps(ctx)}\n")
            f.write(source_code)
        elif language == "javascript":
            f.write(f"const _context = {json.dumps(ctx)};\n")
            f.write(source_code)
        else:
            return json.dumps({"error": f"Unsupported language: {language}"})
        temp_path = f.name

    try:
        if language == "python":
            result = subprocess.run(["python", temp_path], capture_output=True, text=True, timeout=15)
        else:
            result = subprocess.run(["node", temp_path], capture_output=True, text=True, timeout=15)

        if result.returncode != 0:
            return json.dumps({"error": result.stderr or result.stdout})
        return json.dumps({"output": result.stdout.strip()})
    except subprocess.TimeoutExpired:
        return json.dumps({"error": "Code execution timed out (15s)"})
    except FileNotFoundError:
        return json.dumps({"error": f"Runtime not found for language: {language}"})
    except Exception as e:
        return json.dumps({"error": str(e)})
    finally:
        import os
        try:
            os.unlink(temp_path)
        except OSError:
            pass
```

- [ ] **Step 2: Verify** — import succeeds

```bash
cd backend && python -c "from app.engine.tools import http_call, db_query, run_code; print('Tools loaded OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/engine/tools.py
git commit -m "feat: add engine tools — http_call, db_query, run_code"
```

---

### Task 5: Backend — Engine Builder & Executor

**Files:**
- Create: `backend/app/engine/builder.py`
- Create: `backend/app/engine/executor.py`

**Interfaces:**
- Consumes: ORM models from `app.models`, tools from `app.engine.tools`
- Produces: `build_graph(agent: Agent) -> CompiledStateGraph` — builds LangGraph from DB definitions
- Produces: `run_agent(db, agent_id, input_data) -> Execution` — executes graph and records result

- [ ] **Step 1: Write backend/app/engine/builder.py**

```python
from typing import Annotated, TypedDict

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage

from app.config import settings
from app.engine.tools import http_call, db_query, run_code


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    input: dict


ALL_TOOLS = [http_call, db_query, run_code]


def build_graph(nodes: list, edges: list) -> StateGraph:
    """Build a LangGraph StateGraph from agent node and edge definitions.
    
    The graph structure is: start -> llm_node (with tools) -> END
    The LLM node has all tool nodes (http/db/code) bound as tools.
    """
    llm = ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
        temperature=0.7,
    )

    node_map = {str(n.id): n for n in nodes}
    start_node = next((n for n in nodes if n.type == "start"), None)
    llm_nodes = [n for n in nodes if n.type == "llm"]
    tool_nodes = [n for n in nodes if n.type in ("http", "db", "code")]

    available_tools = [t for t in ALL_TOOLS if any(tn.type in ("http", "db", "code") for tn in tool_nodes)]
    if not available_tools:
        available_tools = ALL_TOOLS

    llm_with_tools = llm.bind_tools(available_tools)
    tool_node = ToolNode(available_tools)

    graph = StateGraph(AgentState)

    def call_model(state: AgentState) -> dict:
        messages = state["messages"]
        if not messages:
            from langchain_core.messages import HumanMessage
            input_data = state.get("input", {})
            input_str = str(input_data) if input_data else "Process the request."
            messages = [HumanMessage(content=input_str)]
        response = llm_with_tools.invoke(messages)
        return {"messages": [response]}

    def route_tools(state: AgentState) -> str:
        messages = state["messages"]
        if not messages:
            return "end"
        last_message = messages[-1]
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "tools"
        return "end"

    graph.add_node("agent", call_model)
    graph.add_node("tools", tool_node)

    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", route_tools, {"tools": "tools", "end": END})
    graph.add_edge("tools", "agent")

    return graph.compile()
```

- [ ] **Step 2: Write backend/app/engine/executor.py**

```python
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
```

- [ ] **Step 3: Verify** — both files import

```bash
cd backend && python -c "from app.engine.builder import build_graph; from app.engine.executor import run_agent; print('Engine OK')"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/engine/builder.py backend/app/engine/executor.py
git commit -m "feat: add LangGraph builder and executor"
```

---

### Task 6: Backend — Agent Service Layer

**Files:**
- Create: `backend/app/services/agent_service.py`

**Interfaces:**
- Produces: `AgentService` class with: `create_agent`, `get_agent`, `list_agents`, `update_agent`, `delete_agent`, `run_agent`, `get_executions`
- Consumes: ORM models, schemas, engine executor, database session

- [ ] **Step 1: Write backend/app/services/agent_service.py**

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Agent, Node, Edge, Execution
from app.schemas import AgentCreate, AgentUpdate
from app.engine.executor import run_agent as engine_run_agent


class AgentService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_agent(self, data: AgentCreate) -> Agent:
        agent = Agent(name=data.name, description=data.description)
        self.db.add(agent)
        await self.db.flush()

        node_id_map: dict[str, uuid.UUID] = {}
        for i, node_data in enumerate(data.nodes):
            temp_id = f"temp_{i}"
            node = Node(
                agent_id=agent.id,
                type=node_data.type,
                label=node_data.label,
                config=node_data.config,
                position_x=node_data.position_x,
                position_y=node_data.position_y,
            )
            self.db.add(node)
            await self.db.flush()
            node_id_map[temp_id] = node.id

        for edge_data in data.edges:
            source_temp = f"temp_{next(i for i, n in enumerate(data.nodes) if n == edge_data.source_node_id)}" if isinstance(edge_data.source_node_id, int) else None
            edge = Edge(
                agent_id=agent.id,
                source_node_id=node_id_map[edge_data.source_node_id] if isinstance(edge_data.source_node_id, int) else edge_data.source_node_id,
                target_node_id=node_id_map[edge_data.target_node_id] if isinstance(edge_data.target_node_id, int) else edge_data.target_node_id,
                condition=edge_data.condition,
            )
            self.db.add(edge)

        await self.db.commit()
        return await self.get_agent(agent.id)

    async def get_agent(self, agent_id: uuid.UUID) -> Agent | None:
        stmt = (
            select(Agent)
            .where(Agent.id == agent_id)
            .options(selectinload(Agent.nodes), selectinload(Agent.edges))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_agents(self, search: str | None = None) -> list[Agent]:
        stmt = select(Agent).options(selectinload(Agent.nodes), selectinload(Agent.edges))
        if search:
            stmt = stmt.where(Agent.name.ilike(f"%{search}%"))
        stmt = stmt.order_by(Agent.updated_at.desc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_agent(self, agent_id: uuid.UUID, data: AgentUpdate) -> Agent | None:
        agent = await self.get_agent(agent_id)
        if not agent:
            return None

        if data.name is not None:
            agent.name = data.name
        if data.description is not None:
            agent.description = data.description

        if data.nodes is not None:
            # Remove old nodes and edges
            for edge in agent.edges:
                await self.db.delete(edge)
            for node in agent.nodes:
                await self.db.delete(node)
            await self.db.flush()

            for i, node_data in enumerate(data.nodes):
                node = Node(
                    agent_id=agent.id,
                    type=node_data.type,
                    label=node_data.label,
                    config=node_data.config,
                    position_x=node_data.position_x,
                    position_y=node_data.position_y,
                )
                self.db.add(node)
            await self.db.flush()

            if data.edges is not None:
                nodes_ordered = agent.nodes
                for edge_data in data.edges:
                    edge = Edge(
                        agent_id=agent.id,
                        source_node_id=edge_data.source_node_id,
                        target_node_id=edge_data.target_node_id,
                        condition=edge_data.condition,
                    )
                    self.db.add(edge)

        agent.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        return await self.get_agent(agent.id)

    async def delete_agent(self, agent_id: uuid.UUID) -> bool:
        agent = await self.get_agent(agent_id)
        if not agent:
            return False
        await self.db.delete(agent)
        await self.db.commit()
        return True

    async def run_agent(self, agent_id: uuid.UUID, input_data: dict) -> Execution:
        return await engine_run_agent(self.db, agent_id, input_data)

    async def get_executions(self, agent_id: uuid.UUID) -> list[Execution]:
        stmt = (
            select(Execution)
            .where(Execution.agent_id == agent_id)
            .order_by(Execution.started_at.desc())
            .limit(50)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_execution(self, execution_id: uuid.UUID) -> Execution | None:
        stmt = select(Execution).where(Execution.id == execution_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
```

- [ ] **Step 2: Verify** — import succeeds

```bash
cd backend && python -c "from app.services.agent_service import AgentService; print('Service OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/agent_service.py
git commit -m "feat: add agent service layer with CRUD and execution"
```

---

### Task 7: Backend — API Routes

**Files:**
- Create: `backend/app/api/agents.py`

**Interfaces:**
- Consumes: `AgentService`, Pydantic schemas
- Produces: FastAPI router with all endpoints from spec section 5

- [ ] **Step 1: Write backend/app/api/agents.py**

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException
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
async def run_agent(agent_id: uuid.UUID, data: RunRequest, db: AsyncSession = Depends(get_db)):
    service = AgentService(db)
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
```

- [ ] **Step 2: Verify** — import succeeds

```bash
cd backend && python -c "from app.api.agents import router; print('Routes OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/agents.py
git commit -m "feat: add API routes for agent CRUD and execution"
```

---

### Task 8: Backend — FastAPI Main Entry Point

**Files:**
- Create: `backend/app/main.py`

**Interfaces:**
- Consumes: All routers, config, database
- Produces: FastAPI application serving API at /api/* and React SPA at /*

- [ ] **Step 1: Write backend/app/main.py**

```python
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.api.agents import router as agents_router

app = FastAPI(title="AgentOrch", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_router)

# Serve React SPA
frontend_dir = Path(settings.frontend_dist_dir)
if frontend_dir.exists():
    app.mount("/assets", StaticFiles(directory=frontend_dir / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            from fastapi import Request
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        file_path = frontend_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dir / "index.html")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 2: Verify** — app starts without errors

```bash
cd backend && python -c "from app.main import app; print(f'App: {app.title}')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: add FastAPI main entry point with SPA serving"
```

---

### Task 9: Frontend — Project Scaffolding

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/nginx.conf`

**Interfaces:**
- Produces: Vite + React + TypeScript project that builds successfully
- Produces: React Router app with routes: /, /agents/:id, /agents/new

- [ ] **Step 1: Write frontend/package.json**

```json
{
  "name": "agentorch-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "axios": "^1.7.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Write frontend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write frontend/vite.config.ts**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  build: {
    outDir: 'dist',
  },
})
```

- [ ] **Step 4: Write frontend/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AgentOrch - 智能体编排</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write frontend/src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 6: Write frontend/src/App.tsx** (shell with routing placeholders)

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AgentList from './pages/AgentList'
import AgentEditor from './pages/AgentEditor'

function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>AgentOrch</h1>
        <Routes>
          <Route path="/" element={<AgentList />} />
          <Route path="/agents/new" element={<AgentEditor />} />
          <Route path="/agents/:id" element={<AgentEditor />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 7: Write frontend/nginx.conf**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

- [ ] **Step 8: Create placeholder pages** (will be replaced in next tasks)

```bash
mkdir -p frontend/src/pages frontend/src/api frontend/src/components
```

Create `frontend/src/pages/AgentList.tsx`:
```tsx
function AgentList() {
  return <div>Agent List (placeholder)</div>
}
export default AgentList
```

Create `frontend/src/pages/AgentEditor.tsx`:
```tsx
function AgentEditor() {
  return <div>Agent Editor (placeholder)</div>
}
export default AgentEditor
```

- [ ] **Step 9: Install dependencies and verify build**

```bash
cd frontend && npm install && npm run build && cd ..
```

Expected: build succeeds, produces `frontend/dist/`

- [ ] **Step 10: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold React + TypeScript + Vite frontend with routing"
```

---

### Task 10: Frontend — API Client

**Files:**
- Create: `frontend/src/api/client.ts`

**Interfaces:**
- Produces: `api` axios instance with baseURL auto-detection
- Produces: typed functions: `fetchAgents`, `fetchAgent`, `createAgent`, `updateAgent`, `deleteAgent`, `runAgent`

- [ ] **Step 1: Write frontend/src/api/client.ts**

```ts
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// ---- Types ----

export interface AgentNode {
  id?: string
  type: 'start' | 'llm' | 'http' | 'db' | 'code' | 'end'
  label: string
  config: Record<string, unknown>
  position_x?: number
  position_y?: number
}

export interface AgentEdge {
  id?: string
  source_node_id: string
  target_node_id: string
  condition?: string | null
}

export interface Agent {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  nodes: AgentNode[]
  edges: AgentEdge[]
}

export interface AgentListResponse {
  items: Agent[]
  total: number
}

export interface RunResponse {
  execution_id: string
  status: string
  output: Record<string, unknown> | null
  error_message: string | null
}

export interface Execution {
  id: string
  agent_id: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  status: string
  error_message: string | null
  started_at: string
  completed_at: string | null
}

// ---- API Functions ----

export async function fetchAgents(search?: string): Promise<AgentListResponse> {
  const params = search ? { search } : {}
  const { data } = await api.get<AgentListResponse>('/agents', { params })
  return data
}

export async function fetchAgent(id: string): Promise<Agent> {
  const { data } = await api.get<Agent>(`/agents/${id}`)
  return data
}

export async function createAgent(payload: {
  name: string
  description?: string | null
  nodes: Omit<AgentNode, 'id' | 'agent_id'>[]
  edges: Omit<AgentEdge, 'id' | 'agent_id'>[]
}): Promise<Agent> {
  const { data } = await api.post<Agent>('/agents', payload)
  return data
}

export async function updateAgent(
  id: string,
  payload: {
    name?: string
    description?: string | null
    nodes?: Omit<AgentNode, 'id' | 'agent_id'>[]
    edges?: Omit<AgentEdge, 'id' | 'agent_id'>[]
  }
): Promise<Agent> {
  const { data } = await api.put<Agent>(`/agents/${id}`, payload)
  return data
}

export async function deleteAgent(id: string): Promise<void> {
  await api.delete(`/agents/${id}`)
}

export async function runAgent(id: string, input: Record<string, unknown>): Promise<RunResponse> {
  const { data } = await api.post<RunResponse>(`/agents/${id}/run`, { input })
  return data
}

export async function fetchExecutions(agentId: string): Promise<Execution[]> {
  const { data } = await api.get<Execution[]>(`/agents/${agentId}/executions`)
  return data
}
```

- [ ] **Step 2: Verify** — TypeScript compiles

```bash
cd frontend && npx tsc --noEmit src/api/client.ts && cd ..
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat: add API client with typed functions for all endpoints"
```

---

### Task 11: Frontend — Agent List Page

**Files:**
- Modify: `frontend/src/pages/AgentList.tsx` (replace placeholder)
- Create: `frontend/src/components/AgentCard.tsx`

**Interfaces:**
- Consumes: `fetchAgents`, `deleteAgent` from API client
- Produces: AgentList page with search bar, agent cards, delete confirmation

- [ ] **Step 1: Write frontend/src/components/AgentCard.tsx**

```tsx
import type { Agent } from '../api/client'

interface AgentCardProps {
  agent: Agent
  onDelete: (id: string) => void
}

function AgentCard({ agent, onDelete }: AgentCardProps) {
  return (
    <div
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: '16px 20px',
        marginBottom: 12,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#fff',
      }}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{agent.name}</div>
        <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
          {agent.description || '暂无描述'} · {agent.nodes.length} 个节点
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <a
          href={`/agents/${agent.id}`}
          style={{
            padding: '6px 14px',
            fontSize: 13,
            background: '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            textDecoration: 'none',
          }}
        >
          编辑
        </a>
        <button
          onClick={() => onDelete(agent.id)}
          style={{
            padding: '6px 14px',
            fontSize: 13,
            background: '#d32f2f',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          删除
        </button>
      </div>
    </div>
  )
}

export default AgentCard
```

- [ ] **Step 2: Write frontend/src/pages/AgentList.tsx**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { fetchAgents, deleteAgent as apiDeleteAgent, type Agent } from '../api/client'
import AgentCard from '../components/AgentCard'

function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const loadAgents = useCallback(async () => {
    setLoading(true)
    const data = await fetchAgents(search || undefined)
    setAgents(data.items)
    setLoading(false)
  }, [search])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  const handleDelete = async (id: string) => {
    if (!window.confirm('确认删除此智能体？')) return
    await apiDeleteAgent(id)
    setAgents((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <input
          placeholder="搜索智能体..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '8px 14px',
            fontSize: 14,
            border: '1px solid #ccc',
            borderRadius: 6,
            width: 260,
          }}
        />
        <a
          href="/agents/new"
          style={{
            padding: '8px 20px',
            background: '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            textDecoration: 'none',
            fontSize: 14,
          }}
        >
          + 新建智能体
        </a>
      </div>

      {loading ? <div>加载中...</div> : null}

      {!loading && agents.length === 0 ? (
        <div style={{ color: '#888', marginTop: 40, textAlign: 'center' }}>
          暂无智能体，点击「+ 新建智能体」创建
        </div>
      ) : null}

      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} onDelete={handleDelete} />
      ))}
    </div>
  )
}

export default AgentList
```

- [ ] **Step 3: Verify** — build succeeds

```bash
cd frontend && npm run build && cd ..
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AgentList.tsx frontend/src/components/AgentCard.tsx
git commit -m "feat: add AgentList page with search, list, and delete"
```

---

### Task 12: Frontend — Agent Editor Page with All Components

**Files:**
- Modify: `frontend/src/pages/AgentEditor.tsx` (replace placeholder)
- Create: `frontend/src/components/AgentForm.tsx`
- Create: `frontend/src/components/NodePanel.tsx`
- Create: `frontend/src/components/NodeCard.tsx`
- Create: `frontend/src/components/NodeForm.tsx`
- Create: `frontend/src/components/RunDialog.tsx`

**Interfaces:**
- Consumes: API client functions
- Produces: Full agent editor with basic info form, node management panel, node configuration dialog, edge linking, and run dialog

- [ ] **Step 1: Write frontend/src/components/AgentForm.tsx**

```tsx
interface AgentFormProps {
  name: string
  description: string
  onChangeName: (v: string) => void
  onChangeDescription: (v: string) => void
}

function AgentForm({ name, description, onChangeName, onChangeDescription }: AgentFormProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>名称</label>
        <input
          value={name}
          onChange={(e) => onChangeName(e.target.value)}
          placeholder="智能体名称"
          style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>描述</label>
        <textarea
          value={description}
          onChange={(e) => onChangeDescription(e.target.value)}
          placeholder="智能体描述（可选）"
          rows={3}
          style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }}
        />
      </div>
    </div>
  )
}

export default AgentForm
```

- [ ] **Step 2: Write frontend/src/components/NodeCard.tsx**

```tsx
import type { AgentNode } from '../api/client'

const TYPE_LABELS: Record<string, string> = {
  start: '开始',
  llm: 'LLM',
  http: 'HTTP',
  db: '数据库',
  code: '代码',
  end: '结束',
}

const TYPE_COLORS: Record<string, string> = {
  start: '#4caf50',
  llm: '#9c27b0',
  http: '#2196f3',
  db: '#ff9800',
  code: '#795548',
  end: '#f44336',
}

interface NodeCardProps {
  node: AgentNode
  index: number
  nodes: AgentNode[]
  edges: { sourceIdx: number; targetIdx: number }[]
  onEdit: (idx: number) => void
  onDelete: (idx: number) => void
  onAddEdge: (sourceIdx: number, targetIdx: number) => void
  onRemoveEdge: (sourceIdx: number, targetIdx: number) => void
}

function NodeCard({ node, index, nodes, edges, onEdit, onDelete, onAddEdge, onRemoveEdge }: NodeCardProps) {
  const connectedTo = edges.filter((e) => e.sourceIdx === index).map((e) => e.targetIdx)

  const addConnection = () => {
    const target = window.prompt(
      `为「${node.label}」选择目标节点 (0-${nodes.length - 1}):\n${nodes.map((n, i) => `${i}: ${n.label} (${TYPE_LABELS[n.type] || n.type})`).join('\n')}`
    )
    if (target === null) return
    const targetIdx = parseInt(target, 10)
    if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= nodes.length || targetIdx === index) return
    onAddEdge(index, targetIdx)
  }

  return (
    <div
      style={{
        border: `2px solid ${TYPE_COLORS[node.type] || '#ccc'}`,
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 8,
        background: '#fafafa',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span
            style={{
              display: 'inline-block',
              background: TYPE_COLORS[node.type] || '#ccc',
              color: '#fff',
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: 11,
              marginRight: 8,
            }}
          >
            {TYPE_LABELS[node.type] || node.type}
          </span>
          <strong>{node.label}</strong>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => onEdit(index)}
            style={{ padding: '2px 10px', fontSize: 12, border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#fff' }}
          >
            编辑
          </button>
          <button
            onClick={() => addConnection()}
            style={{ padding: '2px 10px', fontSize: 12, border: '1px solid #1976d2', borderRadius: 4, cursor: 'pointer', background: '#e3f2fd', color: '#1976d2' }}
          >
            → 连线
          </button>
          <button
            onClick={() => onDelete(index)}
            style={{ padding: '2px 10px', fontSize: 12, border: '1px solid #d32f2f', borderRadius: 4, cursor: 'pointer', background: '#ffebee', color: '#d32f2f' }}
          >
            删除
          </button>
        </div>
      </div>
      {connectedTo.length > 0 && (
        <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>
          → {connectedTo.map((ti) => nodes[ti]?.label).join(', ')}
        </div>
      )}
    </div>
  )
}

export default NodeCard
```

- [ ] **Step 3: Write frontend/src/components/NodeForm.tsx**

```tsx
import { useState, useEffect } from 'react'
import type { AgentNode } from '../api/client'

interface NodeFormProps {
  initial?: AgentNode | null
  onSave: (node: AgentNode) => void
  onCancel: () => void
}

const TYPE_OPTIONS = ['start', 'llm', 'http', 'db', 'code', 'end']

function NodeForm({ initial, onSave, onCancel }: NodeFormProps) {
  const [type, setType] = useState(initial?.type || 'llm')
  const [label, setLabel] = useState(initial?.label || '')
  const [config, setConfig] = useState<Record<string, string>>({})

  useEffect(() => {
    if (initial?.config) {
      const flat: Record<string, string> = {}
      for (const [k, v] of Object.entries(initial.config)) {
        flat[k] = typeof v === 'string' ? v : JSON.stringify(v)
      }
      setConfig(flat)
    }
  }, [initial])

  const handleSave = () => {
    onSave({ type: type as AgentNode['type'], label, config: config as Record<string, unknown> })
  }

  const setConfigField = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div style={{ padding: 20, minWidth: 400 }}>
      <h3 style={{ marginTop: 0 }}>
        {initial ? '编辑节点' : '添加节点'}
      </h3>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>类型</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6 }}
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>标签</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="节点显示名称"
          style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' }}
        />
      </div>

      {type === 'llm' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Model</label>
            <input value={config.model || ''} onChange={(e) => setConfigField('model', e.target.value)} placeholder="gpt-4o" style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>System Prompt</label>
            <textarea value={config.system_prompt || ''} onChange={(e) => setConfigField('system_prompt', e.target.value)} rows={3} style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Temperature</label>
            <input value={config.temperature || '0.7'} onChange={(e) => setConfigField('temperature', e.target.value)} style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
        </>
      )}

      {type === 'http' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>URL</label>
            <input value={config.url || ''} onChange={(e) => setConfigField('url', e.target.value)} placeholder="https://api.example.com/data" style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Method</label>
            <select value={config.method || 'GET'} onChange={(e) => setConfigField('method', e.target.value)} style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6 }}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Headers (JSON)</label>
            <textarea value={config.headers || '{}'} onChange={(e) => setConfigField('headers', e.target.value)} rows={2} style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Body Template (JSON)</label>
            <textarea value={config.body || '{}'} onChange={(e) => setConfigField('body', e.target.value)} rows={2} style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
        </>
      )}

      {type === 'db' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Connection String</label>
            <input value={config.connection_string || ''} onChange={(e) => setConfigField('connection_string', e.target.value)} placeholder="postgresql://user:pass@host/db" style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Query</label>
            <textarea value={config.query || ''} onChange={(e) => setConfigField('query', e.target.value)} placeholder="SELECT * FROM table LIMIT 10" rows={3} style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
        </>
      )}

      {type === 'code' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Language</label>
            <select value={config.language || 'python'} onChange={(e) => setConfigField('language', e.target.value)} style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6 }}>
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Source Code</label>
            <textarea value={config.source_code || ''} onChange={(e) => setConfigField('source_code', e.target.value)} rows={6} style={{ width: '100%', padding: '6px 10px', fontFamily: 'monospace', fontSize: 13, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button onClick={onCancel} style={{ padding: '8px 20px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', background: '#fff' }}>
          取消
        </button>
        <button onClick={handleSave} style={{ padding: '8px 20px', fontSize: 14, border: 'none', borderRadius: 6, cursor: 'pointer', background: '#1976d2', color: '#fff' }}>
          确认
        </button>
      </div>
    </div>
  )
}

export default NodeForm
```

- [ ] **Step 4: Write frontend/src/components/NodePanel.tsx**

```tsx
import type { AgentNode } from '../api/client'
import NodeCard from './NodeCard'

interface EdgeDef {
  sourceIdx: number
  targetIdx: number
}

interface NodePanelProps {
  nodes: AgentNode[]
  edges: EdgeDef[]
  onNodesChange: (nodes: AgentNode[]) => void
  onEdgesChange: (edges: EdgeDef[]) => void
  onAddNode: () => void
  onEditNode: (idx: number) => void
}

function NodePanel({ nodes, edges, onNodesChange, onEdgesChange, onAddNode, onEditNode }: NodePanelProps) {
  const handleDelete = (idx: number) => {
    const newNodes = nodes.filter((_, i) => i !== idx)
    const newEdges = edges.filter((e) => e.sourceIdx !== idx && e.targetIdx !== idx)
      .map((e) => ({
        sourceIdx: e.sourceIdx > idx ? e.sourceIdx - 1 : e.sourceIdx,
        targetIdx: e.targetIdx > idx ? e.targetIdx - 1 : e.targetIdx,
      }))
    onNodesChange(newNodes)
    onEdgesChange(newEdges)
  }

  const handleAddEdge = (sourceIdx: number, targetIdx: number) => {
    if (edges.some((e) => e.sourceIdx === sourceIdx && e.targetIdx === targetIdx)) return
    onEdgesChange([...edges, { sourceIdx, targetIdx }])
  }

  const handleRemoveEdge = (sourceIdx: number, targetIdx: number) => {
    onEdgesChange(edges.filter((e) => !(e.sourceIdx === sourceIdx && e.targetIdx === targetIdx)))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>节点列表</h3>
        <button
          onClick={onAddNode}
          style={{
            padding: '6px 16px',
            fontSize: 13,
            background: '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          + 添加节点
        </button>
      </div>

      {nodes.length === 0 && (
        <div style={{ color: '#888', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
          暂无节点，点击「+ 添加节点」开始
        </div>
      )}

      {nodes.map((node, idx) => (
        <NodeCard
          key={idx}
          node={node}
          index={idx}
          nodes={nodes}
          edges={edges}
          onEdit={onEditNode}
          onDelete={handleDelete}
          onAddEdge={handleAddEdge}
          onRemoveEdge={handleRemoveEdge}
        />
      ))}
    </div>
  )
}

export default NodePanel
```

- [ ] **Step 5: Write frontend/src/components/RunDialog.tsx**

```tsx
import { useState } from 'react'
import type { RunResponse } from '../api/client'

interface RunDialogProps {
  onRun: (input: Record<string, unknown>) => Promise<RunResponse>
  onClose: () => void
}

function RunDialog({ onRun, onClose }: RunDialogProps) {
  const [inputText, setInputText] = useState('{\n  \n}')
  const [result, setResult] = useState<RunResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRun = async () => {
    setError(null)
    setRunning(true)
    try {
      const input = JSON.parse(inputText)
      const res = await onRun(input)
      setResult(res)
    } catch (e) {
      if (e instanceof SyntaxError) {
        setError('输入不是有效的 JSON')
      } else {
        setError(String(e))
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          width: 520,
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ marginTop: 0 }}>运行智能体</h3>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>输入 (JSON)</label>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={5}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontFamily: 'monospace',
              fontSize: 13,
              border: '1px solid #ccc',
              borderRadius: 6,
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
        </div>

        {error && (
          <div style={{ color: '#d32f2f', fontSize: 13, marginBottom: 10 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 20px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', background: '#fff' }}
          >
            关闭
          </button>
          <button
            onClick={handleRun}
            disabled={running}
            style={{ padding: '8px 20px', fontSize: 14, border: 'none', borderRadius: 6, cursor: running ? 'not-allowed' : 'pointer', background: '#1976d2', color: '#fff', opacity: running ? 0.6 : 1 }}
          >
            {running ? '执行中...' : '运行'}
          </button>
        </div>

        {result && (
          <div>
            <div
              style={{
                padding: '4px 12px',
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 600,
                display: 'inline-block',
                background: result.status === 'success' ? '#e8f5e9' : result.status === 'failed' ? '#ffebee' : '#fff3e0',
                color: result.status === 'success' ? '#2e7d32' : result.status === 'failed' ? '#c62828' : '#e65100',
              }}
            >
              {result.status}
            </div>
            {result.error_message && (
              <div style={{ marginTop: 8, color: '#c62828', fontSize: 13 }}>{result.error_message}</div>
            )}
            {result.output && (
              <pre style={{ marginTop: 8, padding: 10, background: '#f5f5f5', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto' }}>
                {JSON.stringify(result.output, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default RunDialog
```

- [ ] **Step 6: Write frontend/src/pages/AgentEditor.tsx**

```tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchAgent, createAgent, updateAgent, runAgent as apiRunAgent, type AgentNode, type AgentEdge } from '../api/client'
import AgentForm from '../components/AgentForm'
import NodePanel from '../components/NodePanel'
import NodeForm from '../components/NodeForm'
import RunDialog from '../components/RunDialog'

interface EdgeDef {
  sourceIdx: number
  targetIdx: number
}

function AgentEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [nodes, setNodes] = useState<AgentNode[]>([])
  const [edges, setEdges] = useState<EdgeDef[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [showNodeForm, setShowNodeForm] = useState(false)
  const [editingNodeIdx, setEditingNodeIdx] = useState<number | null>(null)
  const [showRunDialog, setShowRunDialog] = useState(false)

  useEffect(() => {
    if (!isNew && id) {
      fetchAgent(id).then((agent) => {
        setName(agent.name)
        setDescription(agent.description || '')
        const nodeList: AgentNode[] = agent.nodes.map((n) => ({
          type: n.type as AgentNode['type'],
          label: n.label,
          config: n.config as Record<string, unknown>,
          id: n.id,
          position_x: n.position_x,
          position_y: n.position_y,
        }))
        setNodes(nodeList)
        const edgeList: EdgeDef[] = agent.edges.map((e) => {
          const srcIdx = nodeList.findIndex((n) => n.id === e.source_node_id)
          const tgtIdx = nodeList.findIndex((n) => n.id === e.target_node_id)
          return { sourceIdx: srcIdx, targetIdx: tgtIdx }
        }).filter((e) => e.sourceIdx >= 0 && e.targetIdx >= 0)
        setEdges(edgeList)
        setLoading(false)
      })
    }
  }, [id, isNew])

  const handleSave = async () => {
    if (!name.trim()) {
      alert('请输入智能体名称')
      return
    }
    setSaving(true)

    const nodeList = nodes.map((n, i) => ({
      type: n.type,
      label: n.label,
      config: n.config,
      position_x: 0,
      position_y: i * 80,
    }))

    const edgeList: Omit<AgentEdge, 'id' | 'agent_id'>[] = edges.map((e) => ({
      source_node_id: '', // Will be resolved by backend
      target_node_id: '',
      sourceIdx: e.sourceIdx,
      targetIdx: e.targetIdx,
    }))

    try {
      if (isNew) {
        const agent = await createAgent({
          name: name.trim(),
          description: description.trim() || null,
          nodes: nodeList,
          edges: edges.map((e) => ({
            source_node_id: e.sourceIdx as unknown as string,
            target_node_id: e.targetIdx as unknown as string,
          })),
        })
        navigate(`/agents/${agent.id}`, { replace: true })
      } else if (id) {
        // On update, we need to send node indices, backend resolves to actual IDs
        const payload: {
          name: string
          description: string | null
          nodes: typeof nodeList
          edges: { source_node_id: number; target_node_id: number }[]
        } = {
          name: name.trim(),
          description: description.trim() || null,
          nodes: nodeList,
          edges: edges.map((e) => ({
            source_node_id: e.sourceIdx,
            target_node_id: e.targetIdx,
          })),
        }
        await updateAgent(id, payload as never)
      }
    } catch (err) {
      alert('保存失败: ' + String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleAddNode = (node: AgentNode) => {
    if (editingNodeIdx !== null) {
      const newNodes = [...nodes]
      newNodes[editingNodeIdx] = node
      setNodes(newNodes)
      setEditingNodeIdx(null)
    } else {
      setNodes([...nodes, node])
    }
    setShowNodeForm(false)
  }

  if (loading) return <div>加载中...</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <a href="/" style={{ color: '#1976d2', textDecoration: 'none', fontSize: 14 }}>← 返回列表</a>
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          {isNew ? '新建智能体' : `编辑: ${name}`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowRunDialog(true)}
            disabled={nodes.length === 0}
            style={{
              padding: '8px 20px',
              fontSize: 14,
              border: '1px solid #4caf50',
              borderRadius: 6,
              cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
              background: '#e8f5e9',
              color: '#2e7d32',
              opacity: nodes.length === 0 ? 0.5 : 1,
            }}
          >
            运行
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px',
              fontSize: 14,
              border: 'none',
              borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer',
              background: '#1976d2',
              color: '#fff',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <AgentForm
            name={name}
            description={description}
            onChangeName={setName}
            onChangeDescription={setDescription}
          />
        </div>

        <div>
          <NodePanel
            nodes={nodes}
            edges={edges}
            onNodesChange={setNodes}
            onEdgesChange={setEdges}
            onAddNode={() => { setEditingNodeIdx(null); setShowNodeForm(true) }}
            onEditNode={(idx) => { setEditingNodeIdx(idx); setShowNodeForm(true) }}
          />
        </div>
      </div>

      {showNodeForm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowNodeForm(false); setEditingNodeIdx(null) } }}
        >
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
            <NodeForm
              initial={editingNodeIdx !== null ? nodes[editingNodeIdx] : null}
              onSave={handleAddNode}
              onCancel={() => { setShowNodeForm(false); setEditingNodeIdx(null) }}
            />
          </div>
        </div>
      )}

      {showRunDialog && (
        <RunDialog
          onRun={async (input) => {
            if (!isNew && id) {
              return await apiRunAgent(id, input)
            }
            throw new Error('请先保存智能体再运行')
          }}
          onClose={() => setShowRunDialog(false)}
        />
      )}
    </div>
  )
}

export default AgentEditor
```

- [ ] **Step 7: Verify** — build succeeds

```bash
cd frontend && npm run build && cd ..
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/AgentEditor.tsx frontend/src/components/AgentForm.tsx frontend/src/components/NodePanel.tsx frontend/src/components/NodeCard.tsx frontend/src/components/NodeForm.tsx frontend/src/components/RunDialog.tsx
git commit -m "feat: add AgentEditor page with node management, configuration, and run dialog"
```

---

### Task 13: Fix Backend AgentService — Handle Index-Based Edge References in Create/Update

**Files:**
- Modify: `backend/app/services/agent_service.py`
- Modify: `backend/app/schemas.py`

**Interfaces:**
- Consumes: EdgeCreate with `source_node_id` and `target_node_id` as integers (node indices) during create/update
- Produces: Correct edge creation using node index → actual UUID resolution

During agent creation/update, the frontend sends edge `source_node_id` and `target_node_id` as integers (indices into the nodes array), not actual UUIDs. The backend needs to resolve these indices to the actual node UUIDs.

- [ ] **Step 1: Update AgentService.create_agent — fix edge index resolution**

Replace the `create_agent` method in `backend/app/services/agent_service.py`:

```python
async def create_agent(self, data: AgentCreate) -> Agent:
    agent = Agent(name=data.name, description=data.description)
    self.db.add(agent)
    await self.db.flush()

    created_nodes: list[Node] = []
    for node_data in data.nodes:
        node = Node(
            agent_id=agent.id,
            type=node_data.type,
            label=node_data.label,
            config=node_data.config,
            position_x=node_data.position_x,
            position_y=node_data.position_y,
        )
        self.db.add(node)
        await self.db.flush()
        created_nodes.append(node)

    for edge_data in data.edges:
        src_idx = int(edge_data.source_node_id) if not isinstance(edge_data.source_node_id, int) else edge_data.source_node_id
        tgt_idx = int(edge_data.target_node_id) if not isinstance(edge_data.target_node_id, int) else edge_data.target_node_id
        if 0 <= src_idx < len(created_nodes) and 0 <= tgt_idx < len(created_nodes):
            edge = Edge(
                agent_id=agent.id,
                source_node_id=created_nodes[src_idx].id,
                target_node_id=created_nodes[tgt_idx].id,
                condition=edge_data.condition,
            )
            self.db.add(edge)

    await self.db.commit()
    return await self.get_agent(agent.id)
```

- [ ] **Step 2: Update AgentService.update_agent — fix edge index resolution**

Replace the node/edge update logic inside `update_agent`:

```python
if data.nodes is not None:
    # Remove old nodes and edges
    for edge in agent.edges:
        await self.db.delete(edge)
    for node in agent.nodes:
        await self.db.delete(node)
    await self.db.flush()

    created_nodes: list[Node] = []
    for node_data in data.nodes:
        node = Node(
            agent_id=agent.id,
            type=node_data.type,
            label=node_data.label,
            config=node_data.config,
            position_x=node_data.position_x,
            position_y=node_data.position_y,
        )
        self.db.add(node)
        await self.db.flush()
        created_nodes.append(node)

    if data.edges is not None:
        for edge_data in data.edges:
            src_idx = int(edge_data.source_node_id) if not isinstance(edge_data.source_node_id, int) else edge_data.source_node_id
            tgt_idx = int(edge_data.target_node_id) if not isinstance(edge_data.target_node_id, int) else edge_data.target_node_id
            if 0 <= src_idx < len(created_nodes) and 0 <= tgt_idx < len(created_nodes):
                edge = Edge(
                    agent_id=agent.id,
                    source_node_id=created_nodes[src_idx].id,
                    target_node_id=created_nodes[tgt_idx].id,
                    condition=edge_data.condition,
                )
                self.db.add(edge)
```

- [ ] **Step 3: Fix schemas.py — allow int or UUID for edge IDs**

In `backend/app/schemas.py`, update EdgeCreate:

```python
class EdgeCreate(BaseModel):
    source_node_id: int | uuid.UUID
    target_node_id: int | uuid.UUID
    condition: str | None = None
```

- [ ] **Step 4: Verify** — import succeeds

```bash
cd backend && python -c "from app.services.agent_service import AgentService; from app.schemas import EdgeCreate; print('Fixed OK')"
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/agent_service.py backend/app/schemas.py
git commit -m "fix: resolve node index to UUID in edge creation and update"
```

---

### Task 14: Integration Test & Smoke Test

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_agents.py`

**Interfaces:**
- Consumes: Full FastAPI app
- Produces: pytest tests covering agent CRUD endpoints

- [ ] **Step 1: Write backend/tests/test_agents.py**

```python
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.main import app
from app.database import Base
from app.models import Agent, Node, Edge

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(autouse=True)
async def setup_db():
    from app.database import engine as orig_engine, async_session as orig_session
    test_engine = create_async_engine(TEST_DB_URL, echo=False)
    test_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    app.dependency_overrides[orig_session] = lambda: test_session()
    yield
    app.dependency_overrides.clear()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_create_agent(client):
    payload = {
        "name": "Test Agent",
        "description": "A test agent",
        "nodes": [
            {"type": "start", "label": "Start", "config": {}},
            {"type": "llm", "label": "LLM Node", "config": {"model": "gpt-4o", "system_prompt": "You are helpful."}},
            {"type": "end", "label": "End", "config": {}},
        ],
        "edges": [
            {"source_node_id": 0, "target_node_id": 1},
            {"source_node_id": 1, "target_node_id": 2},
        ],
    }
    resp = await client.post("/api/agents", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Agent"
    assert len(data["nodes"]) == 3
    assert len(data["edges"]) == 2
    return data["id"]


@pytest.mark.asyncio
async def test_list_agents(client):
    resp = await client.get("/api/agents")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_get_agent(client):
    agent_id = await test_create_agent(client)
    resp = await client.get(f"/api/agents/{agent_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Test Agent"


@pytest.mark.asyncio
async def test_update_agent(client):
    agent_id = await test_create_agent(client)
    payload = {
        "name": "Updated Agent",
        "description": "Updated description",
        "nodes": [
            {"type": "start", "label": "Start", "config": {}},
            {"type": "llm", "label": "LLM", "config": {}},
            {"type": "end", "label": "End", "config": {}},
        ],
        "edges": [
            {"source_node_id": 0, "target_node_id": 1},
            {"source_node_id": 1, "target_node_id": 2},
        ],
    }
    resp = await client.put(f"/api/agents/{agent_id}", json=payload)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Agent"


@pytest.mark.asyncio
async def test_delete_agent(client):
    agent_id = await test_create_agent(client)
    resp = await client.delete(f"/api/agents/{agent_id}")
    assert resp.status_code == 204

    resp = await client.get(f"/api/agents/{agent_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
```

- [ ] **Step 2: Already present** — test dependencies (`pytest-asyncio`, `aiosqlite`, `httpx`) are already included in `requirements.txt` from Task 1.

- [ ] **Step 3: Run tests**

```bash
cd backend && pip install -r requirements.txt && python -m pytest tests/ -v
```

Expected: all tests pass (note: `test_run_agent` is not included since it requires LLM API access)

- [ ] **Step 4: Commit**

```bash
git add backend/tests/ backend/requirements.txt
git commit -m "test: add integration tests for agent CRUD endpoints"
```

---

### Task 15: Final Integration — Docker Build & Verification

**Files:**
- Modify: `backend/requirements.txt` (add asyncpg if not already)
- Verify: `docker-compose build` succeeds
- Verify: `docker-compose up` starts all services

- [ ] **Step 1: Ensure asyncpg is in requirements.txt**

Add to `backend/requirements.txt` if missing:
```
asyncpg==0.30.0
sqlalchemy[asyncio]==2.0.35
```

- [ ] **Step 2: Build Docker images**

```bash
docker-compose build
```

- [ ] **Step 3: Start services**

```bash
docker-compose up -d
```

- [ ] **Step 4: Wait for healthy backend and test API**

```bash
sleep 10 && curl http://localhost:8000/api/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 5: Test full flow via curl**

```bash
# Create an agent
curl -s -X POST http://localhost:8000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "simple-echo",
    "description": "A simple echo agent",
    "nodes": [
      {"type": "start", "label": "Start", "config": {}},
      {"type": "llm", "label": "Echo LLM", "config": {"model": "gpt-4o", "system_prompt": "You are an echo bot. Repeat what the user says."}},
      {"type": "end", "label": "End", "config": {}}
    ],
    "edges": [
      {"source_node_id": 0, "target_node_id": 1},
      {"source_node_id": 1, "target_node_id": 2}
    ]
  }'

# List agents
curl -s http://localhost:8000/api/agents

# Open frontend
echo "Open http://localhost:8000 in browser"
```

- [ ] **Step 6: Run final build of frontend**

```bash
cd frontend && npm run build && cd ..
```

- [ ] **Step 7: Stop services**

```bash
docker-compose down
```

- [ ] **Step 8: Commit**

```bash
git commit -m "feat: complete integration — docker build passes, health check works"
```
