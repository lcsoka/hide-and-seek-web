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
  make_guess: 'Make guess',
  surrender: 'Surrender',
  advance_round: 'Next round',
  end_game: 'End game',
};

export function actionLabel(type: string): string {
  return ACTION_LABELS[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
