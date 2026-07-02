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

    # Build adjacency and reverse adjacency for routing / condition context
    children = {str(n.id): [] for n in nodes}
    incoming_sources = {str(n.id): [] for n in nodes}
    # Edge data by (source, handle): store target for handle-based routing
    handle_edges: dict[str, dict[str, str]] = {}
    for e in edges:
        src = str(e.source_node_id)
        tgt = str(e.target_node_id)
        src_node = node_by_id.get(src)
        route_key = e.source_handle or ""
        if not route_key and src_node and src_node.type in ("if_else", "loop"):
            route_key = (e.condition or "").strip()
        children.setdefault(src, []).append(tgt)
        incoming_sources.setdefault(tgt, []).append(src)
        if route_key:
            handle_edges.setdefault(src, {})[route_key] = tgt

    # Topological sort — exclude loop children (they're only executed inside the loop)
    topo_nodes = {k: v for k, v in node_map.items() if not v.parent_id}
    in_degree = {k: 0 for k in topo_nodes}
    for e in edges:
        target = str(e.target_node_id)
        if target in in_degree:
            in_degree[target] += 1
    order = []
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    while queue:
        nid = queue.pop(0)
        order.append(nid)
        for child in children.get(nid, []):
            if child not in in_degree:
                continue
            in_degree[child] -= 1
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

    def build_condition_context(state: AgentState, nid: str) -> tuple[dict, object | None]:
        outputs = dict(state.get("node_outputs", {}))
        upstream_output = None
        for upstream_id in incoming_sources.get(nid, []):
            if upstream_id in outputs:
                upstream_output = outputs[upstream_id]

        context = dict(outputs)
        if isinstance(upstream_output, dict):
            for key, value in upstream_output.items():
                context.setdefault(key, value)
        elif upstream_output is not None:
            context.setdefault("value", upstream_output)
        context["_upstream"] = upstream_output
        return context, upstream_output

    def normalize_selector(selector) -> list:
        if isinstance(selector, list):
            parts = selector
        elif isinstance(selector, str):
            parts = [part.strip() for part in selector.split('.') if part.strip()]
        else:
            parts = []

        normalized = []
        for part in parts:
            if isinstance(part, int):
                normalized.append(part)
            elif isinstance(part, str) and part.isdigit():
                normalized.append(int(part))
            else:
                normalized.append(part)
        return normalized

    def build_llm_messages(system_text: str, input_data: dict, tool_results: dict, node_outputs: dict) -> list[BaseMessage]:
        user_text = str(input_data) if input_data else "Process the request."
        context_parts = []
        if tool_results:
            context_parts.append("Previous tool results:")
            for tool_name, result in tool_results.items():
                context_parts.append(f"{tool_name}: {json.dumps(result, indent=2, ensure_ascii=False)}")
        if node_outputs:
            context_parts.append("Previous node outputs:")
            for output_node_id, value in node_outputs.items():
                context_parts.append(f"{output_node_id}: {json.dumps(value, indent=2, ensure_ascii=False)}")

        prompt_parts: list[BaseMessage] = []
        if system_text:
            prompt_parts.append(SystemMessage(content=system_text))
        prompt_text = f"{'\n'.join(context_parts)}\nUser request: {user_text}" if context_parts else user_text
        prompt_parts.append(HumanMessage(content=prompt_text))
        return prompt_parts

    def resolve_case_label(route_owner_id: str, case_id: str) -> str:
        if not case_id:
            return case_id
        target_id = handle_edges.get(route_owner_id, {}).get(case_id)
        target_node = node_by_id.get(str(target_id)) if target_id else None
        return (target_node.label or case_id) if target_node else case_id

    def resolve_if_cases(if_config: dict) -> list[dict]:
        cases = if_config.get("cases", [])
        if cases:
            return cases

        selector = normalize_selector(if_config.get("selector") or if_config.get("field_path") or "text")
        default_operator = if_config.get("operator", "is")
        branches = if_config.get("branches", [])
        resolved_cases = []
        for branch in branches:
            case_id = branch.get("case_id", "")
            if not case_id:
                continue
            if branch.get("conditions"):
                resolved_cases.append({"case_id": case_id, "conditions": branch.get("conditions", [])})
                continue
            condition = {
                "variable_selector": normalize_selector(branch.get("selector")) or selector,
                "operator": branch.get("operator", default_operator),
            }
            if "value" in branch:
                condition["value"] = branch.get("value")
            resolved_cases.append({"case_id": case_id, "conditions": [condition]})
        return resolved_cases

    for n in nodes:
        if n.parent_id:
            continue
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
                                payload = json.dumps(ctx, ensure_ascii=False)
                                f.write("import json\n")
                                f.write(f"_ctx = json.loads({payload!r})\n")
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
                    condition_context, upstream_output = build_condition_context(state, sid)
                    cases = resolve_if_cases(if_config)
                    matched = None
                    for case in cases:
                        conds = case.get("conditions", [])
                        if evaluate_conditions(conds, condition_context):
                            matched = case.get("case_id", "")
                            break
                    if not matched:
                        matched = if_config.get("default_case_id", "default")
                    matched_label = resolve_case_label(sid, matched)
                    s1 = mark_step(state, sid, stype, slabel, "success")
                    s2 = set_output(state, sid, {"matched_case": matched_label, "matched_case_key": matched, "upstream_output": upstream_output})
                    return {**s1, **s2}
                return fn
            graph.add_node(nid, make_if_else_fn(nid, ntype, nlabel, nconfig))

            # Route to matching case handle
            def make_if_route(_nid=nid):
                def route(state):
                    outputs = state.get("node_outputs", {})
                    matched = outputs.get(_nid, {}).get("matched_case_key") or outputs.get(_nid, {}).get("matched_case", "default")
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
                    max_iter = int(loop_config.get("max_iterations", 5))
                    condition_cfg = loop_config.get("condition", {})
                    start_node_id = str(loop_config.get("start_node_id", ""))
                    end_node_id = str(loop_config.get("end_node_id", ""))

                    child_nodes = [n for n in nodes if str(getattr(n, "parent_id", "")) == sid]
                    child_ids = [str(c.id) for c in child_nodes]
                    child_edges = [
                        e for e in edges
                        if str(e.source_node_id) in child_ids and str(e.target_node_id) in child_ids
                    ]

                    if not child_nodes:
                        s1 = mark_step(state, sid, stype, slabel, "success")
                        s2 = set_output(state, sid, {"iterations": 0})
                        return {**s1, **s2}

                    child_map = {str(c.id): c for c in child_nodes}
                    child_in = {str(c.id): 0 for c in child_nodes}
                    child_out = {str(c.id): [] for c in child_nodes}
                    child_handle_routes: dict[str, dict[str, str]] = {}
                    for e in child_edges:
                        src = str(e.source_node_id)
                        tgt = str(e.target_node_id)
                        src_node = child_map.get(src)
                        route_key = e.source_handle or ""
                        if not route_key and src_node and src_node.type == "if_else":
                            route_key = (e.condition or "").strip()
                        child_in[tgt] = child_in.get(tgt, 0) + 1
                        child_out.setdefault(src, []).append(tgt)
                        if route_key:
                            child_handle_routes.setdefault(src, {})[route_key] = tgt
                    child_order = []
                    child_in_work = dict(child_in)
                    cq = [cid for cid, d in child_in_work.items() if d == 0]
                    while cq:
                        cid = cq.pop(0)
                        child_order.append(cid)
                        for nxt in child_out.get(cid, []):
                            child_in_work[nxt] -= 1
                            if child_in_work[nxt] == 0:
                                cq.append(nxt)
                    child_rank = {cid: idx for idx, cid in enumerate(child_order)}

                    def execute_child_node(cur_state: AgentState, cid: str) -> tuple[AgentState, str | None]:
                        child = child_map.get(cid)
                        if not child:
                            return cur_state, None
                        ctypes = child.type or "pass"
                        ccfg = child.config or {}
                        clabel = child.label or ctypes

                        try:
                            if ctypes == "llm":
                                input_data = cur_state.get("input", {})
                                tool_results = cur_state.get("tool_results", {})
                                node_outputs = cur_state.get("node_outputs", {})
                                system_text = ccfg.get("system_prompt", "")
                                msgs = build_llm_messages(system_text, input_data, tool_results, node_outputs)
                                resp = llm.invoke(msgs)
                                output_content = resp.content if hasattr(resp, "content") else str(resp)
                                cur_state["messages"] = [resp]
                                cur_state = {**cur_state, **set_output(cur_state, cid, {"text": output_content})}
                                cur_state = {**cur_state, **mark_step(cur_state, cid, ctypes, clabel, "success")}
                                return cur_state, None

                            if ctypes == "http":
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
                                        r = client.request(method=method, url=url, headers=headers, json=body if method.upper() in ("POST", "PUT", "PATCH") else None)
                                        r.raise_for_status()
                                        data = r.json() if "application/json" in r.headers.get("content-type", "") else r.text
                                except Exception as e2:
                                    data = {"error": str(e2)}
                                cur_state = {**cur_state, **set_output(cur_state, cid, data if isinstance(data, dict) else {"result": data})}
                                cur_state = {**cur_state, **mark_step(cur_state, cid, ctypes, clabel, "failed" if isinstance(data, dict) and "error" in data else "success")}
                                return cur_state, None

                            if ctypes == "code":
                                lang = ccfg.get("language", "python")
                                source = ccfg.get("source_code", "")
                                try:
                                    import subprocess, tempfile, os
                                    with tempfile.NamedTemporaryFile(mode="w", suffix=f".{lang}", delete=False) as f:
                                        tx_ctx = cur_state.get("tool_results", {})
                                        if lang == "python":
                                            payload = json.dumps(tx_ctx, ensure_ascii=False)
                                            f.write("import json\n")
                                            f.write(f"_ctx = json.loads({payload!r})\n")
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
                                cur_state = {**cur_state, **set_output(cur_state, cid, {"result": output})}
                                cur_state = {**cur_state, **mark_step(cur_state, cid, ctypes, clabel, "success")}
                                return cur_state, None

                            if ctypes == "if_else":
                                condition_context, upstream_output = build_condition_context(cur_state, cid)
                                cases = resolve_if_cases(ccfg)
                                matched = None
                                for case in cases:
                                    conds = case.get("conditions", [])
                                    if evaluate_conditions(conds, condition_context):
                                        matched = case.get("case_id", "")
                                        break
                                if not matched:
                                    matched = ccfg.get("default_case_id", "default")
                                matched_label = resolve_case_label(cid, matched)
                                cur_state = {**cur_state, **mark_step(cur_state, cid, ctypes, clabel, "success")}
                                cur_state = {**cur_state, **set_output(cur_state, cid, {"matched_case": matched_label, "matched_case_key": matched, "upstream_output": upstream_output})}
                                return cur_state, matched

                            cur_state = {**cur_state, **set_output(cur_state, cid, {"status": "ok"})}
                            cur_state = {**cur_state, **mark_step(cur_state, cid, ctypes, clabel, "success")}
                            return cur_state, None

                        except Exception as ex:
                            cur_state = {**cur_state, **set_output(cur_state, cid, {"error": str(ex)})}
                            cur_state = {**cur_state, **mark_step(cur_state, cid, ctypes, clabel, "failed")}
                            return cur_state, None

                    def next_child_nodes(cid: str, matched_case: str | None) -> list[str]:
                        if cid == end_node_id and end_node_id:
                            return []
                        child = child_map.get(cid)
                        if child and child.type == "if_else":
                            route_map = child_handle_routes.get(cid, {})
                            target = route_map.get(matched_case or "")
                            if target:
                                return [target]
                            default_target = route_map.get("default")
                            if default_target:
                                return [default_target]
                            # No route for matched case — skip to first non-branch node in topo order
                            branch_targets = set(route_map.values())
                            idx = child_rank.get(cid, -1)
                            for i in range(idx + 1, len(child_order)):
                                if child_order[i] not in branch_targets:
                                    return [child_order[i]]
                            return []
                        return sorted(child_out.get(cid, []), key=lambda nxt: child_rank.get(nxt, 10**9))

                    entry_nodes = [cid for cid, degree in child_in.items() if degree == 0]
                    entry_nodes = sorted(entry_nodes, key=lambda cid: child_rank.get(cid, 10**9))
                    if start_node_id in child_map:
                        entry_nodes = [start_node_id]
                    elif entry_nodes:
                        entry_nodes = [entry_nodes[0]]

                    executed_iterations = 0
                    for iteration in range(max_iter):
                        if iteration > 0 and condition_cfg:
                            node_outputs = state.get("node_outputs", {})
                            if not evaluate_conditions([condition_cfg], node_outputs):
                                break

                        step = mark_step(state, sid, stype, slabel, "running")
                        state = {**state, **step}
                        iter_id = f"{sid}_iter{iteration}"
                        state.setdefault("execution_steps", []).append({
                            "node_id": iter_id, "type": "loop_iter",
                            "label": f"Iter {iteration+1}", "status": "running",
                            "started_at": datetime.now(timezone.utc).isoformat(),
                        })

                        queue = list(entry_nodes)
                        seen: set[str] = set()
                        while queue:
                            cid = queue.pop(0)
                            if cid in seen:
                                continue
                            seen.add(cid)
                            state, matched_case = execute_child_node(state, cid)
                            next_nodes = next_child_nodes(cid, matched_case)
                            for nxt in next_nodes:
                                if nxt not in seen:
                                    queue.append(nxt)

                        steps = list(state.get("execution_steps", []))
                        now = datetime.now(timezone.utc).isoformat()
                        for s in steps:
                            if s.get("node_id") == iter_id:
                                s["status"] = "success"
                                s["completed_at"] = now
                                break
                        state["execution_steps"] = steps

                        executed_iterations += 1

                    s1 = mark_step(state, sid, stype, slabel, "success")
                    s2 = set_output(state, sid, {"iterations": executed_iterations})
                    return {**s1, **s2}
                return fn
            graph.add_node(nid, make_loop_fn(nid, ntype, nlabel, nconfig))

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
