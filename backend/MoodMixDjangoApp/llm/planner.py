# MoodMixDjangoApp/llm/planner.py

import os
import re
import json
from typing import Any, Dict, List, Optional

from pydantic import ValidationError
from openai import OpenAI

from .planner_schema import MoodPlan


# =============================================================================
# Config / Client
# =============================================================================
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5")    # your requested default
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL")       # optional (Azure/proxy/gateway)

def _get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set. Add it to your environment or .env.")
    kwargs: Dict[str, Any] = {"api_key": api_key}
    if OPENAI_BASE_URL:
        kwargs["base_url"] = OPENAI_BASE_URL
    return OpenAI(**kwargs)


# =============================================================================
# Helpers
# =============================================================================
_ALLOWED_LEVELS = [
    "very_low", "low", "medium_low", "medium", "medium_high", "high", "very_high",
]
_ALLOWED_ORDERING = [
    "strong opener", "energy climb", "peak", "crowd chant", "soft landing", "cool-down", "encore",
]

SYSTEM_MSG = "\n".join([
    "You are a playlist planning assistant.",
    "Output ONLY a single JSON object that matches the provided JSON Schema exactly. No prose, no code fences.",
    "",
    "Constraints:",
    "• `plan` MUST be an object with keys: `themes`, `candidate_buckets`, `novelty_ratio`, `ordering`.",
    "• `ordering` MUST contain 3–6 items chosen ONLY from: [strong opener, energy climb, peak, crowd chant, soft landing, cool-down, encore].",
    "• Do NOT put genres/eras in `ordering`; those belong in `themes`/`candidate_buckets`.",
    "• `constraints.energy` and `constraints.danceability` MUST be exactly one of: [very_low, low, medium_low, medium, medium_high, high, very_high].",
    "• Use concrete musical language; do NOT include track IDs.",
])

def infer_length_from_text(text: str, default_len: int = 10) -> int:
    m = re.search(r"\b(\d{1,3})\b", text or "")
    if not m:
        return default_len
    n = int(m.group(1))
    if n <= 4:
        return 4
    if n >= 10:
        return 10
    return n  # 5..9

def _normalize_level(val: Optional[str]) -> Optional[str]:
    if not isinstance(val, str):
        return None
    s = val.strip().lower().replace(" ", "_").replace("-", "_")
    synonyms = {
        "verylow": "very_low",
        "ultra_low": "very_low",
        "super_low": "very_low",
        "mid_low": "medium_low",
        "mediumlow": "medium_low",
        "moderate": "medium",
        "moderate_to_low": "medium_low",
        "moderate_to_high": "medium_high",
        "moderate_high": "medium_high",
        "veryhigh": "very_high",
        "ultra_high": "very_high",
        "super_high": "very_high",
    }
    s = synonyms.get(s, s)
    if s in _ALLOWED_LEVELS:
        return s
    if "very" in s and "low" in s:
        return "very_low"
    if "very" in s and "high" in s:
        return "very_high"
    if "high" in s and "medium" in s:
        return "medium_high"
    if "low" in s and "medium" in s:
        return "medium_low"
    if "high" in s:
        return "high"
    if "low" in s:
        return "low"
    if "medium" in s or "moderate" in s:
        return "medium"
    return None

def _coerce_to_allowed_ordering(ordering: List[str]) -> List[str]:
    cleaned: List[str] = []
    for s in ordering[:6]:
        if not isinstance(s, str):
            continue
        t = s.strip()
        base = t.lower()
        if base in {"opener", "intro"}:
            t = "strong opener"
        elif base in {"rise", "build", "ramp"}:
            t = "energy climb"
        elif base in {"climax"}:
            t = "peak"
        elif base in {"chant", "crowd"}:
            t = "crowd chant"
        elif base in {"cooldown", "cool down"}:
            t = "cool-down"
        elif base in {"landing", "close", "outro"}:
            t = "soft landing"
        elif base in {"bonus"}:
            t = "encore"
        if t in _ALLOWED_ORDERING and t not in cleaned:
            cleaned.append(t)
    if not cleaned:
        cleaned = ["strong opener", "energy climb", "peak", "soft landing"]
    return cleaned[:6]

def _extract_json_text(maybe: str) -> str:
    text = maybe.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


# =============================================================================
# JSON Schema from Pydantic (tightened)
# =============================================================================
JSON_SCHEMA: Dict[str, Any] = MoodPlan.model_json_schema()

