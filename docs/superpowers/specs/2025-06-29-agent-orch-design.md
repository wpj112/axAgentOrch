# AgentOrch 智能体编排系统 — 设计文档

> 创建日期: 2025-06-29
> 版本: v0.1 (MVP Phase 1)

---

## 1. 项目概述

AgentOrch 是一个 LLM 智能体编排系统，允许用户通过可视化（当前为表单式，后续升级为拖拽）方式定义智能体工作流，并将每个智能体暴露为 REST API 供第三方调用。

### 1.1 核心能力（Phase 1 MVP）

- 智能体 CRUD 管理（列表 + 创建/编辑）
- 三种节点类型：LLM 节点、HTTP 调用节点、数据库查询节点、代码执行节点
- 节点之间通过连线组成 DAG 工作流
- 每个智能体自动生成 API 端点，支持同步调用
- Docker Compose 一键部署

### 1.2 后续阶段

- React Flow 拖拽式可视化编排
- 更多节点类型
- 用户认证与多租户
- 异步执行 + 结果轮询
- 执行历史与日志详情

---

## 2. 技术选型

| 层级       | 技术                                        | 说明                            |
| ---------- | ------------------------------------------- | ------------------------------- |
| 前端       | React 18 + TypeScript + Vite               | SPA，为后续 React Flow 做准备   |
| 后端       | Python 3.12 + FastAPI                       | 异步 API，自动 OpenAPI 文档     |
| 执行引擎   | LangGraph                                    | LLM Agent 状态图编排            |
| ORM        | SQLAlchemy 2.0 + Alembic                    | 数据库迁移                      |
| 数据库     | PostgreSQL 16                               | 持久化 Agent 定义和执行历史     |
| 缓存/队列  | Redis 7                                     | MVP 预留，后续异步执行用        |
| 部署       | Docker Compose (3 容器: backend + PG + Redis)|                                |

---

## 3. 架构设计

### 3.1 整体架构图

```
                     ┌──────────────────┐
                     │   第三方调用者     │
                     └────────┬─────────┘
                              │ HTTP POST
                              ▼
┌─────────────────────────────────────────┐
│              backend (FastAPI)           │
│  ┌──────────────────────────────────┐   │
│  │  REST API Layer                  │   │
│  │  /api/agents           CRUD     │   │
│  │  /api/agents/:id/run  执行      │   │
│  └──────────┬───────────────────────┘   │
│             │                            │
│  ┌──────────▼───────────────────────┐   │
│  │  Agent Service (业务逻辑)         │   │
│  │  - 创建/更新/查询 Agent 定义     │   │
│  │  - 调用 Engine 执行              │   │
│  └──────────┬───────────────────────┘   │
│             │                            │
│  ┌──────────▼───────────────────────┐   │
│  │  LangGraph Engine                │   │
│  │  - 从 DB 加载 → 构建 StateGraph  │   │
│  │  - graph.invoke(input)           │   │
│  │  - 工具调用层: http/db/code      │   │
│  └──────────────────────────────────┘   │
├─────────────────────────────────────────┤
│  静态文件: React SPA (Vite build)        │
│  / → React 前端页面                     │
└─────────────────────────────────────────┘
              │
    ┌─────────┼──────────┐
    ▼         ▼          ▼
┌──────┐ ┌──────┐  ┌──────┐
│  PG  │ │Redis │  │ LLM  │
└──────┘ └──────┘  │(外部)│
                   └──────┘
```

### 3.2 容器拓扑

```
┌─────────────────────────────────────────────┐
│              Docker Network                  │
│  ┌────────────┐  ┌──────────┐  ┌─────────┐  │
│  │  backend    │  │ postgres  │  │  redis   │  │
│  │  :8000      │  │ :5432     │  │ :6379    │  │
│  └────────────┘  └──────────┘  └─────────┘  │
│       ▲                                     │
│  host:8000                                  │
└──────┴──────────────────────────────────────┘
```

---

## 4. 数据模型

### 4.1 数据库表结构

