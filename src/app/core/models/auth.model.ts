export interface GuestAuth {
  token: string;
  display_name: string;
  user_id: string;
}

/** The signed-in user's profile (a guest until they register). */
export interface Profile {
  id: number;
  name: string;
  email: string | null;
  avatar: string | null;
  is_guest: boolean;
}

export interface ProfileStats {
  games_played: number;
  wins: number;
  total_hide_time_s: number;
  best_hide_time_s: number;
  recent: { hide_time_s: number; won: boolean; players: number; at: number | null }[];
}

/** A user's own custom curse (joins the deck of games they host). */
export interface CustomCurse {
  id: string;
  name: string;
  cost: string;
  description: string;
  requires_proof: boolean;
  blocks_asking: boolean;
  duration_minutes: number | null;
}

/** A user's own custom (photo) question. */
export interface CustomQuestion {
  id: string;
  title: string;
  prompt: string;
}
