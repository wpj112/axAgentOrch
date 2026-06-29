import json
from typing import Annotated, TypedDict

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

from app.config import settings


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    input: dict
    tool_results: dict


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

    # Build node lookup and edge adjacency
    node_map = {str(n.id): n for n in nodes}
    children = {str(n.id): [] for n in nodes}
    for e in edges:
        children.setdefault(str(e.source_node_id), []).append(str(e.target_node_id))

    # Topological sort to determine execution order
    in_degree = {k: 0 for k in node_map}
    for e in edges:
        in_degree[str(e.target_node_id)] = in_degree.get(str(e.target_node_id), 0) + 1
    order = []
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    while queue:
        nid = queue.pop(0)
        order.append(nid)
        for child in children.get(nid, []):
            in_degree[child] -= 1
            if in_degree[child] == 0:
                queue.append(child)

    # Register all node types as graph nodes
    graph = StateGraph(AgentState)

    for n in nodes:
        nid = str(n.id)
        ntype = n.type
        nconfig = n.config or {}

        if ntype in ("start", "end"):

            def make_passthrough():
                def fn(state: AgentState) -> dict:
                    return state
                return fn

            graph.add_node(nid, make_passthrough())

        elif ntype == "llm":

            def make_llm_fn(llm_nid, llm_config, _llm=llm):
                def fn(state: AgentState) -> dict:
                    msgs = state["messages"]
                    tool_results = state.get("tool_results", {})
                    input_data = state.get("input", {})

                    if not msgs:
                        user_text = str(input_data) if input_data else "Process the request."
                        system_text = llm_config.get("system_prompt", "")

                        context = ""
                        if tool_results:
                            context = "Previous tool results:\n"
                            for tool_name, result in tool_results.items():
                                context += f"{tool_name}: {json.dumps(result, indent=2, ensure_ascii=False)}\n"

                        prompt_parts = []
                        if system_text:
                            prompt_parts.append(SystemMessage(content=system_text))
                        prompt_text = f"{context}\nUser request: {user_text}" if context else user_text
                        prompt_parts.append(HumanMessage(content=prompt_text))
                        msgs = prompt_parts

                    resp = _llm.invoke(msgs)
                    return {"messages": [resp], "tool_results": tool_results}

                return fn

            graph.add_node(nid, make_llm_fn(nid, nconfig))

        elif ntype == "http":

            def make_http_fn(http_nid, http_config):
                def fn(state: AgentState) -> dict:
                    url = http_config.get("url", "")
                    method = http_config.get("method", "GET")
                    headers_str = http_config.get("headers", "{}")
                    body_str = http_config.get("body", "{}")
                    try:
                        headers = json.loads(headers_str) if isinstance(headers_str, str) else headers_str
                    except Exception:
                        headers = {}
                    try:
                        body = json.loads(body_str) if isinstance(body_str, str) else body_str
                    except Exception:
                        body = {}

                    try:
                        import httpx
                        with httpx.Client(timeout=30) as client:
                            resp = client.request(method=method, url=url, headers=headers, json=body if method.upper() in ("POST", "PUT", "PATCH") else None)
                            resp.raise_for_status()
                            data = resp.json() if "application/json" in resp.headers.get("content-type", "") else resp.text
                    except Exception as e:
                        data = {"error": str(e)}

                    tool_results = {**state.get("tool_results", {}), http_nid: data}
                    return {"tool_results": tool_results}

                return fn

            graph.add_node(nid, make_http_fn(nid, nconfig))

        elif ntype == "db":

            def make_db_fn(db_nid, db_config):
                def fn(state: AgentState) -> dict:
                    conn_str = db_config.get("connection_string", "")
                    query = db_config.get("query", "")
                    try:
                        from sqlalchemy import create_engine, text
                        engine = create_engine(conn_str)
                        with engine.connect() as conn:
                            rows = [dict(r._mapping) for r in conn.execute(text(query))]
                    except Exception as e:
                        rows = {"error": str(e)}
                    tool_results = {**state.get("tool_results", {}), db_nid: rows}
                    return {"tool_results": tool_results}

                return fn

            graph.add_node(nid, make_db_fn(nid, nconfig))

        elif ntype == "code":

            def make_code_fn(code_nid, code_config):
                def fn(state: AgentState) -> dict:
                    lang = code_config.get("language", "python")
                    source = code_config.get("source_code", "")
                    try:
                        import subprocess, tempfile, os
                        with tempfile.NamedTemporaryFile(mode="w", suffix=f".{lang}", delete=False) as f:
                            ctx = state.get("tool_results", {})
                            if lang == "python":
                                f.write(f"import json\n_ctx = {json.dumps(ctx)}\n")
                            f.write(source)
                            tmp = f.name
                        if lang == "python":
                            result = subprocess.run(["python", tmp], capture_output=True, text=True, timeout=15)
                        else:
                            result = subprocess.run(["node", tmp], capture_output=True, text=True, timeout=15)
                        output = result.stdout.strip() if result.returncode == 0 else result.stderr.strip()
                        try:
                            os.unlink(tmp)
                        except Exception:
                            pass
                    except Exception as e:
                        output = str(e)
                    tool_results = {**state.get("tool_results", {}), code_nid: output}
                    return {"tool_results": tool_results}

                return fn

            graph.add_node(nid, make_code_fn(nid, nconfig))

    # Add edges based on topological order
    for i in range(len(order) - 1):
        graph.add_edge(order[i], order[i + 1])
    if order:
        graph.set_entry_point(order[0])
        graph.add_edge(order[-1], END)

    return graph.compile()
