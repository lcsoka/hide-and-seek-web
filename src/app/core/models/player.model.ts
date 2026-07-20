export interface Position {
  lat: number;
  lng: number;
  /**
   * Reported horizontal accuracy in metres (the browser's `coords.accuracy`), when the device
   * gives one. The server keeps it alongside the position and refuses to decide anything on a
   * reading that admits it could be far off — a phone indoors quietly falls back to a
   * wifi/cell-tower fix that is hundreds of metres out.
   */
  accuracy?: number;
}

export interface PlayerView {
  id: string;
  display_name: string;
  avatar?: string | null;
  role: string | null;
  is_host: boolean;
  team_id: string | null;
  lat?: number | null;
  lng?: number | null;
  last_location_at?: string | null;
}

export interface TeamView {
  id: string;
  name: string;
  color: string | null;
}
