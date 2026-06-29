# AgentOrch 拖拽式可视化编排 — 设计文档

> 创建日期: 2025-06-29
> 版本: v0.2 (Phase 2 — 画布升级)

---

## 1. 概述

将 Phase 1 中表单式的右侧节点管理面板（`NodePanel` + `NodeCard`）升级为基于 **React Flow** 的拖拽式可视化画布。用户在画布上自由拖拽节点位置、拖拽 Handle 连线、双击节点弹出配置面板。同时支持边上的条件路由表达式。

**核心能力：**
- 拖拽节点类型面板 → 画布自由放置
- 拖拽 Handle 连接节点（直观连线）
- 双击节点 → 右侧滑出配置面板
- 边支持条件路由标签
- 自动布局（dagre）
- 画布缩放 / 平移 / 小地图

---

## 2. 技术选型

| 依赖 | 版本 | 用途 |
|------|------|------|
| `reactflow` | ^11.11 | React Flow 画布核心 |
| `dagre` | ^0.8 | DAG 自动布局算法 |
| `@types/dagre` | ^0.7 | dagre TypeScript 类型 |

React Flow v11 兼容当前 React 18 技术栈。其余依赖不变。

---

## 3. 布局 & 组件结构

### 3.1 编辑器页面布局

```
┌──────────────────────────────────────────────────┐
│  ← 返回    编辑: 数据分析助手        [运行][保存]  │
├─────────────────┬────────────────────────────────┤
│ AgentForm (左)  │   React Flow Canvas (右)        │
│                 │                                │
│ 名称: [___]     │  ┌──────────┐                  │
│ 描述: [___]     │  │ 节点面板   │                  │
│                 │  │LLM HTTP DB│                  │
│                 │  │Code Start │                  │
│                 │  │    End    │                  │
│                 │  └──────────┘                  │
│                 │                                │
│                 │  ┌─[LLM]──┐                    │
│                 │  │  "success"                  │
│                 │  │  ╱                          │
│                 │ [S]──[HTTP]──[LLM]──[E]        │
│                 │       ╲                         │
│                 │       [DB]                     │
│                 │                                │
│                 │              ┌MiniMap┐         │
│                 │              └───────┘         │
│                 │                    [自动布局]   │
├─────────────────┴────────────────────────────────┤
│  ConfigPanel (双击节点时右侧滑入，宽 380px)       │
│  节点类型 / Label                                 │
│  ────────────────                                │
│  [按类型动态渲染的配置表单]                         │
│  [取消] [确认]                                    │
└──────────────────────────────────────────────────┘
```

### 3.2 组件树 & 职责

```
AgentEditor (修改)
├── AgentForm (不变)
├── FlowCanvas (新增 → 替代 NodePanel)
│   ├── NodePalette (新增 — 可拖拽节点面板)
│   └── CanvasNode (新增 — 自定义节点渲染)
│       └── Handle (source + target)
└── ConfigPanel (新增 — 右侧滑出，内嵌 NodeForm)
    └── NodeForm (复用现有)
```

| 组件 | 职责 |
|------|------|
| `FlowCanvas` | 管理 React Flow 实例，持有 nodes/edges 状态，处理 drop/doubleClick/connect 事件 |
| `CanvasNode` | 自定义节点外观：彩色圆角卡片 + type 图标 + label，顶/底部 Handle |
| `NodePalette` | 常驻画布左上角，6 种节点类型可拖拽，`onDragStart` 传递 type |
| `ConfigPanel` | 右侧抽屉面板 (380px)，双击节点滑出，内嵌 `NodeForm` |

### 3.3 不再使用的组件

- `NodePanel.tsx` — 被 `FlowCanvas` 替代
- `NodeCard.tsx` — 被 `CanvasNode` 替代

---

## 4. 交互设计

### 4.1 拖拽添加节点

1. 用户从 NodePalette 拖拽一个节点类型到画布
2. React Flow `onDrop` 事件获取回调
3. 取 drop 位置的画布坐标 `(x, y)`
4. 创建新节点：`{ id, type, label, config: {}, position: { x, y } }`
5. 新节点出现在画布上
6. 自动激活 ConfigPanel 进行初始配置（可跳过，不需要强制配置）

### 4.2 连线

1. 用户从节点底部 Handle（source）拖出连线
2. 拖到另一节点顶部 Handle（target）释放
3. React Flow `onConnect` 事件创建 edge：`{ source, target }`
4. 拖到空白处释放 → 不创建连线
5. 连线默认显示为实线

### 4.3 条件路由连线

1. 已有连线上渲染一个可点击的标签区域
2. 点击标签 → 弹出输入框填写条件表达式，如 `'result == "success"'`
3. 条件保存到 `edge.data.condition`
4. 有条件连线显示**虚线 + 标签文字**，无条件连线显示**实线**
5. 条件表达式可为空（即无条件）

### 4.4 节点配置（ConfigPanel）

1. 双击节点 → ConfigPanel 从右侧滑入（`transition: right 0.3s`）
2. 面板宽度 380px，不改变画布尺寸（画布自动收缩）
3. 面板内容：
   - 顶部：节点类型 badge + label 编辑框
   - 下方：按节点类型动态渲染配置表单（复用 NodeForm 各类型表单逻辑）
