/**
 * Inventory modal: quest keys, relics and pages collected on the journey.
 */
import { Modal } from './Modal.js';

export class InventoryUI {
  constructor(game) {
    this.game = game;
    this.modal = new Modal(game);
  }

  open() {
    if (this.modal.isOpen) return;
    const entries = this.game.inventory.getEntries();
    const wrap = document.createElement('div');

    const grid = document.createElement('div');
    grid.className = 'inventory-grid';

    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'inv-empty';
      empty.textContent = 'Your satchel is empty. The meadow is full of things worth picking up.';
      grid.appendChild(empty);
    } else {
      const keys = entries.filter((e) => e.type === 'key');
      const relics = entries.filter((e) => e.type !== 'key');
      if (keys.length) grid.appendChild(this._section('Keys & Seals'));
      keys.forEach((entry) => grid.appendChild(this._itemButton(entry, wrap)));
      if (relics.length) grid.appendChild(this._section('Relics & Pages'));
      relics.forEach((entry) => grid.appendChild(this._itemButton(entry, wrap)));
    }

    const detail = document.createElement('div');
    detail.className = 'inv-detail';
    detail.innerHTML = `<h4>Satchel</h4><p></p>`;
    detail.querySelector('p').textContent =
      'Items gathered during the chronicle. Keys and seals open doors; fragments and pages tell the story.';
    wrap.append(grid, detail);

    const summary = this.game.quests.summary();
    this.modal.open({
      title: 'Satchel',
      subtitle: `${summary.chapter} · ${summary.title}`,
      body: wrap,
      actions: [{ label: 'Close', variant: 'ghost' }],
    });

    // Open the first item's detail for a friendly first impression.
    const firstButton = grid.querySelector('.inv-item');
    if (firstButton) firstButton.click();
  }

  _section(text) {
    const el = document.createElement('div');
    el.className = 'inv-section-title';
    el.textContent = text;
    return el;
  }

  _itemButton(entry, wrap) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inv-item';
    button.innerHTML = `
      <span class="inv-icon"></span>
      <span class="inv-name"></span>
      <span class="inv-count"></span>
    `;
    button.querySelector('.inv-icon').textContent = entry.glyph || '✦';
    button.querySelector('.inv-name').textContent = entry.name;
    button.querySelector('.inv-count').textContent = entry.count > 1 ? `× ${entry.count}` : '—';
    button.addEventListener('click', () => {
      const detail = wrap.querySelector('.inv-detail');
      detail.querySelector('h4').textContent = entry.name;
      detail.querySelector('p').textContent = entry.description;
    });
    return button;
  }
}
