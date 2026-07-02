import { Component, computed, input } from '@angular/core';
import { colorFor, initials } from '../core/maps/avatar';

/**
 * A small circular player badge: the uploaded avatar photo when present, otherwise the player's
 * initials on a stable per-player colour. The shared building block for rosters, standings and
 * Q&A author rows (map markers use avatarIcon instead). `size` is in px; pass `seed` (e.g. the
 * player id) to match the map's colour, or `color` to override (e.g. rose for the hider).
 */
@Component({
  selector: 'app-player-avatar',
  templateUrl: './player-avatar.html',
})
export class PlayerAvatar {
  readonly name = input<string | null | undefined>(null);
  readonly avatar = input<string | null | undefined>(null);
  readonly color = input<string | null>(null);
  readonly seed = input<string | null>(null);
  readonly size = input(28);

  readonly label = computed(() => initials(this.name()));
  readonly bg = computed(() => this.color() ?? colorFor(this.seed() ?? this.name() ?? '?'));
}
