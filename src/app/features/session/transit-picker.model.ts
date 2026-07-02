/** The seeker's board action payload — chosen stop + line + mode. */
export interface BoardChoice {
  stop_name: string;
  stop_lat: number;
  stop_lng: number;
  line: string;
  mode: string;
}
