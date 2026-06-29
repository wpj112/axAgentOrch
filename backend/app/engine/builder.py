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
