import json
from datetime import datetime, timezone
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
    execution_steps: list


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

    node_map = {str(n.id): n for n in nodes}
    children = {str(n.id): [] for n in nodes}
    for e in edges:
        children.setdefault(str(e.source_node_id), []).append(str(e.target_node_id))

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

    # Mark all nodes as pending
    all_node_ids = {str(n.id) for n in nodes}

    graph = StateGraph(AgentState)

    def mark_step(state: AgentState, nid: str, ntype: str, nlabel: str, status: str) -> dict:
        steps = list(state.get("execution_steps", []))
        now = datetime.now(timezone.utc).isoformat()
        for s in steps:
            if s["node_id"] == nid:
                s["status"] = status
                s["completed_at"] = now
                return {"execution_steps": steps}
        steps.append({
            "node_id": nid, "type": ntype, "label": nlabel,
            "status": status, "started_at": now, "completed_at": now,
        })
        return {"execution_steps": steps}

    for n in nodes:
        nid = str(n.id)
        ntype = n.type
        nlabel = n.label or ntype
        nconfig = n.config or {}

        if ntype == "start":

            def make_start_fn(sid, stype, slabel):
                def fn(state: AgentState) -> dict:
                    return mark_step(state, sid, stype, slabel, "success")
                return fn

            graph.add_node(nid, make_start_fn(nid, ntype, nlabel))

        elif ntype == "end":

            def make_end_fn(sid, stype, slabel):
                def fn(state: AgentState) -> dict:
                    return mark_step(state, sid, stype, slabel, "success")
                return fn

            graph.add_node(nid, make_end_fn(nid, ntype, nlabel))

        elif ntype == "llm":

            def make_llm_fn(sid, stype, slabel, llm_config, _llm=llm):
                def fn(state: AgentState) -> dict:
                    # Mark as running
                    steps = list(state.get("execution_steps", []))
                    now = datetime.now(timezone.utc).isoformat()
                    steps.append({"node_id": sid, "type": stype, "label": slabel, "status": "running", "started_at": now})
                    state = {**state, "execution_steps": steps}

                    msgs = state["messages"]
                    tool_results = state.get("tool_results", {})
                    input_data = state.get("input", {})

                    try:
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
                        update = mark_step(state, sid, stype, slabel, "success")
                        return {"messages": [resp], "tool_results": tool_results, "execution_steps": update.get("execution_steps", [])}
                    except Exception as e:
                        update = mark_step(state, sid, stype, slabel, "failed")
                        return {"messages": [HumanMessage(content=f"Error: {e}")], "tool_results": tool_results, "execution_steps": update.get("execution_steps", [])}

                return fn

            graph.add_node(nid, make_llm_fn(nid, ntype, nlabel, nconfig))

        elif ntype == "http":

            def make_http_fn(sid, stype, slabel, http_config):
                def fn(state: AgentState) -> dict:
                    steps = list(state.get("execution_steps", []))
                    now = datetime.now(timezone.utc).isoformat()
                    steps.append({"node_id": sid, "type": stype, "label": slabel, "status": "running", "started_at": now})

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

                    tool_results = {**state.get("tool_results", {}), sid: data}
                    update = mark_step(state, sid, stype, slabel, "failed" if "error" in str(data) else "success")
                    return {"tool_results": tool_results, "execution_steps": update.get("execution_steps", [])}

                return fn

            graph.add_node(nid, make_http_fn(nid, ntype, nlabel, nconfig))

        elif ntype == "db":

            def make_db_fn(sid, stype, slabel, db_config):
                def fn(state: AgentState) -> dict:
                    steps = list(state.get("execution_steps", []))
                    now = datetime.now(timezone.utc).isoformat()
                    steps.append({"node_id": sid, "type": stype, "label": slabel, "status": "running", "started_at": now})

                    conn_str = db_config.get("connection_string", "")
                    query = db_config.get("query", "")
                    try:
                        from sqlalchemy import create_engine, text
                        engine = create_engine(conn_str)
                        with engine.connect() as conn:
                            rows = [dict(r._mapping) for r in conn.execute(text(query))]
                    except Exception as e:
                        rows = {"error": str(e)}
                    tool_results = {**state.get("tool_results", {}), sid: rows}
                    update = mark_step(state, sid, stype, slabel, "failed" if isinstance(rows, dict) and "error" in rows else "success")
                    return {"tool_results": tool_results, "execution_steps": update.get("execution_steps", [])}

                return fn

            graph.add_node(nid, make_db_fn(nid, ntype, nlabel, nconfig))

        elif ntype == "code":

            def make_code_fn(sid, stype, slabel, code_config):
                def fn(state: AgentState) -> dict:
                    steps = list(state.get("execution_steps", []))
                    now = datetime.now(timezone.utc).isoformat()
                    steps.append({"node_id": sid, "type": stype, "label": slabel, "status": "running", "started_at": now})

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
                    tool_results = {**state.get("tool_results", {}), sid: output}
                    update = mark_step(state, sid, stype, slabel, "success")
                    return {"tool_results": tool_results, "execution_steps": update.get("execution_steps", [])}

                return fn

            graph.add_node(nid, make_code_fn(nid, ntype, nlabel, nconfig))

    for i in range(len(order) - 1):
        graph.add_edge(order[i], order[i + 1])
    if order:
        graph.set_entry_point(order[0])
        graph.add_edge(order[-1], END)

    return graph.compile()
