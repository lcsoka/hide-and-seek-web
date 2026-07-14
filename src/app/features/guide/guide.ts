import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { Icon } from '../../shared/icon';
import { LangToggle } from '../../shared/lang-toggle';
import { DiagramType, GuideDiagram } from './guide-diagram';

/** One deduction question, its map colour cue, and the diagram that shows how it cuts the map. */
interface Cut {
  key: string;
  diagram: DiagramType;
  icon: string;
  color: string;
}

/** A non-geometry rule block (curses, cards, transit, …) with a leading icon. */
interface Rule {
  key: string;
  icon: string;
}

/**
 * A player-facing "How it works" page: the roles, the game flow, and — the important part — how each
 * question narrows the map, illustrated. Static + fully localized; linked from the footer.
 */
@Component({
  selector: 'app-guide',
  imports: [RouterLink, TranslocoModule, Icon, LangToggle, GuideDiagram],
  templateUrl: './guide.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Guide {
  /** The five question types, in the order they're explained. Colours mirror the game map. */
  readonly cuts: Cut[] = [
    { key: 'radar', diagram: 'radar', icon: 'radar', color: '#2563eb' },
    { key: 'thermo', diagram: 'thermometer', icon: 'thermo', color: '#f59e0b' },
    { key: 'matching', diagram: 'matching', icon: 'trees', color: '#16a34a' },
    { key: 'tentacles', diagram: 'tentacles', icon: 'tentacles', color: '#db2777' },
    { key: 'measuring', diagram: 'measuring', icon: 'ruler', color: '#0891b2' },
  ];

  /** The remaining rules, each a short block with an icon. */
  readonly rules: Rule[] = [
    { key: 'curses', icon: 'curse' },
    { key: 'cards', icon: 'cards' },
    { key: 'transit', icon: 'train' },
    { key: 'zone', icon: 'pin' },
    { key: 'endgame', icon: 'flag' },
  ];
}
