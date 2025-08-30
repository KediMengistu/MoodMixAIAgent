from typing import List, Literal, Optional
from pydantic import BaseModel, Field, conlist, confloat

class Constraints(BaseModel):
    # soft guidance knobs; LLM fills these with plain strings like "high", "medium_high"
    energy: Optional[str] = Field(None, description="overall intensity")
    danceability: Optional[str] = Field(None, description="propensity to dance")
    explicit_allowed: Optional[Literal["yes","no","user_pref"]] = "user_pref"

class PlanShape(BaseModel):
    themes: conlist(str, min_length=1, max_length=6)
    candidate_buckets: conlist(str, min_length=1, max_length=6)
    novelty_ratio: confloat(ge=0.0, le=1.0) = 0.3
    ordering: conlist(str, min_length=1, max_length=6)

class MoodPlan(BaseModel):
    normalized_mood: str = Field(..., description="concise label like 'calm focus' or 'hype pre-game'")
    intent: str = Field(..., description="short phrase of intent, e.g., 'motivation', 'focus', 'relaxation'")
    semantic_tags: conlist(str, min_length=1, max_length=8)
    constraints: Constraints
    plan: PlanShape

    # We compute this in Django, not by LLM, based on numbers inside user mood.
    length: Optional[int] = None
