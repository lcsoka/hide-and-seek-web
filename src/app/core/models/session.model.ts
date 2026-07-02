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
