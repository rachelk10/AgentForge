import ast
import subprocess
import sys
from typing import Any

from app.runtime.tools import tool_registry


def _with_trailing_expression_printed(code: str) -> str:
    """Rewrite a trailing bare expression so its value is printed, REPL-style.

    LLMs often write notebook-style code whose last line is a bare expression.
    Under ``python -c`` that value is discarded, which produces empty output
    and confuses the calling model into retrying the same code.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return code
    if not tree.body or not isinstance(tree.body[-1], ast.Expr):
        return code
    last = tree.body[-1]
    segment = ast.get_source_segment(code, last.value)
    if segment is None:
        return code
    lines = code.splitlines()
    indent = lines[last.lineno - 1][: last.col_offset]
    return "\n".join(
        [
            *lines[: last.lineno - 1],
            f"{indent}_agentforge_result_ = ({segment})",
            f"{indent}if _agentforge_result_ is not None:",
            f"{indent}    print(_agentforge_result_)",
        ]
    )


def run_python(arguments: dict[str, Any]) -> dict[str, str]:
    code = arguments["code"]
    try:
        completed = subprocess.run(
            [sys.executable, "-I", "-c", _with_trailing_expression_printed(code)],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"output": "", "error": "Python execution timed out"}

    output = completed.stdout
    error = completed.stderr
    if completed.returncode != 0 and not error:
        error = f"Python process exited with code {completed.returncode}"
    if not output and not error:
        output = "Code ran successfully but produced no output. Use print() to return results."
    return {"output": output, "error": error}


def register_builtin_tools() -> None:
    tool_registry.register("run_python", run_python)