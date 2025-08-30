"""
Selector-only LLM logic. This file instructs the model to choose tracks by
vibe rather than literal keyword matches in titles or artists. It also
respects disallowed sets and prefers library tracks when appropriate.
"""

import os
import json
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field, conlist, model_validator
from openai import OpenAI

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL")


def _client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    kwargs = {"api_key": api_key}
    if OPENAI_BASE_URL:
        kwargs["base_url"] = OPENAI_BASE_URL
    return OpenAI(**kwargs)


class LibraryItem(BaseModel):
    id: str
    name: str
    artists: conlist(str, min_length=1)
    album: Optional[str] = None
    explicit: Optional[bool] = None
    popularity: Optional[int] = None
    uri: Optional[str] = None


class DisallowedTitleArtist(BaseModel):
    title: str
    artist: str


class SelectorInput(BaseModel):
    plan: Dict[str, Any]
    library: conlist(LibraryItem, min_length=0, max_length=400)
    length: int = Field(ge=4, le=10)
    market: Optional[str] = None
    disallowed_library_ids: conlist(str, min_length=0, max_length=1200) = Field(
        default_factory=list
    )
    disallowed_title_artist: conlist(DisallowedTitleArtist, min_length=0, max_length=1200) = Field(default_factory=list)


class SelectorPick(BaseModel):
    library_id: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def validate_pick(self):
        has_lib = bool(self.library_id)
        has_outside = bool(self.title) and bool(self.artist)
        if has_lib and has_outside:
            raise ValueError("Pick must be library_id OR title+artist, not both.")
        if not has_lib and not has_outside:
            raise ValueError("Pick must have a library_id OR both title and artist.")
        return self


class SelectorResult(BaseModel):
    picks: conlist(SelectorPick, min_length=1, max_length=10)


SYSTEM = (
    "You are a strict playlist selector.\n"
    "Choose exactly N tracks that fit the PLAN’s style and constraints, following PLAN.plan.ordering.\n"
    "Rules:\n"
    "1) Prefer tracks from LIBRARY when they fit the theme.\n"
    "2) If LIBRARY coverage is insufficient, fill the remainder with outside songs by title+artist until N is reached.\n"
    "   Prefer widely-known/popular tracks that clearly match the vibe and outline.\n"
    "3) Respect explicit policy: if plan.constraints.explicit_allowed == 'no', avoid explicit songs.\n"
    "4) Avoid kids/nursery music unless the PLAN explicitly asks for it.\n"
    "5) Do NOT choose songs just because the mood words appear in a title or artist name. Focus on the sonic FEEL.\n"
    "6) For each pick, output either {\"library_id\": \"<id>\"} OR {\"title\": \"<song>\", \"artist\": \"<artist>\"}.\n"
    "7) Never pick anything in the disallowed lists (by library_id OR by title+artist).\n"
    "8) Output only JSON: {\"picks\":[...]} — no extra commentary."
)


def _extract_json(raw: str) -> Dict[str, Any]:
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end <= start:
        raise RuntimeError("Selector returned invalid JSON")
    return json.loads(raw[start : end + 1])


def _attempt_llm(client: OpenAI, messages: List[Dict[str, str]]) -> str:
    try:
        resp = client.responses.create(model=OPENAI_MODEL, input=messages)
        raw = getattr(resp, "output_text", "") or ""
        if raw:
            return raw
    except Exception:
        pass
    chat = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        response_format={"type": "json_object"},
    )
    return chat.choices[0].message.content or ""


def select_tracks(
    plan: Dict[str, Any],
    library: List[Dict[str, Any]],
    length: int,
    market: Optional[str],
    *,
    disallowed_library_ids: Optional[List[str]] = None,
    disallowed_title_artist: Optional[List[Dict[str, str]]] = None,
) -> Tuple[SelectorResult, List[Dict[str, str]]]:
    client = _client()
    payload = SelectorInput(
        plan=plan,
        library=[LibraryItem(**item) for item in library],
        length=length,
        market=market,
        disallowed_library_ids=disallowed_library_ids or [],
        disallowed_title_artist=[DisallowedTitleArtist(**d) for d in (disallowed_title_artist or [])],
    )
    payload_json = json.dumps(payload.model_dump(), ensure_ascii=False)

    attempts_debug: List[Dict[str, str]] = []
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": payload_json},
    ]
    raw = _attempt_llm(client, messages)
    attempts_debug.append(
        {"input_preview": payload_json[:1200], "output_preview": (raw or "")[:1200]}
    )

    try:
        data = _extract_json(raw)
        result = SelectorResult.model_validate(data)
        return result, attempts_debug
    except Exception:
        # Retry once if validation fails
        reminder = (
            "Your previous output failed validation. Reminder:\n"
            "- Exactly N picks.\n"
            "- Each pick must be EITHER {library_id} OR {title AND artist}.\n"
            "- Fill outside picks until N if the library is insufficient.\n"
            "- Never use disallowed items.\n"
            "- Do not choose songs because the mood words appear; choose based on vibe."
        )
        messages = [
            {"role": "system", "content": SYSTEM},
            {"role": "system", "content": reminder},
            {"role": "user", "content": payload_json},
        ]
        raw2 = _attempt_llm(client, messages)
        attempts_debug.append(
            {"input_preview": payload_json[:1200], "output_preview": (raw2 or "")[:1200]}
        )
        data2 = _extract_json(raw2)
        result2 = SelectorResult.model_validate(data2)
        return result2, attempts_debug
