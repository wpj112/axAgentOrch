import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Agent, Node, Edge, Execution, GlobalSetting
from app.schemas import AgentCreate, AgentUpdate
from app.engine.executor import run_agent as engine_run_agent


class AgentService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_agent(self, data: AgentCreate) -> Agent:
        agent = Agent(
            name=data.name,
            description=data.description,
            llm_model=data.llm_model,
            llm_temperature=data.llm_temperature,
        )
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
        if data.llm_model is not None:
            agent.llm_model = data.llm_model
        if data.llm_temperature is not None:
            agent.llm_temperature = data.llm_temperature

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
