/**
 * One semantic palette for every map overlay, so markers, lines and regions read consistently
 * (they used to be a mishmash of ~10 ad-hoc colours). Each role has exactly one colour, all chosen
 * to stay legible over the light CARTO Voyager tiles.
 */
export const MAP = {
  possible: '#10b981', // candidate area — where the hider could still be (emerald)
  excluded: '#0f1e3d', // ruled-out territory (deep navy, textured)
  seeker: '#2563eb', // the seeker(s) + radar (blue)
  hider: '#e11d48', // the hider — dev overlay / reveal (rose, the brand accent)
  clue: '#0891b2', // a reference / matched place a question pins to (cyan)
  region: '#8b5cf6', // admin areas, the national frame, tentacle candidate sets (violet)
  warm: '#f59e0b', // thermometer + travel (amber)
} as const;
