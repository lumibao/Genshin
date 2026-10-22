/**
 * The readable layer of the physical book.
 *
 * The 3D book handles the object; this overlay lays real, selectable,
 * screen-reader-friendly text onto the open pages. It is created only when the
 * reveal gate has already passed, and its contents are removed from the DOM
 * when closed.
 */
export class BookUI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui-root');
    this.element = null;
    this.pages = [];
    this.index = 0;
    this.isOpen = false;
    this._resolve = null;
    this._onClose = null;
    this._keyHandler = null;
    this._previousFocus = null;
  }

  open(pages, { startIndex = 0, onClose = null, context = 'reveal' } = {}) {
    if (!Array.isArray(pages) || !pages.length) return Promise.resolve();
    if (this.isOpen) this.close({ silent: true });

    this.pages = pages;
    this.index = Math.max(0, Math.min(pages.length - 1, startIndex));
    this._onClose = onClose;
    this._previousFocus = document.activeElement;
    this.context = context;

    const overlay = document.createElement('div');
    overlay.id = 'book-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'The open chronicle');
    overlay.innerHTML = `
      <article class="parchment">
        <button class="book-close" type="button" aria-label="Close the book">✕</button>
        <div class="parchment-scroll">
          <div class="page-head"><span></span><i>✦</i><span></span></div>
          <p class="page-kicker"></p>
          <h2 class="page-title" id="book-page-title"></h2>
          <p class="page-subtitle"></p>
          <div class="page-layout">
            <div class="page-body"></div>
            <figure class="page-margin">
              ${this._constellationSvg()}
              <figcaption></figcaption>
            </figure>
          </div>
          <div class="page-signature">
            <span class="sig-small"></span>
            <span class="sig-name"></span>
            <span class="sig-date"></span>
          </div>
          <div class="page-seal">
            <span></span>
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="15" fill="none" stroke="#8a6a3a" stroke-width="1"/>
              <path d="M20 4 L23 17 L36 20 L23 23 L20 36 L17 23 L4 20 L17 17 Z" fill="none" stroke="#8a6a3c" stroke-width="1"/>
              <circle cx="20" cy="20" r="2" fill="#8a6a3c"/>
            </svg>
            <span></span>
          </div>
        </div>
        <div class="book-controls">
          <span class="book-page-label"></span>
          <div class="book-controls-right">
            <button class="book-btn book-prev" type="button">Previous page</button>
            <button class="book-btn book-next book-btn--primary" type="button">Turn the page</button>
          </div>
        </div>
      </article>
    `;

    // Page buttons are wired in _renderPage (their labels and behaviour change
    // on the last page), so they must not also be bound here.
    overlay.querySelector('.book-close').addEventListener('click', () => this.close());
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.prev();
      }
    });

    this._keyHandler = (event) => {
      if (!this.isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.prev();
      } else if (event.key === 'Tab') {
        this._trapFocus(event);
      }
    };
    document.addEventListener('keydown', this._keyHandler, true);

    this.root.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-open'));

    this.element = overlay;
    this.isOpen = true;
    this.game.addBlocker('book');
    document.body.classList.add('is-reading');
    this.game.hud?.setVisible(false);
    this.game.input.exitPointerLock?.();
    this.game.audio?.play('bookOpen');

    const result = new Promise((resolve) => {
      this._resolve = resolve;
    });

    this._renderPage();
    requestAnimationFrame(() => overlay.querySelector('.book-close')?.focus({ preventScroll: true }));
    return result;
  }

  _constellationSvg() {
    return `
      <svg viewBox="0 0 200 260" role="img" aria-label="A small constellation drawn in ink">
        <g fill="none" stroke="#7c5c2a" stroke-width="1.1" opacity="0.85">
          <path d="M42 62 L98 96 L61 152 L130 178 L156 120"/>
          <path d="M98 96 L130 178" opacity="0.35"/>
          <circle cx="42" cy="62" r="30" opacity="0.18"/>
          <circle cx="42" cy="62" r="42" opacity="0.1"/>
          <path d="M16 210 C 60 196, 92 226, 126 206" opacity="0.4"/>
        </g>
        <g fill="#7c5c2a">
          <circle cx="42" cy="62" r="3.6"/>
          <circle cx="98" cy="96" r="2.6"/>
          <circle cx="61" cy="152" r="2.2"/>
          <circle cx="130" cy="178" r="3.2"/>
          <circle cx="156" cy="120" r="2.4"/>
        </g>
        <g fill="none" stroke="#8a6a3a" stroke-width="0.7" opacity="0.5">
          <circle cx="98" cy="112" r="54"/>
          <circle cx="98" cy="112" r="66"/>
        </g>
        <text x="100" y="242" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-size="9" letter-spacing="2.4" fill="#8a6a3a" opacity="0.8">ASTERIA</text>
      </svg>
    `;
  }

  _renderPage() {
    if (!this.element) return;
    const page = this.pages[this.index];
    if (!page) return;

    const q = (selector) => this.element.querySelector(selector);
    q('.page-kicker').textContent = page.kicker || '';
    q('.page-title').textContent = page.title || '';
    q('.page-subtitle').textContent = page.subtitle || '';
    q('.page-margin figcaption').textContent = page.sealCaption || '';
    q('.sig-small').textContent = page.signature?.small || '';
    q('.sig-name').textContent = page.signature?.name || '';
    q('.sig-date').textContent = page.dateLine || '';
    q('.book-page-label').textContent = `Page ${this.index + 1} of ${this.pages.length}`;

    const body = q('.page-body');
    body.replaceChildren();
    body.classList.toggle('is-devotion', !!page.devotion);

    const paragraphs = page.paragraphs || [];
    paragraphs.forEach((paragraph, pIndex) => {
      const p = document.createElement('p');
      if (paragraph.dropcap) p.classList.add('dropcap');
      if (paragraph.personal) p.classList.add('personal');

      if (this.index === 0) {
        // Word-by-word reveal, like ink settling into parchment.
        const words = String(paragraph.text || '').split(/(\s+)/);
        let wordIndex = 0;
        for (const token of words) {
          if (/^\s+$/.test(token)) {
            p.appendChild(document.createTextNode(token));
            continue;
          }
          const span = document.createElement('span');
          span.className = 'reveal-word';
          span.textContent = token;
          const delay = Math.min(5200, pIndex * 700 + wordIndex * 26);
          span.style.animationDelay = `${delay}ms`;
          p.appendChild(span);
          wordIndex++;
        }
      } else {
        p.style.animation = 'fadeIn 1.6s ease both';
        p.style.animationDelay = `${pIndex * 300 + 200}ms`;
        p.textContent = paragraph.text || '';
      }
      body.appendChild(p);
    });

    const nextBtn = q('.book-next');
    const prevBtn = q('.book-prev');
    const isLast = this.index >= this.pages.length - 1;
    if (isLast) {
      nextBtn.textContent = this.context === 'ending' ? 'Return to the sanctuary' : 'Close the book';
      nextBtn.onclick = () => {
        if (this.context === 'ending') this.close();
        else this.close();
      };
      nextBtn.classList.add('book-btn--primary');
    } else {
      nextBtn.textContent = page.nextLabel || 'Turn the page';
      nextBtn.onclick = () => this.next();
      nextBtn.classList.add('book-btn--primary');
    }
    nextBtn.style.display = '';
    prevBtn.style.display = this.index > 0 ? '' : 'none';
    prevBtn.onclick = () => this.prev();

    // Reset scroll to the top of the new page.
    this.element.querySelector('.parchment-scroll')?.scrollTo?.({ top: 0, behavior: 'instant' });
  }

  next() {
    if (this.index < this.pages.length - 1) {
      this.index++;
      this.game.audio?.play('page');
      this._renderPage();
    } else {
      this.close();
    }
  }

  prev() {
    if (this.index > 0) {
      this.index--;
      this.game.audio?.play('page');
      this._renderPage();
    }
  }

  _trapFocus(event) {
    if (!this.element) return;
    const focusable = this.element.querySelectorAll('button:not([disabled])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  close({ silent = false } = {}) {
    if (!this.isOpen || !this.element) return;
    const overlay = this.element;
    const resolve = this._resolve;
    const onClose = this._onClose;
    this._resolve = null;
    this._onClose = null;
    this.isOpen = false;
    this.element = null;

    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler, true);
      this._keyHandler = null;
    }

    overlay.classList.remove('is-open');
    overlay.classList.add('is-leaving');
    this.game.audio?.play('bookClose');
    setTimeout(() => {
      overlay.remove();
    }, 1000);

    document.body.classList.remove('is-reading');
    this.game.hud?.setVisible(true);
    this.game.removeBlocker('book');
    this._previousFocus?.focus?.({ preventScroll: true });
    this._previousFocus = null;

    // Do not leave the words in the DOM after the book is closed.
    setTimeout(() => {
      const body = overlay.querySelector('.page-body');
      if (body) body.replaceChildren();
    }, 1200);

    this.pages = [];
    if (!silent) onClose?.();
    resolve?.({ closed: true });
  }
}
