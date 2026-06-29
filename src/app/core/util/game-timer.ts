import { GameState } from '../models/models';

export interface GameTimer {
  label: string;
  text: string;
  urgent: boolean;
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));

  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The HUD countdown/elapsed clock for the current phase. `offsetMs` corrects local
 * time to the server clock (from `state.timers.now`). `label` is a translation key
 * (`timer.*`) resolved by the HUD.
 */
export function computeGameTimer(state: GameState, offsetMs: number): GameTimer | null {
  const serverNow = Math.floor((Date.now() + offsetMs) / 1000);

  if (state.pending_question?.deadline) {
    const left = state.pending_question.deadline - serverNow;

    return { label: 'timer.answering', text: fmt(Math.max(0, left)), urgent: left <= 30 };
  }
  if (state.state === 'seeking' && state.timers.seeking_started_at) {
    return { label: 'timer.seeking', text: fmt(serverNow - state.timers.seeking_started_at), urgent: false };
  }
  if (state.state === 'hiding' && state.timers.hiding_deadline) {
    const left = state.timers.hiding_deadline - serverNow;

    return { label: 'timer.hiding', text: fmt(Math.max(0, left)), urgent: left <= 60 };
  }

  return null;
}
