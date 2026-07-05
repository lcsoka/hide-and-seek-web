import { ActiveCurse, CurseChoice, HandCard, PendingDraw } from './card.model';
import { FoundClaim, GameTimers, HidingZone, RoundReveal, Standing, TransitState } from './mechanics.model';
import { PlayerView, TeamView } from './player.model';
import { PendingQuestion, ResolvedQuestion, ThermometerRunning } from './question.model';

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
  relocating: boolean; // hider played 'move' and must re-confirm a new spot
  hider_locked: boolean; // hider-only: the endgame has locked them to their spot (else they roam the zone)
  disabled_categories: string[]; // question categories a curse currently blocks
  question_cooldowns: Record<string, number>; // category → seconds until it can be re-asked
  questions_blocked: boolean; // a blocking curse is stopping the seekers from asking
  curse_choice: CurseChoice | null; // hider-only: a 'choose' curse awaiting category picks
  standings: Standing[];
  last_round: RoundReveal | null;
  hand: HandCard[];
  hand_limit: number | null; // hider-only: max cards they may hold (raised by 'draw_1_expand_1')
  pending_draw: PendingDraw | null;
  time_bonus_s: number | null;
  thermometer: ThermometerRunning | null;
  transit: TransitState | null; // seeker-only: board/alight status + the team's journey log
  found_claim: FoundClaim | null; // a seeker claims the catch; round ends once the hider confirms
}
