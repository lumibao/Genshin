/**
 * The Wanderer's Ledger — shop, wishing star and the wardrobe.
 *
 * One modal, three tabs, so the economy is legible in one place: what a look
 * costs, what the star's rules are, and what is currently worn.
 */
import { Modal } from './Modal.js';
import { WishCinematic } from './WishCinematic.js';
import {
  RARITY,
  PITY_LIMIT,
  WISH_COST,
  WISH_COST_TEN,
  DUPLICATE_REFUND,
  LOOKS,
  SLOTS,
} from '../story/shopData.js';

const SLOT_LABEL = {
  title: 'Title',
  cape: 'Cape',
  charm: 'Charm',
  dye: 'Dye',
  companion: 'Companion',
};

const TAB_LABEL = {
  stock: 'Stock',
  wish: 'Wishing Star',
  look: 'Your Look',
};

export class ShopUI {
  constructor(game) {
    this.game = game;
    this.modal = new Modal(game);
    this.cinematic = new WishCinematic(game);
    this.tab = 'stock';
  }

  get shop() {
    return this.game.shop;
  }

  open({ tab = 'stock', returnToPause = false } = {}) {
    if (this.modal.isOpen) this.modal.close({ silent: true });
    this.tab = tab;
    // Remembered so the mirror that opens from the wardrobe returns to the
    // same place the ledger was opened from.
    this._returnToPause = returnToPause;
    this.modal.open({
      title: "The Wanderer's Ledger",
      subtitle: 'A modest shop, and a star that grants small wishes',
      body: this._body(),
      actions: [{ label: 'Close', variant: 'ghost' }],
      wide: true,
      className: 'modal--shop',
      onClose: () => {
        // A wish scene never outlives the ledger it belongs to.
        this.cinematic.skip();
        this.game.saveNow?.();
        if (returnToPause) this.game.returnToPause?.();
      },
    });
  }

  close() {
    this.cinematic.skip();
    this.modal.close();
  }

  /* ---------------------------------------------------------------- */
  /* Layout                                                           */
  /* ---------------------------------------------------------------- */

  _body() {
    const wrap = document.createElement('div');
    wrap.className = 'shop';

    wrap.appendChild(this._header());
    wrap.appendChild(this._tabs());

    const panel = document.createElement('section');
    panel.className = 'shop-panel';
    panel.dataset.panel = this.tab;
    if (this.tab === 'stock') this._renderStock(panel);
    else if (this.tab === 'wish') this._renderWish(panel);
    else this._renderLook(panel);
    wrap.appendChild(panel);

    return wrap;
  }

  _header() {
    const wallet = this.shop.wallet;
    const header = document.createElement('div');
    header.className = 'shop-header';
    header.innerHTML = `
      <span class="shop-purse" title="Mora">
        <span class="shop-mora-glyph" aria-hidden="true">◈</span>
        <span class="shop-purse-value"></span>
        <small>mora</small>
      </span>
      <span class="shop-pity"></span>
    `;
    header.querySelector('.shop-purse-value').textContent = String(wallet.mora);
    header.querySelector('.shop-pity').textContent = `Legendary guaranteed within ${this.shop.pityRemaining} wishes`;
    return header;
  }

