// slices/playlist/PlaylistDTO.ts

// ===== List endpoint DTOs =====
export type SpotifyImageDTO = {
  url: string;
  width?: number | null;
  height?: number | null;
};

export type PlaylistItemDTO = {
  id: number;
  name: string;
  mood: string;
  length: number;
  spotify_playlist_id: string | null;
  spotify_url: string | null;
  cached_name: string | null;
  cached_description: string | null;
  cached_images: SpotifyImageDTO[];
  cached_length: number | null;
  is_public: boolean;
  snapshot_id: string | null;
  created_at: string; // ISO
  last_synced_at: string | null; // ISO | null
};

export type PlaylistDTO = {
  count: number;
  limit: number;
  offset: number;
  next_offset: number | null;
  results: PlaylistItemDTO[];
};

// ===== Plan / Build DTOs =====
// NOTE: Plan endpoint returns the plan object at the ROOT level (no { plan: {...} } wrapper).

export type MoodPlanConstraintsDTO = {
  energy?: string;
  danceability?: string;
  explicit_allowed?: string;
};

export type MoodPlanInnerDTO = {
  themes: string[];
  candidate_buckets: string[];
  novelty_ratio: number;
  ordering: string[];
};

export type MoodPlanDTO = {
  normalized_mood: string;
  intent: string;
  semantic_tags: string[];
  constraints: MoodPlanConstraintsDTO;
  plan: MoodPlanInnerDTO;
  length: number;
};

// Build response
export type BuildPlaylistSummaryDTO = {
  id: string;
  name: string;
  public: boolean;
  collaborative: boolean;
  external_urls: { spotify?: string };
  uri: string;
};

export type BuildResponseDTO = {
  playlist: BuildPlaylistSummaryDTO;
  added: number;
  plan: MoodPlanDTO;
  selected_uris: string[];
  debug?: unknown;
};
