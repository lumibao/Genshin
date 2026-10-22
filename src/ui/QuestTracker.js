/**
 * The quest tracker panel and chapter badge.
 * Purely a view: all state arrives from QuestManager snapshots.
 */
export class QuestTracker {
  constructor(game) {
    this.game = game;
    this.panel = document.getElementById('quest-tracker');
    this.titleEl = document.getElementById('quest-title');
    this.listEl = document.getElementById('quest-objectives');
    this.kickerEl = document.getElementById('chapter-kicker');
    this.chapterEl = document.getElementById('chapter-name');
    this._lastSignature = '';
  }

  setChapter(kicker, title) {
    if (this.kickerEl) this.kickerEl.textContent = kicker;
    if (this.chapterEl) this.chapterEl.textContent = title;
  }

  render(snapshot) {
    if (!snapshot || !snapshot.level) return;
    const level = snapshot.level;
    if (this.titleEl) this.titleEl.textContent = level.title;

    const signature = JSON.stringify(
      snapshot.objectives.map((o) => [o.id, o.value, o.done]) + [snapshot.completed, snapshot.levelId],
    );
    if (signature === this._lastSignature) return;
    this._lastSignature = signature;

    this.listEl.replaceChildren();

    const incomplete = snapshot.objectives.filter((o) => !o.done && !o.optional).length;

    snapshot.objectives.forEach((objective) => {
      const li = document.createElement('li');
      li.className = objective.done ? 'is-done' : incomplete > 0 && snapshot.objectives.find((o) => !o.done && !o.optional)?.id === objective.id ? 'is-current' : '';
      if (objective.optional && !objective.done) li.classList.add('is-optional');

      const label = document.createElement('span');
      label.textContent = objective.text;
      li.appendChild(label);

      if (objective.target > 1) {
        const progress = document.createElement('span');
        progress.className = 'quest-progress';
        progress.textContent = `${objective.value}/${objective.target}`;
        li.appendChild(progress);
      }

      this.listEl.appendChild(li);
    });

    if (snapshot.completed) {
      const li = document.createElement('li');
      li.className = 'objective-hint';
      li.textContent =
        snapshot.levelId === 5
          ? 'The chronicle is open. Follow the light when you are ready.'
          : 'Chapter complete — seek the waystone to continue.';
      this.listEl.appendChild(li);
    } else {
      const current = snapshot.objectives.find((o) => !o.done && !o.optional);
      if (current?.hint && this.game.settings.hints) {
        const li = document.createElement('li');
        li.className = 'objective-hint';
        li.textContent = current.hint;
        this.listEl.appendChild(li);
      }
    }

    if (this.panel) {
      this.panel.classList.remove('is-updating');
      // Force reflow so the animation can replay.
      void this.panel.offsetWidth;
      this.panel.classList.add('is-updating');
    }
  }

  setVisible(visible) {
    if (this.panel) this.panel.classList.toggle('hidden', !visible);
  }
}
