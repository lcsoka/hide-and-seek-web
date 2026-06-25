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
  title?: string | null;
  prompt?: string | null;
  params?: { radius_m: number | null; feature: string | null };
  ask?: { lat: number | null; lng: number | null };
  preview_answer?: QuestionAnswer | null; // hider-only: the answer they're about to give
}

export interface HidingZone {
  center: { lat: number; lng: number };
  radius_m: number;
  rule: string;
  neighbors?: { id: string; lat: number; lng: number }[];
}

export interface QuestionAnswer {
  answer: string; // yes/no, hotter/colder, closer/further, in_range/out_of_range, photo
  radius_m?: number;
  feature_name?: string | null;
  feature_lat?: number | null; // the reference feature (matching/measuring/tentacles)
  feature_lng?: number | null;
  photo_url?: string; // photo questions
}

/** An answered question, as a seeker sees it (own positions + the answer, no hider location). */
export interface ResolvedQuestion {
  seq: number;
  category: string;
  question_id: string | null;
  asked_by: string | null;
  asked_at: number | null;
  resolved_at: number | null;
  auto: boolean;
  answer: QuestionAnswer | null;
  ask: { lat: number | null; lng: number | null; radius_m: number | null; feature: string | null; start_lat: number | null; start_lng: number | null };
  end: { lat: number | null; lng: number | null };
}

export interface ActiveCurse {
  uid: string | null;
  curse_id: string | null;
  by: string | null;
  at: number | null;
  name: string | null;
  cost: string | null;
  description: string | null;
  requires_proof: boolean;
  expires_at: number | null;
  status: 'active' | 'completed' | 'expired';
  proof_url: string | null;
}

export interface GameTimers {
  now: number;
  hiding_started_at?: number;
  hiding_deadline?: number;
  seeking_started_at?: number;
  question_deadline?: number;
}

export interface QuestionCatalogItem {
  id: string;
  key: string;
  category: string;
  title: string;
  prompt: string;
  parameters: Record<string, unknown> | null;
  reward_draw: number | null;
  reward_keep: number | null;
}

export interface CurseCatalogItem {
  id: string;
  key: string;
  name: string;
  cost: string;
  description: string;
  parameters: Record<string, unknown> | null;
}

/** A card in the hider's hand or draw (curse, time bonus, or powerup). */
export interface HandCard {
  uid: string;
  type: 'curse' | 'time_bonus' | 'powerup';
  curse_id?: string | null;
  minutes?: number;
  power?: string;
  name: string | null;
  cost?: string | null;
  description: string | null;
}

/** Cards the hider just drew and must choose `keep` of. */
export interface PendingDraw {
  keep: number;
  cards: HandCard[];
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
  questions: ResolvedQuestion[];
  curses: ActiveCurse[];
  timers: GameTimers;
  hiding_zone: HidingZone | null;
  zone_locked: boolean;
  hand: HandCard[];
  pending_draw: PendingDraw | null;
  time_bonus_s: number | null;
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

export interface ActionLogEntry {
  type: string;
  player_id: string | null;
  payload: Record<string, unknown> | null;
  at: number | null;
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
  questions: ResolvedQuestion[];
  curses: ActiveCurse[];
  action_logs: ActionLogEntry[];
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
