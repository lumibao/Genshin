/**
 * Project Asteria — entry point.
 * Boots the game after the interface shell is ready.
 */
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-500.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';

import { Game } from './game/Game.js';

const game = new Game();

// Expose a single debug handle. It is intentionally not the secret message —
// that module is only fetched after the reveal gate (see SecretReveal.js).
window.projectAsteria = game;

// Prevent iOS double-tap zoom / long-press callouts during play.
document.addEventListener('gesturestart', (event) => event.preventDefault());
document.addEventListener('dblclick', (event) => {
  if (event.target.closest('#hud, #scene-root')) event.preventDefault();
});

game.boot().catch((err) => {
  console.error('[Asteria] fatal boot error', err);
  const screen = document.getElementById('screen-fatal');
  if (screen) {
    document.getElementById('fatal-title').textContent = 'The wind could not reach this world';
    document.getElementById('fatal-message').textContent = err?.message || String(err);
    document.getElementById('fatal-hint').textContent = 'Reload the page to try again.';
    screen.classList.remove('hidden');
  }
});