```
Agent (智能体定义)
├── id: UUID (PK)
├── name: String (唯一)
├── description: Text
├── created_at: DateTime
├── updated_at: DateTime

Node (节点)
├── id: UUID (PK)
├── agent_id: UUID (FK → Agent)
├── type: Enum (start | llm | http | db | code | end)
├── label: String
├── config: JSONB
│   ├── llm:  { model, system_prompt, temperature, api_key_ref? }
│   ├── http: { url, method, headers, body_template }
│   ├── db:   { connection_string, query }
│   └── code: { language: python | javascript, source_code }
├── position_x: Float (后续拖拽用)
├── position_y: Float

Edge (连线)
├── id: UUID (PK)
├── agent_id: UUID (FK → Agent)
├── source_node_id: UUID (FK → Node)
├── target_node_id: UUID (FK → Node)
├── condition: Text? (条件路由表达式，MVP 先不做，后续阶段实现)

Execution (执行历史)
├── id: UUID (PK)
├── agent_id: UUID (FK → Agent)
├── input: JSONB
├── output: JSONB
├── status: Enum (pending | running | success | failed)
├── error_message: Text?
├── started_at: DateTime
├── completed_at: DateTime
```

### 4.2 Agent → LangGraph 映射规则

| DB 节点类型  | LangGraph 操作                                |
| ------------ | --------------------------------------------- |
| `start`      | `graph.set_entry_point(start_node)`           |
| `llm`        | `graph.add_node()` + `ChatOpenAI` + `bind_tools(tools)` |
| `http/db/code` | `graph.add_node(ToolNode(tools))` 的一部分    |
| `end`        | `graph.add_node(END)`                         |
| Edge         | `graph.add_edge(src, dst)` / `graph.add_conditional_edges()` |

---

## 5. API 设计

### 5.1 管理端 API

| 方法     | 路径                            | 说明               |
| -------- | ------------------------------- | ------------------ |
| `POST`   | `/api/agents`                   | 创建智能体         |
| `GET`    | `/api/agents`                   | 列表（`?search=`）  |
| `GET`    | `/api/agents/:id`               | 获取详情（含节点+连线） |
| `PUT`    | `/api/agents/:id`               | 更新智能体         |
| `DELETE` | `/api/agents/:id`               | 删除智能体         |
| `POST`   | `/api/agents/:id/run`           | 执行智能体（同步）  |
| `GET`    | `/api/agents/:id/executions`    | 执行历史列表       |
| `GET`    | `/api/executions/:id`           | 单次执行详情       |

### 5.2 第三方调用示例

```bash
curl -X POST http://host:8000/api/agents/data-analyzer/run \
  -H "Content-Type: application/json" \
  -d '{"question": "上季度销售额最高的产品是哪些？"}'
```

```json
// 响应
{
  "execution_id": "abc-123",
  "status": "success",
  "output": {
    "final_answer": "上季度销售额最高的三个产品是...",
    "nodes_executed": ["start", "db_query", "llm_analyze", "end"]
  }
}
```

---

## 6. 前端设计

### 6.1 页面结构

| 路由                | 页面                | 说明                     |
| ------------------- | ------------------- | ------------------------ |
| `/`                 | AgentList           | 智能体列表，支持搜索      |
| `/agents/:id`       | AgentEditor         | 编辑页：基本信息 + 节点管理 |
| `/agents/new`       | AgentEditor (create)| 新建智能体               |

### 6.2 组件树

```
App (React Router)
├── AgentList
│   ├── SearchBar
│   ├── AgentCard (×N)         # 名称 / 描述 / 节点数 / 操作按钮
│   └── DeleteConfirmDialog
├── AgentEditor
│   ├── AgentForm              # 名称 + 描述 + LLM 全局配置
│   ├── NodePanel              # 右侧节点管理区
│   │   ├── NodeCard (×N)      # 节点图标 + 标签 + 连线信息
│   │   └── AddNodeButton
│   ├── NodeForm (dialog)      # 按节点类型切换配置表单
│   │   ├── LLMNodeForm
│   │   ├── HTTPNodeForm
│   │   ├── DBNodeForm
│   │   └── CodeNodeForm
│   ├── EdgeForm               # 连线编辑（选择源→目标）
│   └── RunDialog              # 输入 JSON → 显示结果
```

