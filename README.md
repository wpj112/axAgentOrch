# AgentOrch — 智能体编排系统

LLM 智能体可视化编排平台。通过拖拽画布定义 Agent 工作流，每个 Agent 自动暴露为 REST API 供第三方调用。

## 功能

| 功能 | 说明 |
|------|------|
| 🎨 拖拽画布 | React Flow 可视化编排，拖拽节点 → 连线 → 配置 |
| 🧠 LLM 执行 | LangGraph ReAct Agent，LLM 自主决策何时调用工具 |
| 🔧 工具节点 | HTTP 请求、数据库查询（SELECT）、代码执行（Python/JS） |
| 🔀 条件分支 | IfElseNode，按 `node_outputs` 做结构化判断，支持 is/not_empty/lt/gte |
| 🔁 循环控制 | LoopNode，循环执行子流程，按结构化条件决定继续/退出 |
| 🌐 同步/异步 | `?mode=sync` 阻塞返回 / `?mode=async` 立即返回 task_id 轮询 |
| ⚙️ 全局配置 | Model / API Key / Base URL / Temperature，支持 OpenAI + Ollama + DeepSeek |
| 🏷️ Agent 覆盖 | 每个 Agent 可覆盖全局的 Model 和 Temperature |
| 🐳 Docker 部署 | `docker compose up -d` 一键启动 4 容器 |
| 🌙 深色主题 | 全局深色 UI |

## 快速开始

### 1. 启动

```bash
git clone git@github.com:wpj112/axAgentOrch.git
cd axAgentOrch
cp .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY 或留空（使用 Settings 页面配置 Ollama）
docker compose up -d
```

4 个容器：
- `backend` — FastAPI (端口 8888)
- `worker` — Celery 异步执行
- `db` — PostgreSQL 16
- `redis` — Redis 7

### 2. 打开前端

```
http://localhost:8888
```

### 3. 配置 LLM

点击右上角 **⚙ 设置**：

| 提供商 | 操作 |
|--------|------|
| **OpenAI** | 选 OpenAI，填 API Key，Model 选 gpt-4o |
| **Ollama 本地** | 先运行 `ollama pull qwen2.5:7b && ollama serve`，然后选 Ollama，Model 选 qwen2.5:7b，API Key 留空 |
| **DeepSeek** | 选 DeepSeek，填 API Key |

### 4. 创建智能体

1. 点击 **+ 新建智能体**
2. 填写名称和描述
3. 从左侧拖拽节点类型到画布（Start → LLM → End 是最小配置）
4. 连接节点：从节点底部 Handle 拖出连线到下一个节点
5. 双击节点修改配置（如 LLM 的 system prompt）
6. 点击 **保存**

### 5. 运行智能体

1. 在编辑器页点击 **运行**
2. 输入你想对智能体说的话
3. 选择 **同步**（阻塞等待）或 **异步**（后台执行，自动轮询）
4. 查看 LLM 返回结果

## 节点类型详解

Agent 由节点（Node）和连线（Edge）组成。执行时采用 **ReAct 模式**：LLM 节点是"大脑"，它能自主决定是直接回答用户，还是调用工具节点获取数据后再回答。

```
用户输入 → LLM 思考 → 需要数据？ → 调用工具 → 工具返回结果 → LLM 再思考 → 回答用户
                     ↘ 不需要？ → 直接回答 ──────────────────────────↗
```

### 各节点功能

#### Start / End
流程起止标记，不执行任何逻辑。

#### LLM 节点
**核心决策节点。** 接收用户输入，分析意图，决定下一步动作。

| | |
|---|---|
| **输入** | `{"message": "用户说的话"}` 或上一节点的输出 |
| **行为** | 调用 LLM（通过全局配置的模型），LLM 可以选择直接回复或调用工具 |
| **输出** | `{"result": "LLM 的回复文本"}` 如果调用了工具，输出中包含工具调用信息 |

配置可填 `system_prompt` 设定 AI 角色。例如：
```
你是一个数据分析师，帮助用户查询数据库并分析结果。用中文回复。
```

#### HTTP 节点
**调用外部 API。** LLM 决定需要外部数据时自动调用。

| 配置项 | 说明 | 示例 |
|--------|------|------|
| URL | 请求地址 | `https://api.example.com/orders` |
| Method | HTTP 方法 | `GET` / `POST` / `PUT` |
| Headers | JSON 请求头 | `{"Authorization": "Bearer xxx"}` |
| Body | JSON 请求体 | `{"date": "2025-01-01"}` |

| | |
|---|---|
| **由谁触发** | LLM 判断需要外部数据时自动调用 |
| **输入** | LLM 自动填充 URL/Body 参数（基于用户问题理解） |
| **输出** | `{"status_code": 200, "body": "API 返回的原始文本"}` |
| **结果流向** | 返回给 LLM，LLM 理解后继续处理或回复用户 |

