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

    node_id_map = {str(n.id): str(n.id) for n in nodes}

    # Separate unconditional and conditional edges
    normal_edges = [e for e in edges if not e.condition]
    cond_edges = [e for e in edges if e.condition]

    for e in normal_edges:
        src = str(e.source_node_id)
        tgt = str(e.target_node_id)
        if src in node_id_map and tgt in node_id_map:
            graph.add_edge(src, tgt)

    for e in cond_edges:
        src = str(e.source_node_id)
        tgt = str(e.target_node_id)
        cond_str = e.condition

        if src not in node_id_map or tgt not in node_id_map:
            continue

        def make_route_fn(target_id, condition):
            def route(state):
                messages = state.get("messages", [])
                if not messages:
                    return END
                last = messages[-1]
                content = str(getattr(last, 'content', ''))
                if condition and condition in content:
                    return target_id
                return END
            return route

        route_fn = make_route_fn(tgt, cond_str)
        path_map = {tgt: tgt, END: END}
        graph.add_conditional_edges(src, route_fn, path_map)

    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", route_tools, {"tools": "tools", "end": END})
    graph.add_edge("tools", "agent")

    return graph.compile()
