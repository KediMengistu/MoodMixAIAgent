from __future__ import annotations

"""
Modified playlist builder implementing robust fallback logic and stricter success
criteria. This version of the builder attempts multiple search passes to fill
the requested number of tracks and returns an empty result when the quota
cannot be satisfied. Use this in place of MoodMixDjangoApp/music/builder.py.
"""

import os
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set, Tuple

from MoodMixDjangoApp.music.spotify_client import SpotifyClient
from MoodMixDjangoApp.llm.planner_schema import MoodPlan
from MoodMixDjangoApp.llm.selector import select_tracks, LibraryItem

# Popularity thresholds (0..100). Can be overridden via env, else sensible defaults.
MIN_TRACK_POP = int(os.getenv("MOODMIX_MIN_TRACK_POP", "35"))
MIN_ARTIST_POP = int(os.getenv("MOODMIX_MIN_ARTIST_POP", "35"))


@dataclass
class BuildPreview:
    uris: List[str]
    tracks: List[Dict]
    debug: Dict[str, Any]


class PlaylistBuilder:
    """
    Selector-first builder with aggressive fallback:
      1) Snapshot the user's library (recent, top, saved).
      2) Ask LLM to select N tracks that fit the plan:
         - prefer library picks
         - if not enough, propose outside-library picks by title+artist
         - NEVER pick anything in the disallowed set.
      3) Resolve outside picks via Spotify search, guarded by:
         - market = user's home market ONLY (from /me)
         - explicit policy (plan or user pref)
         - genre guard (artist genres should match plan-derived genre tokens)
         - popularity guard (track.popularity >= MIN_TRACK_POP, artist.popularity >= MIN_ARTIST_POP)
      4) Resolve library picks through the same genre & popularity guard.
      5) Backfill via curated /search queries with the same constraints.
      6) If still short, perform a second, relaxed search pass using genre and mood queries
         with lower popularity thresholds and looser genre guards.
      7) Deduplicate (by track-id AND by semantic content key) and clamp to N picks.
      8) If after all attempts we still can't fill N tracks, return no results so the caller
         can surface an error rather than build a half-empty playlist.
    """

    def __init__(self, client: SpotifyClient):
        self.client = client
        self._artist_cache: Dict[str, Dict] = {}

    # ----------- public API -----------

    def preview(
        self,
        plan: MoodPlan,
        length: int,
        *,
        disallowed_ids: Optional[Set[str]] = None,
        disallowed_title_artist: Optional[List[Dict[str, str]]] = None,
    ) -> BuildPreview:
        disallowed_ids = set(disallowed_ids or set())

        pool, source_counts, filtered_from_pool = self._collect_pool_with_counts(
            disallowed_ids=disallowed_ids
        )

        # compact library for the LLM (cap ~400 for tokens)
        lib_items: List[LibraryItem] = []
        for i, (tid, t) in enumerate(pool.items()):
            if i >= 400:
                break
            lib_items.append(
                LibraryItem(
                    id=tid,
                    name=t.get("name") or "",
                    artists=[
                        a.get("name") or ""
                        for a in (t.get("artists") or [])
                        if a.get("name")
                    ],
                    album=(t.get("album") or {}).get("name"),
                    explicit=bool(t.get("explicit")),
                    popularity=t.get("popularity"),
                    uri=t.get("uri"),
                )
            )

        # Market and explicit preference from /me
        market = None
        user_wants_clean: Optional[bool] = None
        try:
            me = self.client.get_me()
            market = me.get("country")  # user’s home market ONLY
            explicit_caps = me.get("explicit_content") or {}
            user_wants_clean = bool(explicit_caps.get("filter_enabled"))
        except Exception:
            pass

        N = max(4, min(10, int(length or 10)))

        # Call selector LLM
        res, attempts_debug = select_tracks(
            plan=plan.model_dump(),
            library=[li.model_dump() for li in lib_items],
            length=N,
            market=market,
            disallowed_library_ids=list(disallowed_ids),
            disallowed_title_artist=list(disallowed_title_artist or []),
        )

        # explicit policy: plan -> user preference fallback
        explicit_allowed = (
            (plan.constraints and plan.constraints.explicit_allowed) or "user_pref"
        )
        if explicit_allowed == "no":
            want_clean = True
        elif explicit_allowed == "yes":
            want_clean = False
        else:
            want_clean = bool(user_wants_clean)

        # derive genre tokens from plan
        allowed_genre_tokens = self._derive_genre_tokens(plan)

        chosen: List[Dict] = []
        outside_requested = 0
        outside_resolved = 0
        missing_resolutions: List[Dict] = []
        rejected_low_pop_or_genre = 0

        # --- resolve library picks with guards ---
        for p in res.picks:
            lid = getattr(p, "library_id", None)
            if lid and lid in pool:
                if lid in disallowed_ids:
                    continue  # hard ban
                track = pool[lid]
                if want_clean and track.get("explicit"):
                    continue
                if not self._passes_popularity(track, MIN_TRACK_POP, MIN_ARTIST_POP):
                    continue
                if not self._artist_genres_match(track, allowed_genre_tokens):
                    continue
                chosen.append(self._compact_track(track))

        # Seed seen with disallowed set so backfill can’t re-add them
        seen: Set[str] = set(disallowed_ids)
        seen_keys: Set[str] = set()  # semantic duplicate key set

        # --- resolve outside picks (search) ---
        for p in res.picks:
            if p.library_id:
                continue
            title = getattr(p, "title", None)
            artist = getattr(p, "artist", None)
            if not title or not artist:
                continue
            outside_requested += 1
            q = f"{title} {artist}"
            picked, rejected_here = self._search_and_pick(
                q,
                want_clean=want_clean,
                market=market,
                seen=seen,
                allowed_genre_tokens=allowed_genre_tokens,
                min_track_pop=MIN_TRACK_POP,
                min_artist_pop=MIN_ARTIST_POP,
            )
            rejected_low_pop_or_genre += rejected_here
            if picked:
                outside_resolved += 1
                compact = self._compact_track(picked)
                # do not add to seen here — de-dupe happens later.
                chosen.append(compact)
            else:
                missing_resolutions.append({"title": title, "artist": artist})

        # Deduplicate & clamp to N (by ID and by content-key)
        uniq: List[Dict] = []
        for t in chosen:
            tid = t.get("id")
            key = self._content_key(t)
            if (not tid) or (tid in seen) or (key in seen_keys):
                if tid:
                    seen.add(tid)  # remember even skipped IDs to avoid re-adding in backfill
                continue
            seen.add(tid)
            seen_keys.add(key)
            uniq.append(t)
            if len(uniq) >= N:
                break

        # --- Backfill via curated search if still short ---
        if len(uniq) < N:
            need = N - len(uniq)
            queries = self._queries_from_plan_and_pool(plan, pool, want_clean)[:12]
            for q in queries:
                if need <= 0:
                    break
                items = self._safe_search(q, limit=10, market=market)
                # Popularity sort, then filter by explicit/dup/genre/popularity
                items = sorted(
                    items, key=lambda x: (x.get("popularity") or 0), reverse=True
                )

                # Enrich with artists’ popularity/genres for guarding
                items, rej = self._apply_artist_pop_and_genre_filters(
                    items,
                    allowed_genre_tokens=allowed_genre_tokens,
                    min_track_pop=MIN_TRACK_POP,
                    min_artist_pop=MIN_ARTIST_POP,
                )
                rejected_low_pop_or_genre += rej

                for cand in items:
                    if need <= 0:
                        break
                    tid = cand.get("id")
                    key = self._content_key(cand)
                    if (not tid) or (tid in seen) or (key in seen_keys):
                        continue
                    if want_clean and cand.get("explicit"):
                        continue
                    compact = self._compact_track(cand)
                    uniq.append(compact)
                    seen.add(tid)
                    seen_keys.add(key)
                    need -= 1

        # --- Additional fallback: if still short after genre/popularity backfill ---
        # If we haven't met the full quota at this point, relax certain guards
        # and perform generic searches keyed off of the plan's genre tokens and mood.
        if len(uniq) < N:
            fallback_needed = N - len(uniq)
            fallback_queries: List[str] = []
            # Build fallback queries based on allowed genres and the mood text.
            mood_word = (plan.normalized_mood or plan.intent or "").split()[0].strip().lower()
            for tok in allowed_genre_tokens:
                if tok:
                    fallback_queries.append(tok)
                    fallback_queries.append(f"{tok} hits")
                    fallback_queries.append(f"{tok} top songs")
            if mood_word:
                fallback_queries.append(mood_word)
                fallback_queries.append(f"{mood_word} hits")
            # Deduplicate while preserving order
            seen_q: Set[str] = set()
            deduped_queries: List[str] = []
            for fq in fallback_queries:
                if fq not in seen_q:
                    deduped_queries.append(fq)
                    seen_q.add(fq)
            for q in deduped_queries:
                if fallback_needed <= 0:
                    break
                items = self._safe_search(q, limit=10, market=market)
                items = sorted(items, key=lambda x: (x.get("popularity") or 0), reverse=True)
                for cand in items:
                    if fallback_needed <= 0:
                        break
                    tid = cand.get("id")
                    key = self._content_key(cand)
                    if not tid or tid in seen or key in seen_keys:
                        continue
                    # Respect explicit filter
                    if want_clean and cand.get("explicit"):
                        continue
                    # Apply a looser popularity threshold: allow tracks with popularity >= 10 or half of MIN_TRACK_POP
                    pop_thresh = max(10, MIN_TRACK_POP // 2)
                    cand_pop = int(cand.get("popularity") or 0)
                    if cand_pop < pop_thresh:
                        continue
                    # We skip strict genre matching here to broaden results
                    compact = self._compact_track(cand)
                    uniq.append(compact)
                    seen.add(tid)
                    seen_keys.add(key)
                    fallback_needed -= 1

        # If after all attempts we still don't have enough tracks, return no results
        # to allow the caller to surface an error rather than building a short playlist.
        if len(uniq) < N:
            debug = {
                "mode": "selector+search_fallback+fallback_relaxed",
                "market": market,
                "allowed_markets": [market] if market else [],
                "pop_thresholds": {
                    "track": MIN_TRACK_POP,
                    "artist": MIN_ARTIST_POP,
                },
                "library_size": len(pool),
                "sources": source_counts,
                "requested": N,
                "selected": len(uniq),
                "explicit_policy": explicit_allowed,
                "resolved_clean_only": bool(want_clean),
                "outside_requested": outside_requested,
                "outside_resolved": outside_resolved,
                "missing_resolutions": missing_resolutions,
                "rejected_low_pop": rejected_low_pop_or_genre,
                "disallowed_total": len(disallowed_ids),
                "disallowed_filtered_from_pool": filtered_from_pool,
                "llm_attempts": attempts_debug,
                "fallback_used": True,
                "reason": "insufficient_tracks_after_fallback",
            }
            return BuildPreview(uris=[], tracks=[], debug=debug)

        # Otherwise, we have a full quota; extract URIs and return
        uris = [t["uri"] for t in uniq]
        debug = {
            "mode": "selector+search_fallback",
            "market": market,
            "allowed_markets": [market] if market else [],
            "pop_thresholds": {
                "track": MIN_TRACK_POP,
                "artist": MIN_ARTIST_POP,
            },
            "library_size": len(pool),
            "sources": source_counts,
            "requested": N,
            "selected": len(uris),
            "explicit_policy": explicit_allowed,
            "resolved_clean_only": bool(want_clean),
            "outside_requested": outside_requested,
            "outside_resolved": outside_resolved,
            "missing_resolutions": missing_resolutions,
            "rejected_low_pop": rejected_low_pop_or_genre,
            "disallowed_total": len(disallowed_ids),
            "disallowed_filtered_from_pool": filtered_from_pool,
            "llm_attempts": attempts_debug,
            "fallback_used": False,
        }
        return BuildPreview(uris=uris, tracks=uniq, debug=debug)

    # ----------- helpers -----------

    def _collect_pool_with_counts(self, *, disallowed_ids: Set[str]) -> Tuple[Dict[str, Dict], Dict[str, int], int]:
        """
        Allowed endpoints only:
          - /me/player/recently-played
          - /me/top/tracks (short+medium)
          - /me/tracks (saved)
        Filters out any disallowed IDs from the pool so the LLM never sees them as candidates.
        """
        pool: Dict[str, Dict] = {}
        counts: Dict[str, int] = {"recent": 0, "top_short": 0, "top_medium": 0, "saved": 0}
        filtered_from_pool = 0

        def _insert(ts: List[Dict], source: str):
            nonlocal filtered_from_pool
            for t in ts:
                tid = t.get("id")
                if not tid or not t.get("uri"):
                    continue
                if tid in disallowed_ids:
                    filtered_from_pool += 1
                    continue
                if tid not in pool:
                    pool[tid] = t.copy()
                    pool[tid]["__source"] = source
                    counts[source] = counts.get(source, 0) + 1

        try:
            _insert(self.client.get_recent_tracks(max_items=50), "recent")
        except Exception:
            pass

        for tr, key in (("short_term", "top_short"), ("medium_term", "top_medium")):
            try:
                _insert(self.client.get_top_tracks(time_range=tr, limit=50), key)
            except Exception:
                pass

        try:
            _insert(self.client.get_saved_tracks(max_items=200), "saved")
        except Exception:
            pass

        return pool, counts, filtered_from_pool

    def _safe_search(self, q: str, *, limit: int, market: Optional[str]) -> List[Dict]:
        try:
            return self.client.search_tracks(q, limit=limit, market=market)
        except Exception:
            return []

    @staticmethod
    def _derive_genre_tokens(plan: MoodPlan) -> List[str]:
        """
        Very light heuristic: scan tags/themes for genre-family words we recognize and keep those.
        This isn’t a classifier; just a nudge to block obvious off-vibe picks.
        """
        raw_terms: List[str] = []
        raw_terms += [t for t in (plan.semantic_tags or []) if isinstance(t, str)]
        if plan.plan and plan.plan.candidate_buckets:
            raw_terms += [t for t in plan.plan.candidate_buckets if isinstance(t, str)]
        text = " ".join(raw_terms).lower()

        # Whitelist of genre families we care about
        genre_map = {
            "metalcore": ["metalcore"],
            "hardcore": ["hardcore", "post-hardcore"],
            "metal": ["metal", "nu-metal", "post-metal", "deathcore", "black metal", "groove metal"],
            "punk": ["punk", "hardcore punk", "post-punk"],
            "industrial": ["industrial", "aggrotech", "industrial metal"],
            "rock": ["rock", "alt rock", "hard rock"],
            "edm": ["edm", "dubstep", "bass", "trap edm", "electro house"],
            "hip hop": ["hip hop", "rap", "trap"],
            "pop": ["pop"],
            "folk": ["folk", "indie folk"],
            "country": ["country"],
            "ambient": ["ambient"],
            "classical": ["classical", "orchestral"],
        }

        allowed: List[str] = []
        for _, tokens in genre_map.items():
            for tok in tokens:
                if tok in text:
                    allowed.extend(tokens)
                    break  # add the family once

        # Dedup and keep compact tokens
        return list(dict.fromkeys(allowed))

    def _artist_info_for_ids(self, artist_ids: List[str]) -> Dict[str, Dict]:
        """Fetch artist docs, using a simple cache to reduce API calls."""
        need = [aid for aid in artist_ids if aid and aid not in self._artist_cache]
        if need:
            try:
                fetched = self.client.get_artists(need) or {}
                self._artist_cache.update({k: v for k, v in fetched.items() if k})
            except Exception:
                # best-effort; leave cache as-is on error
                pass
        return {aid: self._artist_cache.get(aid) for aid in artist_ids}

    def _passes_popularity(self, track: Dict, min_track_pop: int, min_artist_pop: int) -> bool:
        tpop = int(track.get("popularity") or 0)
        if tpop < min_track_pop:
            return False
        a_ids = [a.get("id") for a in (track.get("artists") or []) if a.get("id")]
        amap = self._artist_info_for_ids(list(dict.fromkeys(a_ids)))
        best_artist_pop = 0
        for aid in a_ids:
            ainfo = amap.get(aid) or {}
            ap = int(ainfo.get("popularity") or 0)
            if ap > best_artist_pop:
                best_artist_pop = ap
        return best_artist_pop >= min_artist_pop

    def _artist_genres_match(self, track: Dict, allowed_genre_tokens: List[str]) -> bool:
        if not allowed_genre_tokens:
            return True  # if plan didn't imply genres, don't block
        tokens = [t.lower() for t in allowed_genre_tokens if t]
        a_ids = [a.get("id") for a in (track.get("artists") or []) if a.get("id")]
        amap = self._artist_info_for_ids(list(dict.fromkeys(a_ids)))
        for aid in a_ids:
            genres = [(amap.get(aid) or {}).get("genres") or []]
            flat = [g.lower() for lst in genres for g in (lst or []) if isinstance(g, str)]
            if any(any(tok in g for tok in tokens) for g in flat):
                return True
        return False

    def _apply_artist_pop_and_genre_filters(
        self,
        items: List[Dict],
        *,
        allowed_genre_tokens: List[str],
        min_track_pop: int,
        min_artist_pop: int,
    ) -> Tuple[List[Dict], int]:
        """
        Fetch artist popularity/genres for candidates and filter.
        Returns (remaining_items, rejected_count).
        """
        if not items:
            return [], 0

        # Gather artist IDs once
        artist_ids: List[str] = []
        for it in items:
            for a in (it.get("artists") or []):
                aid = a.get("id")
                if aid:
                    artist_ids.append(aid)
        artist_ids = list(dict.fromkeys(artist_ids))
        amap = self._artist_info_for_ids(artist_ids)

        allowed_tokens = [t.lower() for t in allowed_genre_tokens if t]
        rejected = 0
        kept: List[Dict] = []

        for cand in items:
            track_pop = int(cand.get("popularity") or 0)
            if track_pop < min_track_pop:
                rejected += 1
                continue

            # Best artist popularity among credited artists
            artist_pops: List[int] = []
            artist_genres: List[str] = []
            for a in (cand.get("artists") or []):
                ainfo = amap.get(a.get("id") or "")
                if not ainfo:
                    continue
                ap = int(ainfo.get("popularity") or 0)
                artist_pops.append(ap)
                for g in (ainfo.get("genres") or []):
                    if isinstance(g, str):
                        artist_genres.append(g.lower())

            best_artist_pop = max(artist_pops) if artist_pops else 0
            if best_artist_pop < min_artist_pop:
                rejected += 1
                continue

            # Genre guard: if we have allowed tokens, require at least one match
            if allowed_tokens:
                if not any(any(tok in g for tok in allowed_tokens) for g in artist_genres):
                    rejected += 1
                    continue

            kept.append(cand)

        return kept, rejected

    @staticmethod
    def _compact_track(t: Dict) -> Dict:
        return {
            "id": t.get("id"),
            "uri": t.get("uri"),
            "name": t.get("name"),
            "explicit": t.get("explicit"),
            "duration_ms": t.get("duration_ms"),
            "popularity": t.get("popularity"),
            "preview_url": t.get("preview_url"),
            "external_urls": (t.get("external_urls") or {}),
            "album": {
                "id": (t.get("album") or {}).get("id"),
                "name": (t.get("album") or {}).get("name"),
                "images": (t.get("album") or {}).get("images"),
            },
            "artists": [{"id": a.get("id"), "name": a.get("name")} for a in (t.get("artists") or [])],
        }

    @staticmethod
    def _content_key(track: Dict) -> str:
        """
        Prefer ISRC for identity; fallback to normalized (title, primary artist, ~sec duration).
        Works with both full Spotify track objects and our compacted form.
        """
        # Try ISRC if provided
        isrc = ""
        ext = track.get("external_ids") if isinstance(track.get("external_ids"), dict) else {}
        if isinstance(ext, dict):
            isrc = (ext.get("isrc") or "").strip().upper()
        if isrc:
            return f"isrc:{isrc}"

        title = (track.get("name") or "").casefold()
        title = re.sub(r"[^\w\s]+", "", title)
        title = re.sub(r"\s+", " ", title).strip()

        artists = track.get("artists") or []
        primary = ""
        if artists and isinstance(artists, list):
            primary = ((artists[0] or {}).get("name") or "").casefold()
            primary = re.sub(r"[^\w\s]+", "", primary)
            primary = re.sub(r"\s+", " ", primary).strip()

        secs = round(int(track.get("duration_ms") or 0) / 1000)
        return f"{title}|{primary}|{secs}"

    def _queries_from_plan_and_pool(self, plan: MoodPlan, pool: Dict[str, Dict], want_clean: bool) -> List[str]:
        """
        Build search queries that reflect the mood & themes, biased by user's known artists.
        """
        queries: List[str] = []
        mood = (plan.normalized_mood or "").strip().lower()
        tags = [t for t in (plan.semantic_tags or []) if isinstance(t, str)]
        tags = tags[:6]
        themes = []
        if plan.plan and plan.plan.themes:
            themes = [th for th in plan.plan.themes if isinstance(th, str)]
            themes = themes[:4]

        base_terms = [mood] + tags + themes
        base_terms = [t for t in base_terms if t]

        # Extract a few of the user's most popular artists
        entries = sorted(pool.values(), key=lambda x: (x.get("popularity") or 0), reverse=True)
        artist_names: List[str] = []
        for t in entries:
            for a in (t.get("artists") or []):
                nm = a.get("name")
                if nm:
                    artist_names.append(nm)
            if len(artist_names) >= 5:
                break
        artist_names = list(dict.fromkeys(artist_names))[:5]

        # Build plain mood/tag queries
        simple_phrases = [
            " ".join([bt for bt in [mood, tag] if bt]).strip()
            for tag in tags[:4]
        ]
        simple_phrases += [
            " ".join([bt for bt in [mood, th] if bt]).strip()
            for th in themes[:3]
        ]
        simple_phrases = [p for p in simple_phrases if p]

        # Build artist-biased queries
        artist_phrases = []
        for an in artist_names:
            for term in (tags[:3] or [mood]):
                phrase = " ".join([term, an]).strip()
                if phrase:
                    artist_phrases.append(phrase)

        # Combine and dedupe
        queries = list(dict.fromkeys([*simple_phrases, *artist_phrases]))
        if not queries and base_terms:
            queries = [" ".join(base_terms[:2])]

        # Optionally bias to clean edits in query text if want_clean (keep minimal)
        if want_clean:
            queries = queries[:10] + [q + " clean" for q in queries[:2]]

        return queries

    def _search_and_pick(
        self,
        q: str,
        *,
        want_clean: bool,
        market: Optional[str],
        seen: Set[str],
        allowed_genre_tokens: List[str],
        min_track_pop: int,
        min_artist_pop: int,
    ) -> Tuple[Optional[Dict], int]:
        """
        Run /search once and pick the best match (favoring clean when required),
        while enforcing genre & popularity guards. Returns (picked_track_or_None, rejected_count).
        """
        items = self._safe_search(q, limit=10, market=market)

        # Early explicit/dup filter
        filtered = []
        for cand in items:
            tid = cand.get("id")
            if not tid or tid in seen:
                continue
            if want_clean and cand.get("explicit"):
                continue
            filtered.append(cand)

        # Popularity/genre guard using artist metadata
        filtered, rejected = self._apply_artist_pop_and_genre_filters(
            filtered,
            allowed_genre_tokens=allowed_genre_tokens,
            min_track_pop=min_track_pop,
            min_artist_pop=min_artist_pop,
        )

        # Prefer exact-ish containment of title/artist tokens (already vibe/genre guarded)
        picked = None
        for cand in filtered:
            nm = (cand.get("name") or "").lower()
            arts = " ".join([a.get("name") or "" for a in (cand.get("artists") or [])]).lower()
            q_low = q.lower()
            parts = [p for p in q_low.split() if p]
            if all(part in (nm + " " + arts) for part in parts):
                picked = cand
                break
        if not picked and filtered:
            picked = filtered[0]

        return picked, rejected