#### 数据库节点
**执行 SQL 查询。** 仅允许 SELECT 语句。

| 配置项 | 说明 | 示例 |
|--------|------|------|
| Connection String | 数据库连接串 | `postgresql://user:pass@host/db` |
| Query | SQL SELECT 语句 | `SELECT * FROM orders WHERE date > '2025-01-01'` |

| | |
|---|---|
| **由谁触发** | LLM 判断需要查询数据时自动调用 |
| **输入** | LLM 自动构建 SQL 查询（也可用配置中的固定查询） |
| **输出** | `{"rows": [...], "count": 10}` — 查询结果行列表 |
| **结果流向** | 查询结果返回给 LLM，LLM 理解数据后回复用户 |
| **安全限制** | 仅允许 SELECT，拒绝 INSERT/UPDATE/DELETE/DROP |

#### 代码节点
**执行 Python 或 JavaScript 代码片段。** 超时 15 秒。

| 配置项 | 说明 | 示例 |
|--------|------|------|
| Language | 语言 | `python` / `javascript` |
| Source Code | 代码内容 | `print(sum(_context['rows']))` |

| | |
|---|---|
| **由谁触发** | LLM 判断需要计算/转换数据时自动调用 |
| **输入** | `_context` 变量包含上下文数据（之前节点的输出） |
| **输出** | `{"output": "代码 stdout 输出"}` 或 `{"error": "错误信息"}` |
| **结果流向** | 计算结果返回给 LLM |

### 条件分支 (IfElseNode)

控制节点，按前面节点写入的 `node_outputs` 做结构化判断。

当前执行器里，每个节点执行后都会把结果写到 `node_outputs[节点ID]`：
- `llm` 节点会写入 `{"text": "..."}`
- `http` 节点会写入接口返回的 JSON，或 `{"result": "..."}`
- `db` 节点会写入查询结果
- `code` 节点会写入 `{"result": "..."}`

所以 IfElseNode 不是直接判断 `input.message`，而是判断“前面节点产出的结构化结果”。最常见用法是：

1. 先让一个 `llm` / `code` / `http` 节点产出可判断的字段
2. 再接一个 `if_else` 节点
3. 在 `cases` 里用 `variable_selector` 指向那个字段
4. 从条件节点连出多条边，给每条边起一个分支名

示例：先让 LLM 输出一个意图标签，再由条件节点分流。

上游 LLM 的 `system_prompt` 可以约束成：
```text
判断用户意图，只输出 JSON。
订单查询输出 {"intent":"order_search"}
普通闲聊输出 {"intent":"chat"}
```

IfElseNode 配置：
```json
{
  "cases": [
    {
      "case_id": "order",
      "conditions": [
        {"variable_selector": ["<llm节点ID>", "text"], "operator": "not_empty"}
      ]
    }
  ],
  "default_case_id": "default"
}
```

如果你希望判断结构化字段，推荐让上游 `code` / `http` 节点写出明确 JSON，再这样配：
```json
{
  "cases": [
    {
      "case_id": "order",
      "conditions": [
        {"variable_selector": ["intent_code", "intent"], "operator": "is", "value": "order_search"}
      ]
    },
    {
      "case_id": "chat",
      "conditions": [
        {"variable_selector": ["intent_code", "intent"], "operator": "is", "value": "chat"}
      ]
    }
  ],
  "default_case_id": "default"
}
```

分支连线按“边名称”匹配 `case_id`：
```
[IfElse] ── 边名称="order"   → [查订单]
         ── 边名称="chat"    → [聊天回复]
         ── 边名称="default" → [End]
```

支持操作符：`is` / `contains` / `starts_with` / `ends_with` / `not_empty` / `lt` / `gte`

---

### 循环 (LoopNode)

循环节点，执行子流程并在每轮结束后按条件判断是否继续。

**1. 拖入「循环」节点** → 双击配置：
```json
{
  "max_iterations": 5,
  "condition": {"variable_selector": ["judge_id", "conf"], "operator": "lt", "value": 0.8},
  "start_node_id": "<循环体首节点ID>",
  "end_node_id": "<循环体尾节点ID>"
}
```

**2. 循环体内子节点**设 `parent_id = 循环节点ID`

**3. `start_node_id` / `end_node_id`** 填循环体首尾节点 ID

**4. 出口边**双击命名为 `loop_exit`（底层仍兼容 `source_handle="loop_exit"`）

执行器会在每轮结束后用 `condition` 去判断 `node_outputs`；条件不满足时退出循环并走 `loop_exit`。

### 当前实现注意

