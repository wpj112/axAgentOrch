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

    def _resolve_node_ref(
        self,
        ref: int | str | uuid.UUID | None,
        created_nodes: list[Node],
        legacy_index_by_id: dict[str, int] | None = None,
    ) -> uuid.UUID | None:
        if ref is None:
            return None

        idx: int | None = None
        if isinstance(ref, int):
            idx = ref
        else:
            ref_str = str(ref)
            if legacy_index_by_id and ref_str in legacy_index_by_id:
                idx = legacy_index_by_id[ref_str]
            else:
                try:
                    idx = int(ref_str)
                except (TypeError, ValueError):
                    idx = None

        if idx is None or not (0 <= idx < len(created_nodes)):
            return None
        return created_nodes[idx].id

    def _remap_route_ref(
        self,
        ref,
        created_nodes: list[Node],
        legacy_index_by_id: dict[str, int] | None = None,
    ):
        resolved = self._resolve_node_ref(ref, created_nodes, legacy_index_by_id)
        return str(resolved) if resolved is not None else ref

    def _remap_selector(
        self,
        selector,
        created_nodes: list[Node],
        legacy_index_by_id: dict[str, int] | None = None,
    ):
        if not isinstance(selector, list) or not selector:
            return selector

        resolved = self._resolve_node_ref(selector[0], created_nodes, legacy_index_by_id)
        if resolved is None:
            return selector
        return [str(resolved), *selector[1:]]

    def _remap_node_config_refs(
        self,
        config: dict | None,
        created_nodes: list[Node],
        legacy_index_by_id: dict[str, int] | None = None,
    ) -> dict:
        if not isinstance(config, dict):
            return config or {}

        remapped = dict(config)

        for key in ('start_node_id', 'end_node_id'):
            if key in remapped:
                resolved = self._resolve_node_ref(remapped.get(key), created_nodes, legacy_index_by_id)
                if resolved is not None:
                    remapped[key] = str(resolved)

        for key in ('condition', 'end_condition'):
            condition = remapped.get(key)
            if isinstance(condition, dict) and 'variable_selector' in condition:
                next_condition = dict(condition)
                next_condition['variable_selector'] = self._remap_selector(
                    condition.get('variable_selector'),
                    created_nodes,
                    legacy_index_by_id,
                )
                remapped[key] = next_condition

        cases = remapped.get('cases')
        if isinstance(cases, list):
            next_cases = []
            for case in cases:
                if not isinstance(case, dict):
                    next_cases.append(case)
                    continue
                next_case = dict(case)
                if 'case_id' in next_case:
                    next_case['case_id'] = self._remap_route_ref(next_case.get('case_id'), created_nodes, legacy_index_by_id)
                conditions = next_case.get('conditions')
                if isinstance(conditions, list):
                    next_conditions = []
                    for cond in conditions:
                        if isinstance(cond, dict) and 'variable_selector' in cond:
                            next_cond = dict(cond)
                            next_cond['variable_selector'] = self._remap_selector(
                                cond.get('variable_selector'),
                                created_nodes,
                                legacy_index_by_id,
                            )
                            next_conditions.append(next_cond)
                        else:
                            next_conditions.append(cond)
                    next_case['conditions'] = next_conditions
                next_cases.append(next_case)
            remapped['cases'] = next_cases

        branches = remapped.get('branches')
        if isinstance(branches, list):
            next_branches = []
            for branch in branches:
                if isinstance(branch, dict) and 'case_id' in branch:
                    next_branch = dict(branch)
                    next_branch['case_id'] = self._remap_route_ref(branch.get('case_id'), created_nodes, legacy_index_by_id)
                    next_branches.append(next_branch)
                else:
                    next_branches.append(branch)
            remapped['branches'] = next_branches

        if 'default_case_id' in remapped:
            remapped['default_case_id'] = self._remap_route_ref(remapped.get('default_case_id'), created_nodes, legacy_index_by_id)

        return remapped

    async def _create_nodes(
        self,
        agent_id: uuid.UUID,
        nodes_data: list,
        ref_index_by_id: dict[str, int] | None = None,
    ) -> list[Node]:
        created_nodes: list[Node] = []
        pending_parents: list[int | uuid.UUID | None] = []

        for node_data in nodes_data:
            node = Node(
                agent_id=agent_id,
                type=node_data.type,
                label=node_data.label,
                config=node_data.config,
                parent_id=None,
                position_x=node_data.position_x,
                position_y=node_data.position_y,
            )
            self.db.add(node)
            await self.db.flush()
            created_nodes.append(node)
            pending_parents.append(node_data.parent_id)

        for node, parent_ref in zip(created_nodes, pending_parents):
            node.parent_id = self._resolve_node_ref(parent_ref, created_nodes, ref_index_by_id)
            node.config = self._remap_node_config_refs(node.config, created_nodes, ref_index_by_id)

        await self.db.flush()
        return created_nodes

    def _create_edges(
        self,
        agent_id: uuid.UUID,
        edges_data: list,
        created_nodes: list[Node],
        ref_index_by_id: dict[str, int] | None = None,
    ) -> None:
        for edge_data in edges_data:
            source_node_id = self._resolve_node_ref(edge_data.source_node_id, created_nodes, ref_index_by_id)
            target_node_id = self._resolve_node_ref(edge_data.target_node_id, created_nodes, ref_index_by_id)
            if source_node_id is None or target_node_id is None:
                continue

            source_handle = self._remap_route_ref(edge_data.source_handle, created_nodes, ref_index_by_id) if edge_data.source_handle else edge_data.source_handle
            condition = self._remap_route_ref(edge_data.condition, created_nodes, ref_index_by_id) if edge_data.condition else edge_data.condition

            edge = Edge(
                agent_id=agent_id,
                source_node_id=source_node_id,
                target_node_id=target_node_id,
                source_handle=source_handle,
                condition=condition,
            )
            self.db.add(edge)

    async def create_agent(self, data: AgentCreate) -> Agent:
        agent = Agent(
            name=data.name,
            description=data.description,
            llm_model=data.llm_model,
            llm_temperature=data.llm_temperature,
        )
        self.db.add(agent)
        await self.db.flush()

        submitted_index_by_id = {str(node.id): idx for idx, node in enumerate(data.nodes) if getattr(node, 'id', None) is not None}
        created_nodes = await self._create_nodes(agent.id, data.nodes, submitted_index_by_id)
        self._create_edges(agent.id, data.edges, created_nodes, submitted_index_by_id)

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
            submitted_index_by_id = {str(node.id): idx for idx, node in enumerate(data.nodes) if getattr(node, 'id', None) is not None}
            legacy_index_by_id = {str(node.id): idx for idx, node in enumerate(agent.nodes)}
            ref_index_by_id = {**legacy_index_by_id, **submitted_index_by_id}

            for edge in agent.edges:
                await self.db.delete(edge)

            # Delete child nodes before loop/container parents to avoid FK violations
            existing_nodes = sorted(agent.nodes, key=lambda node: (node.parent_id is None, str(node.id)))
            for node in existing_nodes:
                await self.db.delete(node)
            await self.db.flush()

            created_nodes = await self._create_nodes(agent.id, data.nodes, ref_index_by_id)

            if data.edges is not None:
                self._create_edges(agent.id, data.edges, created_nodes, ref_index_by_id)

        agent.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        self.db.expire(agent, ['nodes', 'edges'])
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
