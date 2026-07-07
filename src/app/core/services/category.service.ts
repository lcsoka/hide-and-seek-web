import { Injectable } from '@angular/core';
import { CategoryMeta } from './category.model';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  /** Display metadata per question category (icon, label, one-line hint). */
  private readonly CATEGORY_META: Record<string, CategoryMeta> = {
    radar: { icon: '📡', label: 'Radar', hint: 'Are you within a distance of me?', color: '#EE8A3B' },
    thermometer: { icon: '🌡️', label: 'Thermometer', hint: 'Hotter or colder as I travel?', color: '#D9534F' },
    matching: { icon: '🧩', label: 'Matching', hint: 'Is your nearest place the same as mine?', color: '#3D5A9C' },
    measuring: { icon: '📏', label: 'Measuring', hint: 'Closer or further from a place than me?', color: '#5E9ED0' },
    tentacles: { icon: '🐙', label: 'Tentacles', hint: 'Which nearby place are you closest to?', color: '#8E76B4' },
    photo: { icon: '📷', label: 'Photo', hint: 'Ask for a photo clue.', color: '#4FA65B' },
  };

  /** Path to the category's SVG badge (in web/public/icons/questions). */
  categoryIconSrc(category: string): string {
    return `/icons/questions/${category}.svg`;
  }

  /** app-icon name per category (in-app inline SVG, replaces the emoji fallback). */
  private readonly CATEGORY_ICON_NAME: Record<string, string> = {
    radar: 'radar',
    thermometer: 'thermo',
    matching: 'pin',
    measuring: 'ruler',
    tentacles: 'tentacles',
    photo: 'camera',
  };

  /** The app-icon name for a category, falling back to a generic help glyph. */
  categoryIconName(category: string): string {
    return this.CATEGORY_ICON_NAME[category] ?? 'help';
  }

  /** The category's brand colour (hex) — used to tint its question/subject icons. */
  categoryColor(category: string): string {
    return this.categoryMeta(category).color;
  }

  /**
   * Subject keyword → app-icon name, mirroring QUESTION_ICONS order so the same
   * substring precedence holds ('street' before 'tree', etc.).
   */
  private readonly QUESTION_ICON_NAMES: [string, string][] = [
    ['museum', 'landmark'], ['library', 'library'], ['hospital', 'cross'], ['zoo', 'pawprint'], ['aquarium', 'waves'],
    ['amusement', 'landmark'], ['theme', 'landmark'], ['movie', 'clapperboard'], ['cinema', 'clapperboard'], ['theater', 'clapperboard'],
    ['metro', 'train'], ['subway', 'train'], ['platform', 'train'], ['rail', 'train'], ['train', 'train'], ['station', 'train'],
    // 'street' before 'tree' — "s·tree·t" contains "tree" as a substring.
    ['street', 'signpost'], ['park', 'trees'], ['tree', 'trees'], ['selfie', 'camera'], ['sky', 'cloud'], ['worship', 'church'], ['church', 'church'],
    ['grocery', 'cart'], ['restaurant', 'utensils'], ['water', 'waves'], ['structure', 'building'], ['tower', 'building'],
    ['golf', 'pin'], ['airport', 'plane'], ['bridge', 'building'], ['building', 'building'], ['sea', 'waves'],
  ];

  /** app-icon name for a specific question (by its subject), falling back to the category icon. */
  questionIconName(text: string, category: string): string {
    const haystack = text.toLowerCase();
    for (const [keyword, name] of this.QUESTION_ICON_NAMES) {
      if (haystack.includes(keyword)) {
        return name;
      }
    }

    return this.categoryIconName(category);
  }

  /** Subject keyword → emoji, most-specific first. Used to give each question an icon. */
  private readonly QUESTION_ICONS: [string, string][] = [
    ['museum', '🏛️'], ['library', '📚'], ['hospital', '🏥'], ['zoo', '🦁'], ['aquarium', '🐠'],
    ['amusement', '🎢'], ['theme', '🎢'], ['movie', '🎬'], ['cinema', '🎬'], ['theater', '🎬'],
    ['metro', '🚇'], ['subway', '🚇'], ['platform', '🚉'], ['rail', '🚉'], ['train', '🚉'], ['station', '🚉'],
    // 'street' before 'tree' — "s·tree·t" contains "tree" as a substring.
    ['street', '🛣️'], ['park', '🌳'], ['tree', '🌳'], ['selfie', '🤳'], ['sky', '☁️'], ['worship', '⛪'], ['church', '⛪'],
    ['grocery', '🛒'], ['restaurant', '🍽️'], ['water', '🌊'], ['structure', '🗼'], ['tower', '🗼'],
    ['golf', '⛳'], ['airport', '✈️'], ['bridge', '🌉'], ['building', '🏢'], ['sea', '🌊'],
  ];

  categoryMeta(category: string): CategoryMeta {
    return this.CATEGORY_META[category] ?? { icon: '❓', label: category, hint: '', color: '#6B7280' };
  }

  /** An icon for a specific question (by its subject), falling back to the category icon. */
  questionIcon(text: string, category: string): string {
    const haystack = text.toLowerCase();
    for (const [keyword, icon] of this.QUESTION_ICONS) {
      if (haystack.includes(keyword)) {
        return icon;
      }
    }

    return this.categoryMeta(category).icon;
  }

  /** The subject part of a question title ("Photo — Tree" → "Tree"). */
  questionShortLabel(title: string): string {
    const parts = title.split('—');

    return (parts.length > 1 ? parts[parts.length - 1] : title).trim();
  }

  /** Human label for an answer value (used in history + map markers). */
  answerLabel(answer: string | undefined): string {
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
  answerPositive(answer: string | undefined): boolean | null {
    if (answer === 'yes' || answer === 'hotter' || answer === 'closer' || answer === 'in_range') {
      return true;
    }
    if (answer === 'no' || answer === 'colder' || answer === 'further' || answer === 'out_of_range') {
      return false;
    }

    return null;
  }
}