defs = JSON_SCHEMA.get("$defs", {})

if "Constraints" in defs:
    cprops = defs["Constraints"].get("properties", {})
    cprops["energy"] = {"type": "string", "enum": _ALLOWED_LEVELS}
    cprops["danceability"] = {"type": "string", "enum": _ALLOWED_LEVELS}
    defs["Constraints"]["properties"] = cprops
    defs["Constraints"]["additionalProperties"] = False

if "PlanShape" in defs:
    pprops = defs["PlanShape"].get("properties", {})
    if "ordering" in pprops:
        pprops["ordering"]["items"] = {"type": "string", "enum": _ALLOWED_ORDERING}
    defs["PlanShape"]["properties"] = pprops
    defs["PlanShape"]["additionalProperties"] = False

JSON_SCHEMA["additionalProperties"] = False


# =============================================================================
# OpenAI Calls (Responses first, fallback to Chat Completions)
# =============================================================================
def _call_responses_api(client: OpenAI, mood: str) -> str:
    """
    Use Responses API (no response_format param — some SDKs/models reject it).
    We embed the schema inside the system message to coerce JSON.
    """
    resp = client.responses.create(
        model=OPENAI_MODEL,
        input=[
            {
                "role": "system",
                "content": SYSTEM_MSG + "\n\nJSON Schema:\n" + json.dumps(JSON_SCHEMA),
            },
            {"role": "user", "content": f"Mood text: {mood.strip()}"},
        ],
    )
    text = getattr(resp, "output_text", None)
    if text:
        return text
    try:
        parts: List[str] = []
        for item in getattr(resp, "output", []) or []:
            for c in getattr(item, "content", []) or []:
                t = getattr(c, "text", None)
                if t:
                    parts.append(t)
        if parts:
            return "".join(parts)
    except Exception:
        pass
    return json.dumps(resp)

def _call_chat_completions(client: OpenAI, mood: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_MSG + "\n\nJSON Schema:\n" + json.dumps(JSON_SCHEMA)},
        {"role": "user", "content": f"Mood text: {mood.strip()}"},
    ]
    try:
        chat = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
            response_format={"type": "json_object"},
        )
        return chat.choices[0].message.content or ""
    except Exception as e:
        s = str(e)
        # Retry without response_format if the model/endpoint doesn't support it
        if "response_format" in s or "unsupported" in s.lower():
            chat = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=messages,
            )
            return chat.choices[0].message.content or ""
        raise


# =============================================================================
# Public entry point
# =============================================================================
def make_plan_from_mood(mood: str) -> MoodPlan:
    if not mood or not mood.strip():
        raise ValueError("Mood must be a non-empty string.")

    client = _get_openai_client()

    # Try Responses; fallback to Chat Completions
    try:
        raw_text = _call_responses_api(client, mood)
    except Exception:
        raw_text = _call_chat_completions(client, mood)

    raw_text = _extract_json_text(raw_text).strip()

    # Parse JSON (defensive carve-out)
    try:
        data = json.loads(raw_text)
    except Exception:
        start = raw_text.find("{")
        end = raw_text.rfind("}")
        if start != -1 and end != -1 and end > start:
            data = json.loads(raw_text[start : end + 1])
        else:
            raise RuntimeError(f"Planner output is not valid JSON. Body: {raw_text}")

    # Normalize a few fields
    constraints = data.get("constraints") or {}
    if isinstance(constraints, dict):
        ne = _normalize_level(constraints.get("energy"))
        nd = _normalize_level(constraints.get("danceability"))
        if ne:
            constraints["energy"] = ne
        if nd:
            constraints["danceability"] = nd
        data["constraints"] = constraints

    plan = data.get("plan") or {}
    if isinstance(plan, dict):
        ordering = plan.get("ordering") or []
        if isinstance(ordering, list):
            plan["ordering"] = _coerce_to_allowed_ordering([str(x) for x in ordering])
        data["plan"] = plan

    # Validate strictly against your Pydantic schema
    try:
        plan_obj = MoodPlan.model_validate(data)
    except ValidationError as ve:
        raise RuntimeError(f"Failed to validate MoodPlan.\nErrors: {ve}\nBody: {json.dumps(data)}")

    plan_obj.length = infer_length_from_text(mood.strip(), default_len=10)
    return plan_obj
