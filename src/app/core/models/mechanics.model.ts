export interface HidingZone {
  center: { lat: number; lng: number };
  radius_m: number;
  rule: string;
  neighbors?: { id: string; lat: number; lng: number }[];
}

export interface GameTimers {
  now: number;
  hiding_started_at?: number;
  hiding_deadline?: number;
  seeking_started_at?: number;
  question_deadline?: number;
}

export interface FoundClaim {
  by: string | null;
  by_name: string | null;
}

/** Seekers' public-transport status + journey log (seeker-only). */
export interface TransitState {
  on_transit: boolean; // is THIS seeker currently riding
  boarded_at: number | null;
  line: string | null; // the line this seeker is currently riding (e.g. "47")
  mode: string | null;
  board: { lat: number | null; lng: number | null } | null; // where they boarded (to re-draw the route)
  riding: string[]; // display names of teammates currently riding
  log: TransitLeg[]; // completed rides, oldest first
}

export interface TransitLeg {
  player_id: string | null;
  display_name: string | null;
  line: string | null; // line ref, e.g. "47" / "M2"
  mode: string | null; // transit mode id
  board_stop: string | null;
  alight_stop: string | null;
  board: { lat: number | null; lng: number | null; at: number | null };
  alight: { lat: number | null; lng: number | null; at: number | null };
  distance_m: number | null;
  duration_s: number | null;
}

export interface Standing {
  player_id: string;
  display_name: string | null;
  total_hiding_time_s: number;
  rank: number;
}

/** The just-ended round's reveal + recap (present at round_end / finished). */
export interface RoundReveal {
  hider_id: string | null;
  hider_name: string | null;
  found_by: string | null;
  found_by_name: string | null;
  surrendered: boolean;
  seconds: number;
  time_bonus_s: number;
  hider_position: { lat: number; lng: number } | null;
  questions_count: number;
  curses_played: number;
}
