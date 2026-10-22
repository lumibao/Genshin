/**
 * Adventure journal: every chapter, its status and its objectives.
 * Locked chapters show nothing but their title, so the story cannot be
 * skipped by reading ahead.
 */
import { Modal } from './Modal.js';

export class JournalUI {
  constructor(game) {
    this.game = game;
    this.modal = new Modal(game);
  }

  open() {
    if (this.modal.isOpen) return;
    const wrap = document.createElement('div');

    for (const entry of this.game.quests.journal()) {
      const section = document.createElement('section');
      section.className = `journal-chapter ${entry.unlocked ? '' : 'is-locked'}`;

      const heading = document.createElement('h4');
      const name = document.createElement('span');
      name.textContent = `${entry.level.chapter} · ${entry.level.title}`;
      heading.appendChild(name);
      const status = document.createElement('span');
      status.textContent = entry.completed
        ? 'Complete'
        : entry.active
          ? 'In progress'
          : entry.unlocked
            ? 'Available'
            : 'Locked';
      heading.appendChild(status);
      section.appendChild(heading);

      const place = document.createElement('p');
      place.className = 'journal-place';
      place.textContent = entry.unlocked ? entry.level.place : 'Unknown region';
      section.appendChild(place);

      const desc = document.createElement('p');
      desc.className = 'journal-desc';
      desc.textContent = entry.unlocked
        ? entry.level.journal
        : 'The wind has not carried you here yet.';
      section.appendChild(desc);

      if (entry.unlocked && entry.objectives.length) {
        const list = document.createElement('ul');
        list.className = 'journal-objectives';
        for (const objective of entry.objectives) {
          const li = document.createElement('li');
          li.textContent = objective.text + (objective.target > 1 ? ` (${objective.value}/${objective.target})` : '');
          if (objective.done) li.classList.add('done');
          list.appendChild(li);
        }
        section.appendChild(list);
      }

      wrap.appendChild(section);
    }

    this.modal.open({
      title: 'Adventure Journal',
      subtitle: 'Every journey the wind has carried',
      body: wrap,
      actions: [{ label: 'Close', variant: 'ghost' }],
    });
  }
}
