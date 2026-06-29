# AgentOrch — 智能体编排系统

LLM 智能体可视化编排平台。通过拖拽画布定义 Agent 工作流，每个 Agent 自动暴露为 REST API 供第三方调用。

## 功能

| 功能 | 说明 |
|------|------|
| 🎨 拖拽画布 | React Flow 可视化编排，拖拽节点 → 连线 → 配置 |
| 🧠 LLM 执行 | LangGraph ReAct Agent，LLM 自主决策何时调用工具 |
| 🔧 工具节点 | HTTP 请求、数据库查询（SELECT）、代码执行（Python/JS） |
| 🔗 条件路由 | 边支持条件表达式，LLM 输出匹配时走相应分支 |
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
