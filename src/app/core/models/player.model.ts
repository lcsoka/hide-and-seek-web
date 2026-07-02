export interface Position {
  lat: number;
  lng: number;
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
