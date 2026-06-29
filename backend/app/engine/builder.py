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
    outgoing: dict[str, list] = {str(n.id): [] for n in nodes}
    for e in edges:
        outgoing.setdefault(str(e.source_node_id), []).append(e)

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

    # Route: entry → start node(s), and per-node conditional routing
    start_nodes = [n for n in nodes if n.type == "start"]
    if start_nodes:
        graph.set_entry_point(str(start_nodes[0].id))

    # Per-node routing
    for n in nodes:
        nid = str(n.id)
        outs = outgoing.get(nid, [])
        cond_outs = [e for e in outs if e.condition]
        normal_outs = [e for e in outs if not e.condition]

        if n.type == "end":
            graph.add_edge(nid, END)
        elif nid not in graph._nodes:  # node not registered (shouldn't happen)
            pass
        elif cond_outs:
            # Has conditional edges — use conditional routing
            def make_route_fn(_cond_outs=cond_outs, _normal_outs=normal_outs):
                def route(state):
                    # Check conditions against last node output
                    result_for_match = ""
                    msgs = state.get("messages", [])
                    if msgs:
                        result_for_match = str(getattr(msgs[-1], "content", ""))
                    tools = state.get("tool_results", {})
                    last_tool = list(tools.values())[-1] if tools else None
                    if last_tool is not None:
                        result_for_match += " " + str(last_tool)

                    for e in _cond_outs:
                        cond = e.condition or ""
                        if cond == "else" or cond == "":
                            continue
                        # Match: condition string found in output
                        if "==" in cond:
                            k, v = cond.split("==", 1)
                            k, v = k.strip(), v.strip().strip('"').strip("'")
                            if isinstance(last_tool, dict) and str(last_tool.get(k, "")) == v:
                                return str(e.target_node_id)
                        if cond in result_for_match:
                            return str(e.target_node_id)
                    # Fallback to normal edge or "else" condition
                    for e in _cond_outs:
                        if e.condition == "else":
                            return str(e.target_node_id)
                    if _normal_outs:
                        return str(_normal_outs[0].target_node_id)
                    return END
                return route
            path_map = {str(e.target_node_id): str(e.target_node_id) for e in cond_outs + normal_outs}
            path_map[END] = END
            graph.add_conditional_edges(nid, make_route_fn(), path_map)
        elif normal_outs:
            for e in normal_outs:
                graph.add_edge(nid, str(e.target_node_id))
        else:
            graph.add_edge(nid, END)

    return graph.compile()