4. 修改即时反映到画布节点卡片
5. 关闭面板方式：点击面板外的遮罩 / 点击关闭按钮 / 按 Escape

### 4.5 画布视图控制

- **缩放**：鼠标滚轮（0.3x ~ 2x）
- **平移**：拖拽空白区域
- **小地图**：右下角 `ReactFlow.MiniMap`
- **自动布局**：工具栏按钮，调用 `dagre` 重新计算节点位置（上下流向）
- **适应视图**：按钮，自动缩放让所有节点可见

---

## 5. 数据流

### 5.1 画布状态 ↔ 后端

```
画布操作           本地状态变化              保存时序列化
────────           ────────────              ──────────
拖入节点   →  nodes[] 新增                    position_x/y 写入
拖拽移动   →  nodes[] 更新 position            position_x/y 写入
双击配节点 →  nodes[] 更新 config             config 写入
拖拽连线   →  edges[] 新增                    source/target 写入
编辑条件   →  edges[] 更新 data.condition     condition 写入
删除节点   →  nodes[] 删除 + 关联 edge 清理    无需特殊处理
```

### 5.2 保存 payload

```typescript
const payload = {
  name, description,
  nodes: nodes.map(n => ({
    type: n.type,
    label: n.label,
    config: n.config,
    position_x: n.position.x,  // 画布坐标持久化
    position_y: n.position.y,
  })),
  edges: edges.map(e => ({
    source_node_id: nodes.find(n => n.id === e.source)?.id,
    target_node_id: nodes.find(n => n.id === e.target)?.id,
    condition: e.data?.condition || null,
  })),
}
```

### 5.3 加载还原

```typescript
// 从后端加载 Agent 后
const rfNodes = agent.nodes.map(n => ({
  id: n.id,
  type: 'custom',          // 使用自定义 CanvasNode
  position: { x: n.position_x, y: n.position_y },
  data: { type: n.type, label: n.label, config: n.config },
}))

const rfEdges = agent.edges.map(e => ({
  id: e.id,
  source: e.source_node_id,
  target: e.target_node_id,
  data: { condition: e.condition },
  style: e.condition ? { strokeDasharray: '5 5' } : {},
}))
```

---

## 6. 后端改动

### 6.1 builder.py — 条件路由支持

当前：所有连线都是 `graph.add_edge(src, dst)`。

改动后：区分 `normal_edge` 和 `conditional_edge`。

```python
normal_edges = [e for e in edges if not e.condition]
cond_edges = [e for e in edges if e.condition]

for e in normal_edges:
    graph.add_edge(node_id(e.source), node_id(e.target))

for e in cond_edges:
    cond_str = e.condition  # e.g. '"success" in content'

    def make_route_fn(tgt_id, cond):
        def route(state):
            last = state["messages"][-1]
            content = str(last.content) if last else ""
            return tgt_id if cond in content else END
        return route

    graph.add_conditional_edges(
        node_id(e.source),
        make_route_fn(node_id(e.target), cond_str),
        {node_id(e.target): node_id(e.target), END: END}
    )
```

### 6.2 改动范围

| 文件 | 改动 | 说明 |
|------|------|------|
| `backend/app/engine/builder.py` | 30 行新增 | 区分边缘类型，条件边生成路由函数 |
| 其他后端文件 | 无改动 | schema/models/API 已预留条件字段 |

### 6.3 不做改动

- `schemas.py` — `condition` 字段已在 v0.1 定义
- `models.py` — `Edge.condition` / `Node.position_x/y` 已在 v0.1 定义
- API routes / service — 无需更改

---

## 7. 文件变更清单

```
新增:
  frontend/src/components/FlowCanvas.tsx
  frontend/src/components/CanvasNode.tsx
  frontend/src/components/NodePalette.tsx
  frontend/src/components/ConfigPanel.tsx

修改:
  frontend/src/pages/AgentEditor.tsx     # 右侧替换为 FlowCanvas
  frontend/src/App.tsx                   # 无变化（路由不变）
  frontend/package.json                  # 新增 reactflow, dagre
  backend/app/engine/builder.py          # 条件路由支持

废弃（可删除或保留引用不发生错误即可）:
  frontend/src/components/NodePanel.tsx
  frontend/src/components/NodeCard.tsx
```

---

## 8. 非功能需求

- **性能**：画布支持 50+ 节点流畅交互（React Flow 内置虚拟化）
- **响应式**：画布宽度自适应右侧面板剩余空间（`flex: 1`）
- **配置面板动画**：`transition` 0.3s ease，不阻塞画布渲染
- **键盘操作**：Delete 键删除选中节点/边，Escape 关闭 ConfigPanel
- **触摸支持**：React Flow 内置触摸设备兼容

---

## 9. 边界与约束

- 条件路由 MVP 实现为字符串包含匹配（`"success" in content`），不做完整表达式引擎
- NodePalette 不做收起/展开动画，始终可见
- 自动布局使用 `dagre` 默认 LR (从左到右) 流向，不提供布局方向选择
- 画布无限大，无边界限制
- 废弃组件不删除，仅移除 import 引用（二进制兼容）