### 6.3 编辑器交互流程

```
1. AgentForm: 填写名称、描述、LLM配置
2. NodePanel: 点击 [+添加节点] → 弹窗选择类型 → 配置参数 → 确认
3. 每个 NodeCard 内部有连线选择器（下拉选目标节点）
4. 点击 [保存] → 调用 PUT /api/agents/:id
5. 点击 [运行] → RunDialog 弹窗 → 输入 JSON → 调用 POST /:id/run → 显示输出
```

---

## 7. 后端模块划分

```
backend/app/
├── main.py                 # FastAPI 应用工厂 + CORS + 静态文件挂载
├── config.py               # Settings (pydantic-settings)
├── database.py             # SQLAlchemy engine + session
├── models.py               # ORM 模型 (Agent, Node, Edge, Execution)
├── schemas.py              # Pydantic 请求/响应模型
├── api/
│   └── agents.py           # 路由: Agent CRUD + 执行
├── services/
│   └── agent_service.py    # 业务逻辑层
└── engine/
    ├── builder.py          # DB Agent 定义 → LangGraph StateGraph
    ├── tools.py            # http_call / db_query / run_code 工具实现
    └── executor.py         # graph.invoke() + 记录 Execution
```

### 7.1 Engine 核心逻辑

```
builder.build(agent_id):
  1. 从 DB 加载 Agent + Nodes + Edges
  2. 构建 LangGraph StateGraph:
     - 提取所有 llm 节点 → 注入到 LLM agent 的 tools
     - 提取所有 http/db/code 节点 → 注册为 ToolNode
     - 按 Edges 添加边和条件路由
  3. 编译 graph → 缓存到内存 / Redis

executor.run(agent, input_data):
  1. 获取或构建 StateGraph
  2. graph.invoke({"input": input_data, "messages": []})
  3. 提取最终状态 → 存入 Execution 表
  4. 返回结果
```

### 7.2 Tool 实现

```python
# tools.py
def http_call(url: str, method: str, headers: dict, body: dict) -> dict:
    """HTTP 请求工具"""
    ...

def db_query(connection_string: str, query: str) -> list:
    """数据库查询工具，返回结果行列表"""
    ...

def run_code(language: str, source_code: str, context: dict) -> dict:
    """沙箱执行代码片段（子进程 / Docker 沙箱）"""
    ...
```

---

## 8. 项目文件结构

```
axAgentOrch/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── agents.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   └── agent_service.py
│   │   └── engine/
│   │       ├── __init__.py
│   │       ├── builder.py
│   │       ├── tools.py
│   │       └── executor.py
│   └── tests/
│       ├── __init__.py
│       └── test_agents.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/
│       │   └── client.ts
│       ├── pages/
│       │   ├── AgentList.tsx
│       │   └── AgentEditor.tsx
│       └── components/
│           ├── AgentCard.tsx
│           ├── AgentForm.tsx
│           ├── NodePanel.tsx
│           ├── NodeCard.tsx
│           ├── NodeForm.tsx
│           └── RunDialog.tsx
└── docs/
    └── superpowers/
        └── specs/
            └── 2025-06-29-agent-orch-design.md
```

---

## 9. 非功能需求

- **同步执行超时**: 30 秒（FastAPI 请求超时限制）
- **错误处理**: 所有工具调用失败需捕获异常，返回错误状态
- **LLM 配置**: 支持 OpenAI-compatible API（本地模型如 Ollama 也兼容）
- **数据库迁移**: Alembic 自动管理 schema 变更
- **开发体验**: 前端 Vite HMR，后端 `--reload`

---

## 10. 边界与约束

- MVP 不包含认证（单用户模式）
- MVP 不做拖拽编排（表单式配置替代）
- MVP 不做异步执行（同步阻塞返回）
- 代码执行 MVP 阶段使用 `subprocess` 子进程 + 超时限制实现基本隔离，不做严格沙箱
- LLM API Key 通过环境变量注入，不在前端展示
