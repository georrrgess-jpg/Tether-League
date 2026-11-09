import '@fontsource/kanit/latin-600.css';
import '@fontsource/kanit/latin-700.css';
import '@fontsource/kanit/latin-700-italic.css';
import '@fontsource/kanit/latin-800-italic.css';
import '@fontsource-variable/nunito/wght.css';
import './ui/styles/base.css';
import './ui/styles/hud.css';
import { audio } from './audio/audio';
import { CLUB_STYLE, DIFFICULTY, TENDENCY } from './game/ai/bot';
import { MatchMode } from './game/modes/matchMode';
import { Gfx } from './game/render/gfx';
import { PlaySession } from './game/session';
import { defaultSettings } from './storage/settings';
import type { RobotLook } from './content/cosmetics';

const settings = defaultSettings();
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const host = document.getElementById('app')!;
const q = new URLSearchParams(location.search);
if (q.get('q')) settings.quality = q.get('q') as any;
const gfx = new Gfx(canvas, settings.quality);
window.addEventListener('pointerdown', () => audio.unlock(), { once: false });
const look = (primary: string, secondary: string, number: number, chassis: RobotLook['chassis'] = 'all_rounder'): RobotLook => ({
  chassis, primary, secondary, number, face: 'face_basic', pattern: 'pattern_plain', trail: 'trail_standard', celebration: 'celebration_wave',
});
function start() {
  const mode = new MatchMode(
    {
      matchId: 'dev', kind: 'quick', label: 'Dev match', arena: (q.get('arena') as any) ?? 'harbor_park',
      home: { id: 'player', name: 'Harbor Sparks', badge: 'badge_shield', primary: '#12BCD2', secondary: '#17273E' },
      away: { id: 'ember_works', name: 'Ember Works', badge: 'badge_flame', primary: '#F48A2C', secondary: '#3a2a22' },
      looks: [look('#12BCD2', '#17273E', 7), look('#12BCD2', '#17273E', 11, 'scout'), look('#F48A2C', '#3a2a22', 3, 'bulwark'), look('#F48A2C', '#3a2a22', 6, 'glider')],
      oppDifficulty: DIFFICULTY.club, oppStyle: CLUB_STYLE.pressure, mateDifficulty: DIFFICULTY.club, mateStyle: TENDENCY.supportive.style,
      assist: 1, regulationSeconds: 180, seed: 5, hints: true,
    },
    () => settings,
  );
  const session = new PlaySession({ gfx, host, settings: () => settings, saveSettings: () => {} }, mode, {
    onDone: () => { session.stop(); start(); },
    onLeave: () => { session.stop(); start(); },
    onRestart: () => { session.stop(); start(); },
  });
  (window as any).__session = session;
  session.start();
}
document.fonts.ready.then(start);
