import json
import subprocess
import tempfile

import httpx
from langchain_core.tools import tool
from sqlalchemy import create_engine, text


@tool
def http_call(url: str, method: str = "GET", headers: str = "{}", body: str = "{}") -> str:
    """Make an HTTP request to an external API. Returns the response body as a string.
    
    Args:
        url: The URL to call
        method: HTTP method (GET, POST, PUT, DELETE)
        headers: JSON string of headers
        body: JSON string of request body (for POST/PUT)
    """
    try:
        parsed_headers = json.loads(headers) if isinstance(headers, str) else headers
        parsed_body = json.loads(body) if isinstance(body, str) else body
    except json.JSONDecodeError as e:
        return json.dumps({"error": f"Invalid JSON in headers or body: {str(e)}"})

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.request(
                method=method.upper(),
                url=url,
                headers=parsed_headers,
                json=parsed_body if method.upper() in ("POST", "PUT", "PATCH") else None,
            )
            response.raise_for_status()
            return json.dumps({"status_code": response.status_code, "body": response.text})
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"HTTP {e.response.status_code}: {e.response.text}"})
    except httpx.RequestError as e:
        return json.dumps({"error": f"Request failed: {str(e)}"})


@tool
def db_query(connection_string: str, query: str) -> str:
    """Execute a SQL query against a database. Returns results as a JSON string.
    Only SELECT queries are allowed for safety.

    Args:
        connection_string: Database connection string (e.g., postgresql://user:pass@host/db)
        query: SQL SELECT query to execute
    """
    query_stripped = query.strip().upper()
    if not query_stripped.startswith("SELECT"):
        return json.dumps({"error": "Only SELECT queries are allowed"})

    try:
        engine = create_engine(connection_string)
        with engine.connect() as conn:
            result = conn.execute(text(query))
            rows = [dict(row._mapping) for row in result]
            return json.dumps({"rows": rows, "count": len(rows)}, default=str)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def run_code(language: str, source_code: str, context: str = "{}") -> str:
    """Execute a code snippet in a subprocess. Supports Python and JavaScript.
    Returns the stdout output or error.

    Args:
        language: Programming language ('python' or 'javascript')
        source_code: The source code to execute
        context: JSON string of variables available to the code
    """
    try:
        ctx = json.loads(context) if isinstance(context, str) else context
    except json.JSONDecodeError:
        return json.dumps({"error": "Invalid JSON in context parameter"})

    with tempfile.NamedTemporaryFile(mode="w", suffix=".py" if language == "python" else ".js", delete=False) as f:
        if language == "python":
            f.write("import json\n")
            f.write(f"_context = {json.dumps(ctx)}\n")
            f.write(source_code)
        elif language == "javascript":
            f.write(f"const _context = {json.dumps(ctx)};\n")
            f.write(source_code)
        else:
            return json.dumps({"error": f"Unsupported language: {language}"})
        temp_path = f.name

    try:
        if language == "python":
            result = subprocess.run(["python", temp_path], capture_output=True, text=True, timeout=15)
        else:
            result = subprocess.run(["node", temp_path], capture_output=True, text=True, timeout=15)

        if result.returncode != 0:
            return json.dumps({"error": result.stderr or result.stdout})
        return json.dumps({"output": result.stdout.strip()})
    except subprocess.TimeoutExpired:
        return json.dumps({"error": "Code execution timed out (15s)"})
    except FileNotFoundError:
        return json.dumps({"error": f"Runtime not found for language: {language}"})
    except Exception as e:
        return json.dumps({"error": str(e)})
    finally:
        import os
        try:
            os.unlink(temp_path)
        except OSError:
            pass
