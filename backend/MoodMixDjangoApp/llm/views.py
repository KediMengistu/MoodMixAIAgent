from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from .planner import make_plan_from_mood

@api_view(["POST"])
def plan_from_mood(request):
    """
    Body: { "mood": "<free text>" }
    Returns: LLM-derived plan object + computed length (4..10 based on hint in mood, else 10).
    """
    mood = (request.data or {}).get("mood")
    if not isinstance(mood, str) or not mood.strip():
        return Response({"detail": "Provide a non-empty 'mood' string."},
                        status=status.HTTP_400_BAD_REQUEST)
    try:
        plan = make_plan_from_mood(mood)
    except ValueError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"detail": "Planner failed", "error": str(e)},
                        status=status.HTTP_502_BAD_GATEWAY)

    return Response(plan.model_dump(), status=status.HTTP_200_OK)