- `if_else` 和 `loop` 现在推荐直接用边名称做路由；底层仍兼容 `source_handle`。
- 条件判断读的是 `node_outputs`，不是直接读取 `input.message`。
- 如果要根据用户输入分流，推荐先用一个 `llm` 或 `code` 节点把输入整理成明确字段，再接 `if_else`。
- 当前前端编辑器还没有把 `source_handle` / `parent_id` 做成完整可视化配置项；底层执行器和 schema 已支持，但 UI 和保存链路还需要进一步打通。

## 第三方调用

每个已保存的 Agent 自动拥有一个 API 端点。

### 调用端点

```
POST /api/agents/{agent_id}/run
Content-Type: application/json
```

### 请求格式

```json
{
  "input": {
    "message": "帮我查询最近7天的订单数据"
  }
}
```

### 同步调用（默认）

```bash
curl -X POST http://your-host:8888/api/agents/your-agent-id/run \
  -H "Content-Type: application/json" \
  -d '{"input":{"message":"hello"}}'
```

```json
// 响应
{
  "execution_id": "abc-123",
  "status": "success",
  "output": {
    "result": "你好！我可以帮你做什么？"
  },
  "error_message": null
}
```

### 异步调用

```bash
curl -X POST "http://your-host:8888/api/agents/your-agent-id/run?mode=async" \
  -H "Content-Type: application/json" \
  -d '{"input":{"message":"hello"}}'
```

```json
// 立即返回
{
  "execution_id": "abc-123",
  "status": "pending",
  "output": {"task_id": "celery-task-uuid"},
  "error_message": null
}
```

### 轮询结果

```bash
# 用上一步返回的 execution_id 轮询
curl http://your-host:8888/api/agents/executions/abc-123
```

```json
{
  "id": "abc-123",
  "agent_id": "your-agent-id",
  "input": {"message": "hello"},
  "output": {"result": "你好！"},
  "status": "success",
  "error_message": null,
  "started_at": "2025-06-29T10:00:00Z",
  "completed_at": "2025-06-29T10:00:05Z"
}
```

### 获取 Agent 列表

```
GET /api/agents
GET /api/agents/{agent_id}
GET /api/agents/{agent_id}/executions
```

### 节点类型配置参考

```json
// LLM 节点
{
  "type": "llm",
  "label": "AI分析",
  "config": {
    "model": "gpt-4o",
    "system_prompt": "你是一个数据分析助手",
    "temperature": "0.7"
  }
}

// HTTP 节点
{
  "type": "http",
  "label": "调用API",
  "config": {
    "url": "https://api.example.com/data",
    "method": "GET",
    "headers": "{}",
    "body": "{}"
  }
}

// 数据库节点
{
  "type": "db",
  "label": "查询订单",
  "config": {
    "connection_string": "postgresql://user:pass@host/db",
    "query": "SELECT * FROM orders LIMIT 10"
  }
}

// 代码节点
{
  "type": "code",
  "label": "数据清洗",
  "config": {
    "language": "python",
    "source_code": "result = _context.get('data', [])\nprint(json.dumps(result))"
  }
}

// 条件分支节点
{
  "type": "if_else",
  "label": "路由",
  "config": {
    "cases": [{
      "case_id": "order",
      "conditions": [
        {"variable_selector": ["intent_node", "intent"], "operator": "is", "value": "order_search"}
      ]
    }],
    "default_case_id": "default"
  }
}

// 循环节点
{
  "type": "loop",
  "label": "重试",
  "config": {
    "max_iterations": 3,
    "condition": {"variable_selector": ["judge_node", "confidence"], "operator": "lt", "value": 0.8},
    "start_node_id": "uuid-of-first-child",
    "end_node_id": "uuid-of-last-child"
  }
}
```

## API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/agents` | 创建 Agent |
| `GET` | `/api/agents` | Agent 列表 (`?search=`) |
| `GET` | `/api/agents/:id` | Agent 详情 |
| `PUT` | `/api/agents/:id` | 更新 Agent |
| `DELETE` | `/api/agents/:id` | 删除 Agent |
| `POST` | `/api/agents/:id/run` | 执行 Agent (`?mode=sync\|async`) |
| `GET` | `/api/agents/:id/executions` | 执行历史 |
| `GET` | `/api/agents/executions/:id` | 单次执行详情 |
| `GET` | `/api/settings` | 获取全局设置 |
| `PUT` | `/api/settings` | 更新全局设置 |
| `GET` | `/api/health` | 健康检查 |

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite + React Flow |
| 后端 | Python 3.12 + FastAPI + SQLAlchemy |
| 引擎 | LangGraph + LangChain |
| 队列 | Celery + Redis |
| 数据库 | PostgreSQL 16 |
| 部署 | Docker Compose |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | API Key（全局配置可覆盖） | — |
| `OPENAI_BASE_URL` | API 地址 | `https://api.openai.com/v1` |
| `LLM_MODEL` | 默认模型 | `gpt-4o` |
| `DATABASE_URL` | PG 连接串 | — |
| `REDIS_URL` | Redis 连接串 | — |
