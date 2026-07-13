import { ActiveCurse } from './card.model';
import { TeamView } from './player.model';
import { ResolvedQuestion } from './question.model';

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

/** One throttled position sample from the replay movement history. `at` is a unix timestamp (s). */
export interface PositionSample {
  player_id: string;
  lat: number;
  lng: number;
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
  positions?: PositionSample[];
}
