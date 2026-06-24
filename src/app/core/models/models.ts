export interface Position {
  lat: number;
  lng: number;
}

export interface GuestAuth {
  token: string;
  display_name: string;
  user_id: string;
}

export interface PlayerView {
  id: string;
  display_name: string;
  role: string | null;
  is_host: boolean;
  team_id: string | null;
  lat?: number | null;
  lng?: number | null;
  last_location_at?: string | null;
}

export interface TeamView {
  id: string;
  name: string;
  color: string | null;
}

export interface PendingQuestion {
  seq: number;
  question_id: string | null;
  category: string | null;
  asked_by: string | null;
  deadline: number | null;
}

export interface HidingZone {
  center: { lat: number; lng: number };
  radius_m: number;
  rule: string;
  neighbors?: { id: string; lat: number; lng: number }[];
}

export interface GameState {
  session_id: string;
  join_code: string;
  game_mode: string;
  state: string;
  status: string;
  round: number;
  config: Record<string, unknown>;
  players: PlayerView[];
  teams: TeamView[];
  available_actions: string[];
  pending_question: PendingQuestion | null;
  hiding_zone: HidingZone | null;
}

export interface GodPlayer {
  id: string;
  display_name: string;
  role: string | null;
  is_host: boolean;
  team_id: string | null;
  lat: number | null;
  lng: number | null;
}

/** Unfiltered developer/debug view of a session (sees the hider, pending truths, etc.). */
export interface GodView {
  session_id: string;
  state: string;
  status: string;
  round: number;
  config: Record<string, unknown>;
  state_data: Record<string, unknown>;
  players: GodPlayer[];
  teams: TeamView[];
}

export interface SessionSummary {
  id: string;
  join_code: string;
  game_mode: string;
  state: string;
  status: string;
  host_player_id: string | null;
  config: Record<string, unknown>;
  players: PlayerView[];
  teams: TeamView[];
}
