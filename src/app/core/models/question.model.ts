/** A thermometer the seeker has started but not yet stopped. */
export interface ThermometerRunning {
  asked_by: string | null;
  question_id: string | null;
  start_lat: number | null;
  start_lng: number | null;
  distance_m: number | null;
  distance_label: string | null;
  started_at: number | null;
}

export interface PendingQuestion {
  seq: number;
  question_id: string | null;
  category: string | null;
  asked_by: string | null;
  deadline: number | null;
  title?: string | null;
  prompt?: string | null;
  params?: { radius_m: number | null; feature: string | null };
  ask?: { lat: number | null; lng: number | null };
  reference?: { name: string | null; lat: number; lng: number } | null; // the seeker's closest place
  hider_nearest?: { name: string | null; lat: number; lng: number } | null; // hider-only: their OWN nearest
  preview_answer?: QuestionAnswer | null; // hider-only: the answer they're about to give
}

export interface QuestionAnswer {
  answer: string; // yes/no, hotter/colder, closer/further, in_range/out_of_range, photo
  radius_m?: number;
  feature_name?: string | null;
  feature_lat?: number | null; // the reference feature (matching/measuring/tentacles)
  feature_lng?: number | null;
  photo_url?: string; // photo questions
}

/** An answered question, as a seeker sees it (own positions + the answer, no hider location). */
export interface ResolvedQuestion {
  seq: number;
  category: string;
  question_id: string | null;
  asked_by: string | null;
  asked_at: number | null;
  resolved_at: number | null;
  auto: boolean;
  manual?: boolean; // the hider's own input set the answer (amendable for a short window)
  amended?: boolean; // the hider corrected this answer after the fact
  answer: QuestionAnswer | null;
  ask: { lat: number | null; lng: number | null; radius_m: number | null; feature: string | null; admin_level?: number | null; boundary_level?: number | null; start_lat: number | null; start_lng: number | null };
  end: { lat: number | null; lng: number | null };
}

export interface QuestionCatalogItem {
  id: string;
  key: string;
  category: string;
  title: string;
  prompt: string;
  parameters: Record<string, unknown> | null;
  reward_draw: number | null;
  reward_keep: number | null;
}
