/** A playable city offered in the new-game wizard (from GET /v1/cities). */
export interface CityOption {
  key: string;
  name: string;
  lat: number;
  lng: number;
  image: string | null; // admin-uploaded cover photo, or null (wizard draws a placeholder)
  size: string; // 'small' | 'medium' | 'large' — tied to the city, shown but not chosen
  modes: string[]; // transit modes that exist here (subset of the mode enum)
}

/** A card the host can keep/remove from the deck in the wizard (from GET /v1/deck). */
export interface DeckCard {
  id: string;
  key: string;
  type: string; // 'curse' | 'powerup' | 'time_bonus'
  name: string;
  cost: string | null;
  description: string | null;
  count: number; // copies of this card in the shuffled deck
  is_custom: boolean; // the host's own custom curse
}
