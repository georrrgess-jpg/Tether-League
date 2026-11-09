import '@fontsource/kanit/latin-600.css';
import '@fontsource/kanit/latin-700.css';
import '@fontsource/kanit/latin-700-italic.css';
import '@fontsource/kanit/latin-800-italic.css';
import '@fontsource-variable/nunito/wght.css';
import './ui/styles/base.css';
import './ui/styles/hud.css';
import './ui/styles/menus.css';
import { App } from './app';

function boot(): void {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) {
    document.getElementById('app')!.innerHTML =
      '<div class="overlay"><div class="panel dialog"><div class="panel-title">WebGL is unavailable</div><p>Tether League needs WebGL to draw the match. Try enabling hardware acceleration, updating your browser, or using a different device.</p></div></div>';
    return;
  }
  const app = new App();
  // Handy for automated checks and debugging; not used by the game itself.
  (window as unknown as { __tether: App }).__tether = app;
}

boot();
