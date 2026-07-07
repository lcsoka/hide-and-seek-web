/**
 * One modern, semantic palette for every map overlay, tuned to read well over the light pastel
 * CARTO Voyager tiles (which already use soft greens for parks + blue for water — so the candidate
 * is violet, not green, to stand apart). Each role has exactly one colour.
 */
export const MAP = {
  possible: '#7c3aed', // candidate area — where the hider could still be (violet hero)
  excluded: '#1e1b4b', // ruled-out territory (deep indigo fog)
  seeker: '#2563eb', // the seeker(s) + radar (blue)
  hider: '#f43f5e', // the hider — dev overlay / reveal (rose, the brand accent)
  clue: '#0891b2', // a reference / matched place a question pins to (cyan)
  region: '#db2777', // admin areas + tentacle candidate sets (pink)
  warm: '#f59e0b', // thermometer + travel (amber)
  frame: '#475569', // the national border — a quiet structural slate frame
} as const;
