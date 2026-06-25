import { Component, computed, inject, input, output } from '@angular/core';
import { GameState } from '../../core/models/models';
import { DeductionState } from '../../core/services/deduction-state';
import { answerLabel, answerPositive } from '../../core/util/categories';

/** Seeker side panel: an Ask button (opens the shell's picker), the numbered history, curses. */
@Component({
  selector: 'app-seeker-panel',
  templateUrl: './seeker-panel.html',
})
export class SeekerPanel {
  readonly deduction = inject(DeductionState);

  readonly state = input.required<GameState>();
  readonly openPicker = output<void>();

  readonly label = answerLabel;
  readonly canAsk = computed(() => this.state().available_actions.includes('ask_question'));
  readonly history = computed(() => [...this.deduction.annotations()].reverse());

  chipClass(answer: string): string {
    const positive = answerPositive(answer);
    if (positive === true) {
      return 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300';
    }
    if (positive === false) {
      return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300';
    }

    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}
