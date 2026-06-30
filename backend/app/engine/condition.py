"""Condition evaluator for IfElseNode and LoopNode.

Operators:
  is        — actual value equals target value
  not_empty — actual value is not None/empty
  lt        — actual value is less than target value
  gte       — actual value is greater than or equal to target value
"""

import numbers


def evaluate_conditions(
    conditions: list[dict],
    node_outputs: dict,
) -> bool:
    """Return True if ALL conditions match (AND logic)."""
    for cond in conditions:
        if not _evaluate_single(cond, node_outputs):
            return False
    return True


def _evaluate_single(cond: dict, node_outputs: dict) -> bool:
    selector = cond.get("variable_selector", [])
    operator = cond.get("operator", "is")
    target = cond.get("value")

    # Resolve variable from node_outputs
    actual = _resolve(selector, node_outputs)
    op = operator.lower()

    if op == "not_empty":
        return actual is not None and actual != "" and actual != []

    if op == "is":
        return str(actual) == str(target)

    # Numeric comparisons
    try:
        a = float(actual) if actual is not None else 0
        t = float(target) if target is not None else 0
    except (ValueError, TypeError):
        return False

    if op == "lt":
        return a < t
    if op == "gte":
        return a >= t

    return False


def _resolve(selector: list, node_outputs: dict):
    """Resolve a variable_selector like ['node_id', 'field'] from node_outputs."""
    if not selector:
        return None
    current = node_outputs
    for key in selector:
        if isinstance(current, dict):
            current = current.get(key)
        elif isinstance(current, list) and isinstance(key, int) and key < len(current):
            current = current[key]
        else:
            return None
    return current
