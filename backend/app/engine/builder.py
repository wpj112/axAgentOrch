import json
from datetime import datetime, timezone
from typing import Annotated, TypedDict

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

from app.config import settings
from app.engine.condition import evaluate_conditions


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    input: dict
    tool_results: dict
    node_outputs: dict
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
    node_by_id = {str(n.id): n for n in nodes}

    # Build adjacency: children[node_id] = [target_node_id]
    children = {str(n.id): [] for n in nodes}
    # Edge data by (source, handle): store target for handle-based routing
    handle_edges: dict[str, dict[str, str]] = {}
    for e in edges:
        src = str(e.source_node_id)
        tgt = str(e.target_node_id)
        handle = e.source_handle or ""
        children.setdefault(src, []).append(tgt)
        if handle:
            handle_edges.setdefault(src, {})[handle] = tgt

    # Topological sort (for normal nodes, excluding loop internals)
    in_degree = {k: 0 for k in node_map}
    for e in edges:
        target = str(e.target_node_id)
        in_degree[target] = in_degree.get(target, 0) + 1
    order = []
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    while queue:
        nid = queue.pop(0)
        order.append(nid)
        for child in children.get(nid, []):
            in_degree[child] = in_degree.get(child, 0) - 1
            if in_degree[child] == 0:
                queue.append(child)

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

    def set_output(state: AgentState, nid: str, data: dict) -> dict:
        outputs = dict(state.get("node_outputs", {}))
        outputs[nid] = data
        return {"node_outputs": outputs}

    for n in nodes:
        nid = str(n.id)
        ntype = n.type
        nlabel = n.label or ntype
        nconfig = n.config or {}

        if ntype in ("start",):
            def make_start_fn(sid, stype, slabel):
                def fn(state: AgentState) -> dict:
                    s1 = mark_step(state, sid, stype, slabel, "success")
                    s2 = set_output(state, sid, {"status": "ok"})
                    return {**s1, **s2}
                return fn
            graph.add_node(nid, make_start_fn(nid, ntype, nlabel))

        elif ntype == "end":
            def make_end_fn(sid, stype, slabel):
                def fn(state: AgentState) -> dict:
                    s1 = mark_step(state, sid, stype, slabel, "success")
                    s2 = set_output(state, sid, {"status": "ok"})
                    return {**s1, **s2}
                return fn
            graph.add_node(nid, make_end_fn(nid, ntype, nlabel))

        elif ntype == "llm":
            def make_llm_fn(sid, stype, slabel, llm_config, _llm=llm):
                def fn(state: AgentState) -> dict:
                    steps = list(state.get("execution_steps", []))
                    now = datetime.now(timezone.utc).isoformat()
                    steps.append({"node_id": sid, "type": stype, "label": slabel, "status": "running", "started_at": now})
                    state = {**state, "execution_steps": steps}

                    msgs = state["messages"]
                    tool_results = state.get("tool_results", {})
                    input_data = state.get("input", {})
                    node_outputs = state.get("node_outputs", {})
                    output_content = ""

                    try:
                        if not msgs:
                            user_text = str(input_data) if input_data else "Process the request."
                            system_text = llm_config.get("system_prompt", "")

                            context = ""
                            if tool_results:
                                context = "Previous tool results:\n"
                                for tool_name, result in tool_results.items():
                                    context += f"{tool_name}: {json.dumps(result, indent=2, ensure_ascii=False)}\n"
                            if node_outputs:
                                context += "\nPrevious node outputs:\n"
                                for nid_val, val in node_outputs.items():
                                    context += f"{nid_val}: {json.dumps(val, indent=2, ensure_ascii=False)}\n"

                            prompt_parts = []
                            if system_text:
                                prompt_parts.append(SystemMessage(content=system_text))
                            prompt_text = f"{context}\nUser request: {user_text}" if context else user_text
                            prompt_parts.append(HumanMessage(content=prompt_text))
                            msgs = prompt_parts

                        resp = _llm.invoke(msgs)
                        output_content = resp.content if hasattr(resp, "content") else str(resp)
                        s1 = mark_step(state, sid, stype, slabel, "success")
                        s2 = set_output(state, sid, {"text": output_content})
                        return {"messages": [resp], "tool_results": tool_results, "execution_steps": s1.get("execution_steps", []), "node_outputs": s2.get("node_outputs", {})}
                    except Exception as e:
                        s1 = mark_step(state, sid, stype, slabel, "failed")
                        s2 = set_output(state, sid, {"error": str(e)})
                        return {"messages": [HumanMessage(content=f"Error: {e}")], "tool_results": tool_results, "execution_steps": s1.get("execution_steps", []), "node_outputs": s2.get("node_outputs", {})}
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
                    s1 = mark_step(state, sid, stype, slabel, "failed" if "error" in str(data) else "success")
                    s2 = set_output(state, sid, data if isinstance(data, dict) else {"result": data})
                    return {"tool_results": tool_results, "execution_steps": s1.get("execution_steps", []), "node_outputs": s2.get("node_outputs", {})}
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
                    s1 = mark_step(state, sid, stype, slabel, "failed" if isinstance(rows, dict) and "error" in rows else "success")
                    s2 = set_output(state, sid, rows if isinstance(rows, list) else rows)
                    return {"tool_results": tool_results, "execution_steps": s1.get("execution_steps", []), "node_outputs": s2.get("node_outputs", {})}
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
                    s1 = mark_step(state, sid, stype, slabel, "success")
                    s2 = set_output(state, sid, {"result": output})
                    return {"tool_results": tool_results, "execution_steps": s1.get("execution_steps", []), "node_outputs": s2.get("node_outputs", {})}
                return fn
            graph.add_node(nid, make_code_fn(nid, ntype, nlabel, nconfig))

        elif ntype == "if_else":
            def make_if_else_fn(sid, stype, slabel, if_config):
                def fn(state: AgentState) -> dict:
                    node_outputs = state.get("node_outputs", {})
                    cases = if_config.get("cases", [])
                    matched = None
                    for case in cases:
                        conds = case.get("conditions", [])
                        if evaluate_conditions(conds, node_outputs):
                            matched = case.get("case_id", "")
                            break
                    if not matched:
                        matched = if_config.get("default_case_id", "default")
                    s1 = mark_step(state, sid, stype, slabel, "success")
                    s2 = set_output(state, sid, {"matched_case": matched})
                    return {**s1, **s2}
                return fn
            graph.add_node(nid, make_if_else_fn(nid, ntype, nlabel, nconfig))

            # Route to matching case handle
            def make_if_route(_nid=nid):
                def route(state):
                    outputs = state.get("node_outputs", {})
                    matched = outputs.get(_nid, {}).get("matched_case", "default")
                    return matched
                return route
            hmap = handle_edges.get(nid, {})
            route_map = {h: t for h, t in hmap.items()}
            route_map[END] = END
            if route_map:
                graph.add_conditional_edges(nid, make_if_route(), route_map)
            else:
                graph.add_edge(nid, END)

        elif ntype == "loop":
            def make_loop_fn(sid, stype, slabel, loop_config):
                def fn(state: AgentState) -> dict:
                    max_iter = loop_config.get("max_iterations", 5)
                    condition_cfg = loop_config.get("condition", {})
                    start_node_id = str(loop_config.get("start_node_id", ""))
                    end_node_id = str(loop_config.get("end_node_id", ""))

                    # Find child nodes (marked by parent_id == sid)
                    child_nodes = [n for n in nodes if str(getattr(n, "parent_id", "")) == sid]
                    child_edges = [e for e in edges if str(e.source_node_id) in [str(c.id) for c in child_nodes] and str(e.target_node_id) in [str(c.id) for c in child_nodes]]

                    if not child_nodes or not start_node_id:
                        s1 = mark_step(state, sid, stype, slabel, "success")
                        s2 = set_output(state, sid, {"iterations": 0})
                        return {**s1, **s2}

                    # Build child execution order via topological sort
                    child_map = {str(c.id): c for c in child_nodes}
                    child_in = {str(c.id): 0 for c in child_nodes}
                    child_out = {str(c.id): [] for c in child_nodes}
                    for e in child_edges:
                        src = str(e.source_node_id)
                        tgt = str(e.target_node_id)
                        child_in[tgt] = child_in.get(tgt, 0) + 1
                        child_out.setdefault(src, []).append(tgt)
                    child_order = []
                    cq = [cid for cid, d in child_in.items() if d == 0]
                    while cq:
                        cid = cq.pop(0)
                        child_order.append(cid)
                        for nxt in child_out.get(cid, []):
                            child_in[nxt] -= 1
                            if child_in[nxt] == 0:
                                cq.append(nxt)

                    iteration = 0
                    for iteration in range(max_iter):
                        state = {**state, "execution_steps": [s for s in state.get("execution_steps", []) if s["node_id"] != sid]}
                        step = mark_step(state, sid, stype, slabel, "running")
                        state = {**state, **step}
                        state["execution_steps"].append({"node_id": f"{sid}_iter{iteration}", "type": "loop_iter", "label": f"Iter {iteration+1}", "status": "running", "started_at": datetime.now(timezone.utc).isoformat()})

                        # Execute each child node in order manually
                        for cid in child_order:
                            child = child_map.get(cid)
                            if not child:
                                continue
                            ctypes = child.type or "pass"
                            ccfg = child.config or {}
                            clabel = child.label or ctypes

                            try:
                                if ctypes == "llm":
                                    msgs = state.get("messages", [])
                                    input_data = state.get("input", {})
                                    tool_results = state.get("tool_results", {})
                                    node_outputs = state.get("node_outputs", {})
                                    if not msgs:
                                        user_text = str(input_data) if input_data else "Process the request."
                                        system_text = ccfg.get("system_prompt", "")
                                        context = ""
                                        if tool_results:
                                            for tn, tr in tool_results.items():
                                                context += f"{tn}: {json.dumps(tr, indent=2, ensure_ascii=False)}\n"
                                        if node_outputs:
                                            for nk, nv in node_outputs.items():
                                                context += f"{nk}: {json.dumps(nv, indent=2, ensure_ascii=False)}\n"
                                        parts = []
                                        if system_text:
                                            parts.append(SystemMessage(content=system_text))
                                        parts.append(HumanMessage(content=f"{context}\nUser request: {user_text}" if context else user_text))
                                        msgs = parts
                                    resp = llm.invoke(msgs)
                                    output_content = resp.content if hasattr(resp, "content") else str(resp)
                                    state["messages"] = state.get("messages", []) + [resp]
                                    state = {**state, **set_output(state, cid, {"text": output_content})}
                                    state = {**state, **mark_step(state, cid, ctypes, clabel, "success")}

                                elif ctypes == "http":
                                    url = ccfg.get("url", "")
                                    method = ccfg.get("method", "GET")
                                    try:
                                        headers = json.loads(ccfg.get("headers", "{}")) if isinstance(ccfg.get("headers", ""), str) else ccfg.get("headers", {})
                                    except Exception:
                                        headers = {}
                                    try:
                                        body = json.loads(ccfg.get("body", "{}")) if isinstance(ccfg.get("body", ""), str) else ccfg.get("body", {})
                                    except Exception:
                                        body = {}
                                    try:
                                        import httpx
                                        with httpx.Client(timeout=30) as client:
                                            resp2 = client.request(method=method, url=url, headers=headers, json=body if method.upper() in ("POST","PUT","PATCH") else None)
                                            resp2.raise_for_status()
                                            data = resp2.json() if "application/json" in resp2.headers.get("content-type","") else resp2.text
                                    except Exception as e2:
                                        data = {"error": str(e2)}
                                    state = {**state, **set_output(state, cid, data if isinstance(data, dict) else {"result": data})}
                                    state = {**state, **mark_step(state, cid, ctypes, clabel, "failed" if isinstance(data, dict) and "error" in data else "success")}

                                elif ctypes == "code":
                                    lang = ccfg.get("language", "python")
                                    source = ccfg.get("source_code", "")
                                    try:
                                        import subprocess, tempfile, os
                                        with tempfile.NamedTemporaryFile(mode="w", suffix=f".{lang}", delete=False) as f:
                                            ctx = state.get("tool_results", {})
                                            if lang == "python":
                                                f.write(f"import json\n_ctx = {json.dumps(ctx)}\n")
                                            f.write(source)
                                            tmp = f.name
                                        if lang == "python":
                                            subr = subprocess.run(["python", tmp], capture_output=True, text=True, timeout=15)
                                        else:
                                            subr = subprocess.run(["node", tmp], capture_output=True, text=True, timeout=15)
                                        output = subr.stdout.strip() if subr.returncode == 0 else subr.stderr.strip()
                                        try:
                                            os.unlink(tmp)
                                        except Exception:
                                            pass
                                    except Exception as e3:
                                        output = str(e3)
                                    state = {**state, **set_output(state, cid, {"result": output})}
                                    state = {**state, **mark_step(state, cid, ctypes, clabel, "success")}

                                else:
                                    state = {**state, **set_output(state, cid, {"status": "ok"})}
                                    state = {**state, **mark_step(state, cid, ctypes, clabel, "success")}
                            except Exception as ex:
                                state = {**state, **set_output(state, cid, {"error": str(ex)})}
                                state = {**state, **mark_step(state, cid, ctypes, clabel, "failed")}

                        # After executing loop body, check condition
                        node_outputs = state.get("node_outputs", {})
                        if condition_cfg and not evaluate_conditions([condition_cfg], node_outputs):
                            break

                    s1 = mark_step(state, sid, stype, slabel, "success")
                    s2 = set_output(state, sid, {"iterations": iteration + 1})
                    return {**s1, **s2}
                return fn
            graph.add_node(nid, make_loop_fn(nid, ntype, nlabel, nconfig))

            # Route to loop_exit
            hmap = handle_edges.get(nid, {})
            if "loop_exit" in hmap:
                graph.add_edge(nid, hmap["loop_exit"])
            else:
                graph.add_edge(nid, END)

    # Add default edges (topological order) for nodes that don't have explicit routing
    for i in range(len(order) - 1):
        src = order[i]
        tgt = order[i + 1]
        src_node = node_by_id.get(src)
        if src_node and src_node.type in ("if_else", "loop"):
            continue
        if src in handle_edges:
            continue
        # Ensure edge exists
        existing = [e for e in edges if str(e.source_node_id) == src and str(e.target_node_id) == tgt]
        if not existing:
            pass
        graph.add_edge(src, tgt)

    if order:
        first = order[0]
        if not hasattr(graph, "_entry_point") or not graph._entry_point:
            graph.set_entry_point(first)
        last = order[-1]
        last_node = node_by_id.get(last)
        if last_node and last_node.type != "loop":
            graph.add_edge(last, END)

    return graph.compile()
