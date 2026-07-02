import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LabelService {
  /** Human-readable labels for the game's action types (used on buttons). */
  private readonly ACTION_LABELS: Record<string, string> = {
    start: 'Start game',
    assign_hider: 'Assign hider',
    choose_station: 'Choose station',
    confirm_hidden: "I'm hidden",
    ask_question: 'Ask question',
    answer_question: 'Answer question',
    play_curse: 'Play curse',
    declare_endgame: 'Declare endgame',
    board_transit: 'Board transit',
    alight_transit: 'Get off transit',
    claim_found: 'I found them!',
    confirm_caught: 'Confirm caught',
    dispute_found: 'Not caught',
    surrender: 'Surrender',
    advance_round: 'Next round',
    end_game: 'End game',
  };

  actionLabel(type: string): string {
    return this.ACTION_LABELS[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
