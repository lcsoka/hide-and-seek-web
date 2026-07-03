import { Injectable } from '@angular/core';
import { GameState } from '../models';
import { formatCountdown as fmt } from './clock';
import { GameTimer } from './game-timer.model';

@Injectable({ providedIn: 'root' })
export class GameTimerService {
  /**
   * The HUD countdown/elapsed clock for the current phase. `offsetMs` corrects local
   * time to the server clock (from `state.timers.now`). `label` is a translation key
   * (`timer.*`) resolved by the HUD.
   */
  computeGameTimer(state: GameState, offsetMs: number): GameTimer | null {
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
}
