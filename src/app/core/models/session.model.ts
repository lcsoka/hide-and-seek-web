import { PlayerView, TeamView } from './player.model';

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

/** A still-live game the user is part of — for the "resume" list on the landing. */
export interface ActiveSession {
  id: string;
  join_code: string;
  city: string | null;
  state: string;
  status: string;
  is_host: boolean;
  player_id: string;
  players_count: number;
}
