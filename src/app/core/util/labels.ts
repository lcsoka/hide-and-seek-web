/** Human-readable labels for the game's action types (used on buttons). */
const ACTION_LABELS: Record<string, string> = {
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

export function actionLabel(type: string): string {
  return ACTION_LABELS[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
