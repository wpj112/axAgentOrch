from typing import Annotated, TypedDict

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage

from app.config import settings


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    input: dict


def get_tools():
    from app.engine.tools import http_call, db_query, run_code
    return [http_call, db_query, run_code]


def build_graph(
    nodes: list,
    edges: list,
    model: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.7,
):
    llm = ChatOpenAI(
        model=model or settings.llm_model,
        api_key=api_key or settings.openai_api_key,
        base_url=base_url or settings.openai_base_url,
        temperature=temperature,
    )

    tool_node_types = {n.type for n in nodes if n.type in ("http", "db", "code")}
    all_tools = get_tools()
    available_tools = [t for t in all_tools if t.name in tool_node_types] if tool_node_types else all_tools

    # Build tool config context from node definitions
    tool_context_parts = []
    for n in nodes:
        if n.type == "http" and n.config:
            tool_context_parts.append(f"HTTP工具: URL={n.config.get('url','')} Method={n.config.get('method','GET')} Headers={n.config.get('headers','{}')} Body={n.config.get('body','{}')}")
        elif n.type == "db" and n.config:
            tool_context_parts.append(f"数据库工具: connection={n.config.get('connection_string','')} query={n.config.get('query','')}")
        elif n.type == "code" and n.config:
            tool_context_parts.append(f"代码工具: language={n.config.get('language','python')} code={n.config.get('source_code','')}")
    tool_context = "\n".join(tool_context_parts)

    llm_with_tools = llm.bind_tools(available_tools)
    tool_node = ToolNode(available_tools)

    graph = StateGraph(AgentState)

    def call_model(state: AgentState) -> dict:
        messages = state["messages"]
        if not messages:
            from langchain_core.messages import HumanMessage, SystemMessage
            input_data = state.get("input", {})

            system_text = "你是一个智能助手，可以使用工具执行操作。"
            if tool_context:
                system_text += f"\n\n可用工具配置:\n{tool_context}\n\n当用户需要时，请直接使用上述工具执行操作，不要只描述怎么做。"

            input_str = str(input_data) if input_data else "Process the request."
            messages = [SystemMessage(content=system_text), HumanMessage(content=input_str)]
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
