export interface DiceSpec {
  count: number;
  sides: number;
  target?: number | null;
}

export interface DiceRoll {
  values: number[];
  sum: number;
  success: boolean | null;
  at: number;
}

export interface ActiveCurse {
  uid: string | null;
  curse_id: string | null;
  by: string | null;
  at: number | null;
  name: string | null;
  cost: string | null;
  description: string | null;
  requires_proof: boolean;
  dice?: DiceSpec | null;
  last_roll?: DiceRoll | null;
  expires_at: number | null;
  status: 'active' | 'completed' | 'expired';
  proof_url: string | null;
  /** A photo the hider attached when casting (e.g. the Unguided Tourist's Street View shot). */
  hint_photo_url?: string | null;
}

export interface CurseCatalogItem {
  id: string;
  key: string;
  name: string;
  cost: string;
  description: string;
  effect: Record<string, unknown> | null;
}

/** A card in the hider's hand or draw (curse, time bonus, or powerup). */
export interface HandCard {
  uid: string;
  type: 'curse' | 'time_bonus' | 'powerup';
  curse_id?: string | null;
  minutes?: number;
  power?: string;
  name: string | null;
  cost?: string | null;
  description: string | null;
  /** This curse requires the hider to attach a photo (e.g. a Street View screenshot) to cast it. */
  needs_photo?: boolean;
}

/** Cards the hider just drew and must choose `keep` of. */
export interface PendingDraw {
  keep: number;
  cards: HandCard[];
}

export interface CurseChoice {
  uid: string;
  curse_id: string | null;
  count: number;
}