  _tabs() {
    const tabs = document.createElement('div');
    tabs.className = 'shop-tabs';
    tabs.setAttribute('role', 'tablist');
    for (const id of ['stock', 'wish', 'look']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `shop-tab ${this.tab === id ? 'is-active' : ''}`;
      button.dataset.tab = id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(this.tab === id));
      button.textContent = TAB_LABEL[id];
      button.addEventListener('click', () => {
        if (this.tab === id) return;
        this.tab = id;
        this.game.audio?.play('page');
        this._refresh();
      });
      tabs.appendChild(button);
    }
    return tabs;
  }

  /* ---------------------------------------------------------------- */
  /* Stock                                                            */
  /* ---------------------------------------------------------------- */

  _renderStock(panel) {
    panel.appendChild(
      this._note(
        'Everything here is a look, never a key. Keys, fragments and pages come from the story alone, so a purchase can never open — or close — a door.',
      ),
    );

    const grid = document.createElement('div');
    grid.className = 'shop-grid';

    for (const item of this.shop.stock()) {
      const card = document.createElement('article');
      card.className = `shop-card rarity--${item.rarity} ${item.owned ? 'is-owned' : ''} ${item.affordable ? '' : 'is-poor'}`;
      card.dataset.item = item.id;

      const glyph = document.createElement('span');
      glyph.className = 'shop-card-glyph';
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = item.glyph;

      const name = document.createElement('h4');
      name.textContent = item.name;

      const meta = document.createElement('span');
      meta.className = 'shop-card-meta';
      meta.textContent = `${SLOT_LABEL[item.slot] || 'Look'} · ${RARITY[item.rarity]?.label || 'Common'}`;

      const desc = document.createElement('p');
      desc.textContent = item.description;

      const footer = document.createElement('div');
      footer.className = 'shop-card-foot';

      const price = document.createElement('span');
      price.className = 'shop-price';
      price.textContent = item.owned ? 'Owned' : `◈ ${item.price}`;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn ${item.owned ? 'btn-ghost' : 'btn-primary'} shop-buy`;
      button.textContent = item.owned ? (item.equipped ? 'Worn' : 'Wear') : 'Buy';
      button.disabled = !item.owned && !item.affordable;
      button.addEventListener('click', () => {
        if (item.owned) {
          this.shop.equip(item.look);
          this._refresh();
          return;
        }
        const result = this.shop.buy(item.id);
        if (!result.ok && result.reason === 'mora') {
          this._flash('Not enough mora yet. Chapters, fragments and the hidden page fill the purse.', 'warn');
          return;
        }
        this._refresh(`Acquired — ${item.name}`);
      });

      footer.append(price, button);
      card.append(glyph, name, meta, desc, footer);
      grid.appendChild(card);
    }

    panel.appendChild(grid);
    panel.appendChild(this._messageSlot());
  }

  /* ---------------------------------------------------------------- */
  /* Wishing star                                                     */
  /* ---------------------------------------------------------------- */

  _renderWish(panel) {
    const wallet = this.shop.wallet;

    const pity = Math.round(((PITY_LIMIT - this.shop.pityRemaining) / PITY_LIMIT) * 100);

    const intro = document.createElement('div');
    intro.className = 'shop-wish';
    intro.innerHTML = `
      <div class="shop-wish-sky" aria-hidden="true">
        <span class="shop-wish-sky-star"></span>
        <span class="shop-wish-sky-star"></span>
        <span class="shop-wish-sky-star"></span>
        <span class="shop-wish-sky-star"></span>
        <span class="shop-wish-sky-star"></span>
        <span class="shop-wish-sky-star"></span>
        <span class="shop-wish-sky-star"></span>
        <span class="shop-wish-sky-star"></span>
        <p class="shop-wish-sky-line">The star is listening.</p>
      </div>
      <p class="shop-note">
        Offer mora to the wishing star and it answers with a look for the road:
        the sky opens, a star falls, and what it leaves behind is yours.
        You will never receive something you already own until you own everything,
        and a legendary is guaranteed within <strong>${PITY_LIMIT}</strong> wishes.
      </p>
      <div class="shop-pity-track" role="img" aria-label="Legendary guarantee: ${pity}% of the way there">
        <span class="shop-pity-fill" style="width: ${pity}%"></span>
        <span class="shop-pity-label">Legendary guarantee</span>
      </div>
      <div class="shop-wish-actions">
        <button type="button" class="btn btn-primary shop-wish-one">
          Wish once <span class="shop-cost">◈ ${WISH_COST}</span>
        </button>
        <button type="button" class="btn btn-ghost shop-wish-ten">
          Wish ten times <span class="shop-cost">◈ ${WISH_COST_TEN}</span>
        </button>
      </div>
      <div class="shop-wish-result" role="status" aria-live="polite"></div>
    `;

    const one = intro.querySelector('.shop-wish-one');
    const ten = intro.querySelector('.shop-wish-ten');
    one.disabled = wallet.mora < WISH_COST;
    ten.disabled = wallet.mora < WISH_COST_TEN;
    one.addEventListener('click', () => this._pull(1));
    ten.addEventListener('click', () => this._pull(10));

    const odds = document.createElement('div');
    odds.className = 'shop-odds';
    const legendaries = Object.values(LOOKS)
      .filter((look) => look.rarity === 'legendary')
      .map((look) => `${look.glyph} ${look.name}`)
      .join(' · ');
    odds.innerHTML = `
      <h4>What the star can give</h4>
      <ul>
        <li><span class="rarity rarity--common">Common</span> charm and dye</li>
        <li><span class="rarity rarity--rare">Rare</span> cape, title, wisp companion</li>
        <li><span class="rarity rarity--legendary">Legendary</span> <span class="shop-legendaries"></span></li>
      </ul>
      <p class="shop-note shop-wish-stats"></p>
    `;
    odds.querySelector('.shop-legendaries').textContent = legendaries;
    odds.querySelector('.shop-wish-stats').textContent =
      `Wishes made: ${wallet.wishes} · Looks found: ${this.shop.unlockedCount} of ${this.shop.totalLooks} · Duplicates return ${DUPLICATE_REFUND} mora.`;

    panel.append(intro, odds);
    panel.appendChild(this._messageSlot());
  }

  _pull(times) {
    const result = this.shop.wish(times);
    if (!result.ok) {
      this._flash('The star is quiet — not enough mora.', 'warn');
      return;
    }

    const slot = this.modal.element?.querySelector('.shop-wish-result');
    if (slot) {
      slot.replaceChildren();
      const list = document.createElement('ul');
      list.className = 'shop-results';
      for (const entry of result.results) {
        const li = document.createElement('li');
        li.className = `shop-result rarity--${entry.rarity || 'common'}`;
        li.dataset.rarity = entry.rarity || 'common';

        const glyph = document.createElement('span');
        glyph.className = 'shop-result-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = entry.glyph || '✦';

        const name = document.createElement('span');
        name.className = 'shop-result-name';
        name.textContent = entry.name;

        const note = document.createElement('span');
        note.className = 'shop-result-note';
        note.textContent = entry.duplicate
          ? `Duplicate — +${entry.refund} mora`
          : entry.pityHit
            ? 'Guaranteed legendary'
            : SLOT_LABEL[entry.slot] || '';

        li.append(glyph, name, note);
        list.appendChild(li);
      }
      slot.appendChild(list);
      slot.classList.remove('is-revealing');
      void slot.offsetWidth;
      slot.classList.add('is-revealing');
      // The list is already in the DOM (so the ledger is never blocked on an
      // animation); it simply waits for the star to finish falling. The class
      // goes on *before* play(), because a reduced-motion pull finishes
      // synchronously.
      slot.classList.add('is-awaiting-reveal');
      slot.classList.remove('is-revealed');
      this.cinematic.play(result.results, {
        onDone: () => {
          slot.classList.remove('is-awaiting-reveal');
          slot.classList.add('is-revealed');
        },
      });
    }

    // Update the purse and buttons in place — the result list must stay put.
    const element = this.modal.element;
    const purse = element?.querySelector('.shop-purse-value');
    if (purse) purse.textContent = String(this.shop.mora);
    const pity = element?.querySelector('.shop-pity');
    if (pity) pity.textContent = `Legendary guaranteed within ${this.shop.pityRemaining} wishes`;
    const fill = element?.querySelector('.shop-pity-fill');
    if (fill) {
      const progress = Math.round(((PITY_LIMIT - this.shop.pityRemaining) / PITY_LIMIT) * 100);
      fill.style.width = `${progress}%`;
      fill.parentElement?.setAttribute('aria-label', `Legendary guarantee: ${progress}% of the way there`);
    }
    const one = element?.querySelector('.shop-wish-one');
    const ten = element?.querySelector('.shop-wish-ten');
    if (one) one.disabled = this.shop.mora < WISH_COST;
    if (ten) ten.disabled = this.shop.mora < WISH_COST_TEN;
    const stats = element?.querySelector('.shop-wish-stats');
    if (stats) {
      stats.textContent = `Wishes made: ${this.shop.wallet.wishes} · Looks found: ${this.shop.unlockedCount} of ${this.shop.totalLooks} · Duplicates return ${DUPLICATE_REFUND} mora.`;
    }

    // The reveal sound now belongs to the wish scene, which knows how rare the
    // result is and when the star actually breaks.
  }

  /* ---------------------------------------------------------------- */
  /* Current look                                                     */
  /* ---------------------------------------------------------------- */

  _renderLook(panel) {
    const looks = this.shop.getLooks();
    const groups = this.shop.ownedBySlot();

    panel.appendChild(
      this._note('What the world sees when you walk through it. Nothing here changes how you play.'),
    );

    // The wardrobe is where you actually want to look closely at her.
    const mirror = document.createElement('button');
    mirror.type = 'button';
    mirror.className = 'btn btn-ghost shop-mirror';
    mirror.textContent = 'Look at the traveler up close';
    mirror.addEventListener('click', () => {
      this.modal.close({ silent: true });
      this.game.openCharacterViewer({ returnToPause: this._returnToPause });
    });
    panel.appendChild(mirror);

    const summary = document.createElement('dl');
    summary.className = 'shop-look-summary';
    const worn = {
      title: looks.title || 'None',
      cape: this._nameOf(groups.cape, this.shop.equippedIn('cape')) || 'Traveler’s mantle',
      charm: this._nameOf(groups.charm, this.shop.equippedIn('charm')) || 'Wind pendant',
      dye: this._nameOf(groups.dye, this.shop.equippedIn('dye')) || 'Weathered linen',
      companion: this._nameOf(groups.companion, this.shop.equippedIn('companion')) || 'No companion',
    };
    for (const slot of SLOTS) {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = SLOT_LABEL[slot];
      const dd = document.createElement('dd');
      dd.textContent = worn[slot];
      row.append(dt, dd);
      summary.appendChild(row);
    }
    panel.appendChild(summary);

    const owned = document.createElement('div');
    owned.className = 'shop-owned';
    const heading = document.createElement('h4');
    heading.textContent = `Looks you own — ${this.shop.unlockedCount} of ${this.shop.totalLooks}`;
    owned.appendChild(heading);

    if (!this.shop.unlockedCount) {
      owned.appendChild(
        this._note('Nothing bought or wished for yet. The meadow keeps a ledger of small things.'),
      );
    } else {
      for (const slot of SLOTS) {
        const entries = groups[slot];
        if (!entries?.length) continue;
        const group = document.createElement('div');
        group.className = 'shop-owned-slot';
        const label = document.createElement('span');
        label.className = 'shop-owned-label';
        label.textContent = SLOT_LABEL[slot];
        const row = document.createElement('div');
        row.className = 'shop-owned-grid';
        for (const entry of entries) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `shop-owned-item ${entry.equipped ? 'is-worn' : ''} rarity--${entry.rarity}`;
          button.textContent = `${entry.glyph} ${entry.name}`;
          button.addEventListener('click', () => {
            this.shop.equip(entry.look);
            this._refresh();
          });
          row.appendChild(button);
        }
        group.append(label, row);
        owned.appendChild(group);
      }

      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'btn btn-ghost shop-reset-look';
      reset.textContent = 'Return to the traveler’s own clothes';
      reset.addEventListener('click', () => {
        this.shop.resetLooks();
        this._refresh();
      });
      owned.appendChild(reset);
    }

    panel.appendChild(owned);
    panel.appendChild(this._messageSlot());
  }

  _nameOf(entries, look) {
    if (!look) return null;
    return entries?.find((entry) => entry.look === look)?.name || null;
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                          */
  /* ---------------------------------------------------------------- */

  _note(text) {
    const note = document.createElement('p');
    note.className = 'shop-note';
    note.textContent = text;
    return note;
  }

  _messageSlot() {
    const slot = document.createElement('p');
    slot.className = 'shop-message';
    slot.setAttribute('role', 'status');
    return slot;
  }

  _flash(text, kind = 'info') {
    const slot = this.modal.element?.querySelector('.shop-message');
    if (!slot) return;
    slot.textContent = text;
    slot.dataset.kind = kind;
    slot.classList.remove('is-flashing');
    void slot.offsetWidth;
    slot.classList.add('is-flashing');
  }

  /** Rebuild the modal body in place, staying on the current tab. */
  _refresh(message = '') {
    this.modal.setBody(this._body());
    if (message) this._flash(message, 'ok');
  }
}
