export interface CategoryMeta {
  icon: string;
  label: string;
  hint: string;
}

/** Display metadata per question category (icon, label, one-line hint). */
export const CATEGORY_META: Record<string, CategoryMeta> = {
  radar: { icon: '📡', label: 'Radar', hint: 'Are you within a distance of me?' },
  thermometer: { icon: '🌡️', label: 'Thermometer', hint: 'Hotter or colder as I travel?' },
  matching: { icon: '🧩', label: 'Matching', hint: 'Is your nearest place the same as mine?' },
  measuring: { icon: '📏', label: 'Measuring', hint: 'Closer or further from a place than me?' },
  tentacles: { icon: '🐙', label: 'Tentacles', hint: 'Which nearby place are you closest to?' },
  photo: { icon: '📷', label: 'Photo', hint: 'Ask for a photo clue.' },
};

export function categoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? { icon: '❓', label: category, hint: '' };
}

/** Human label for an answer value (used in history + map markers). */
export function answerLabel(answer: string | undefined): string {
  const labels: Record<string, string> = {
    yes: 'Yes',
    no: 'No',
    hotter: 'Hotter',
    colder: 'Colder',
    closer: 'Closer',
    further: 'Further',
    in_range: 'In range',
    out_of_range: 'Out of range',
  };

  return answer ? (labels[answer] ?? answer) : '—';
}

/** Whether an answer is "positive" for the seeker (green) vs "negative" (red), for colouring. */
export function answerPositive(answer: string | undefined): boolean | null {
  if (answer === 'yes' || answer === 'hotter' || answer === 'closer' || answer === 'in_range') {
    return true;
  }
  if (answer === 'no' || answer === 'colder' || answer === 'further' || answer === 'out_of_range') {
    return false;
  }

  return null;
}
