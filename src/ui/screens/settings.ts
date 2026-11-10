import type { App, ScreenView } from '../../app';
import { audio } from '../../audio/audio';
import { clearSave, exportSave, importSave, newSave, SaveError } from '../../storage/save';
import { ACTIONS, ACTION_LABELS, defaultKeys, keyLabel, type Action, type Settings } from '../../storage/settings';
import { h, icon } from '../dom';
import { shell } from '../shell';
import { seg } from './prematch';

export function settingsScreen(app: App): ScreenView {
  const s = app.settings;
  const root = h('div', { class: 'settings-grid' });
  let capture: { action: Action; slot: 0 | 1 } | null = null;

  const apply = () => {
    app.applySettings();
    app.persist();
  };
  const toggle = (label: string, key: keyof Settings, note?: string) => {
    const id = `set-${key}`;
    const input = h('input', { type: 'checkbox', id, checked: s[key] as boolean }) as HTMLInputElement;
    input.addEventListener('change', () => {
      (s[key] as boolean) = input.checked;
      apply();
    });
    return h('div', { class: 'opt' }, h('label', { class: 'opt-head switch', for: id }, h('b', null, label), input, h('span', { class: 'switch-ui', 'aria-hidden': 'true' })), note ? h('p', { class: 'muted' }, note) : null);
  };
  const slider = (label: string, key: 'masterVolume' | 'musicVolume' | 'effectsVolume' | 'touchScale', min: number, max: number, onInput?: () => void) => {
    const out = h('b', null, `${Math.round(s[key] * 100)}%`);
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: '0.05', value: String(s[key]), 'aria-label': label }) as HTMLInputElement;
    input.addEventListener('input', () => {
      s[key] = Number(input.value);
      out.textContent = `${Math.round(s[key] * 100)}%`;
      app.applySettings();
      onInput?.();
    });
    input.addEventListener('change', () => app.persist());
    return h('div', { class: 'opt' }, h('div', { class: 'opt-head' }, h('b', null, label), out), input);
  };
  const choice = <K extends keyof Settings>(label: string, key: K, options: { value: Settings[K] & (string | number); label: string }[], note?: string) =>
    h('div', { class: 'opt' }, h('div', { class: 'opt-head' }, h('b', null, label), seg(options, s[key] as Settings[K] & (string | number), (v) => {
      (s[key] as Settings[K]) = v as Settings[K];
      apply();
      render();
    }, label)), note ? h('p', { class: 'muted' }, note) : null);

  const onKey = (e: KeyboardEvent) => {
    if (!capture) return;
    e.preventDefault();
    e.stopPropagation();
    const { action, slot } = capture;
    capture = null;
    if (e.code !== 'Escape' || action === 'pause') {
      // a key can only be bound once: remove it from wherever else it was
      for (const a of ACTIONS) for (const i of [0, 1] as const) if (s.keys[a][i] === e.code) s.keys[a][i] = '';
      s.keys[action][slot] = e.code;
      app.persist();
    }
    render();
  };
  window.addEventListener('keydown', onKey, true);

  const controls = () =>
    h('section', { class: 'panel settings-card controls-card', id: 'set-controls' },
      h('h2', { class: 'section-head' }, icon('edit'), 'Controls'),
      h('p', { class: 'muted' }, 'Mouse: move to aim, left button kicks, right button swings. Click a key to rebind it, then press the new key.'),
      h('div', { class: 'bind-table' },
        ACTIONS.map((a) =>
          h('div', { class: 'bind-row' }, h('span', null, ACTION_LABELS[a]),
            ([0, 1] as const).map((i) => {
              const active = capture?.action === a && capture.slot === i;
              return h('button', { class: `key${active ? ' is-capturing' : ''}`, 'aria-label': `${ACTION_LABELS[a]} key ${i + 1}: ${keyLabel(s.keys[a][i])}`, onclick: () => {
                capture = active ? null : { action: a, slot: i };
                render();
              } }, active ? 'Press a key…' : keyLabel(s.keys[a][i]));
            }),
          ),
        ),
      ),
      h('div', { class: 'row-2' },
        h('button', { class: 'btn btn-small btn-ghost', onclick: () => {
          s.keys = defaultKeys();
          app.persist();
          render();
        } }, icon('retry'), 'Reset keys'),
      ),
      choice('Aim mode', 'aimMode', [{ value: 'auto', label: 'Auto' }, { value: 'mouse', label: 'Mouse' }, { value: 'keyboard', label: 'Keyboard' }], s.aimMode === 'keyboard' ? 'Kicks and anchors follow your movement direction; assists pick the goal or a teammate when you face them.' : s.aimMode === 'mouse' ? 'Always aim with the cursor.' : 'Uses the cursor after you move the mouse, and movement direction after you use the keyboard kick or tether keys.'),
      slider('Touch control size', 'touchScale', 0.7, 1.5),
      toggle('Left-handed touch layout', 'touchSwap', 'Moves the stick to the right and the buttons to the left.'),
    );

  const data = () => {
    const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true }) as HTMLInputElement;
    // Validate first; the current profile is untouched unless the import is valid and confirmed.
    const applyImport = async (text: string, source: 'file' | 'code') => {
      try {
        const imported = importSave(text);
        const ok = await app.confirm({ title: 'Replace current club?', body: `Import “${imported.club.name}” (club level data, ${imported.records.matches} matches played)? Your current club will be replaced.`, confirm: 'Import', danger: true });
        if (!ok) return;
        app.save = imported;
        app.hasClub = true;
        app.applySettings();
        app.persist();
        app.syncStage(true);
        app.toast('Save imported.', 'good');
        app.navigate('home');
      } catch (e) {
        app.toast(e instanceof SaveError ? `Import failed: ${e.message}` : `Import failed: the ${source === 'file' ? 'file' : 'save code'} could not be read.`, 'bad', 6000);
      }
    };
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      let text: string;
      try {
        text = await f.text();
      } catch {
        app.toast('Import failed: the file could not be read.', 'bad', 6000);
        return;
      }
      await applyImport(text, 'file');
    });
    // Save codes are the same JSON as an exported file, for browsers and embeds that block downloads.
    const codeBox = (value: string, readOnly: boolean) => {
      const box = h('textarea', { class: 'save-code', id: readOnly ? 'save-code-out' : 'save-code-in', spellcheck: 'false', 'aria-label': 'Save code', readOnly: readOnly || null, placeholder: readOnly ? null : 'Paste a save code here' }) as HTMLTextAreaElement;
      box.value = value;
      return box;
    };
    const copyCode = async () => {
      const code = exportSave(app.save);
      try {
        await navigator.clipboard.writeText(code);
        app.toast('Save code copied. Keep it somewhere safe.', 'good');
      } catch {
        const box = codeBox(code, true);
        setTimeout(() => { box.focus(); box.select(); });
        await app.confirm({ title: 'Your save code', body: h('div', { class: 'stack' }, h('p', null, 'Copying was blocked here. The code is selected below: copy it with Ctrl+C (or long-press on a phone).'), box), confirm: 'Done', cancel: 'Close' });
      }
    };
    const pasteCode = async () => {
      const box = codeBox('', false);
      setTimeout(() => box.focus());
      const ok = await app.confirm({ title: 'Paste save code', body: h('div', { class: 'stack' }, h('p', null, 'Paste a save code from “Copy save code”. You will be asked before your current club is replaced.'), box), confirm: 'Load code' });
      if (ok && box.value.trim()) await applyImport(box.value.trim(), 'code');
    };
    return h('section', { class: 'panel settings-card', id: 'set-data' },
      h('h2', { class: 'section-head' }, icon('save'), 'Save data'),
      h('p', { class: 'muted' }, app.storage ? (app.saveFailed ? 'Saving is currently failing in this browser. Export a copy to keep your progress.' : 'Progress saves automatically in this browser after every result, purchase and change.') : 'Browser storage is blocked, so nothing can be saved automatically. Export a copy to keep your progress.'),
      h('div', { class: 'data-actions' },
        h('button', { class: 'btn', onclick: () => {
          const blob = new Blob([exportSave(app.save)], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: `tether-league-${app.save.club.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json` });
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          app.toast('Save exported.', 'good');
        } }, 'Export save'),
        h('button', { class: 'btn', onclick: () => file.click() }, 'Import save'),
        h('button', { class: 'btn', onclick: copyCode }, 'Copy save code'),
        h('button', { class: 'btn', onclick: pasteCode }, 'Paste save code'),
        file,
        h('button', { class: 'btn btn-danger', onclick: async () => {
          const ok = await app.confirm({ title: 'Start a new club?', body: 'This permanently deletes your club, credits, unlocks, trophies and records in this browser. Export a save first if you might want it back.', confirm: 'Delete and start over', danger: true });
          if (!ok) return;
          const keep = app.settings;
          clearSave(app.storage);
          app.save = newSave(undefined, keep);
          app.hasClub = false;
          app.syncStage(true);
          app.navigate('setup', true);
        } }, 'New career…'),
      ),
    );
  };

  const render = () => {
    root.replaceChildren(
      h('section', { class: 'panel settings-card', id: 'set-audio' },
        h('h2', { class: 'section-head' }, icon('sound'), 'Audio'),
        toggle('Mute all sound', 'muted'),
        slider('Master volume', 'masterVolume', 0, 1),
        slider('Music', 'musicVolume', 0, 1),
        slider('Effects', 'effectsVolume', 0, 1, () => audio.play('kick', { intensity: 0.5 })),
        h('p', { class: 'muted' }, 'All sound and music is synthesised live by the game.'),
      ),
      h('section', { class: 'panel settings-card', id: 'set-graphics' },
        h('h2', { class: 'section-head' }, icon('settings'), 'Graphics & comfort'),
        choice('Quality', 'quality', [{ value: 'auto', label: 'Auto' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }], `Currently rendering at ${app.gfx.quality} quality. Low removes shadows and thins the crowd; the pitch, anchors and ball stay clear.`),
        toggle('Reduced motion', 'reducedMotion', 'Removes confetti, camera shake, hops and decorative animation.'),
        toggle('Camera shake', 'cameraShake', 'A small shake on goals and swing shots.'),
        toggle('High contrast panels', 'highContrast', 'Stronger outlines on menus and a permanent ring around the ball.'),
        choice('Text size', 'textScale', [{ value: 1, label: 'Normal' }, { value: 1.15, label: 'Large' }, { value: 1.3, label: 'Larger' }]),
      ),
      h('section', { class: 'panel settings-card', id: 'set-assist' },
        h('h2', { class: 'section-head' }, icon('target'), 'Assistance'),
        choice('Aim assist', 'aimAssistance', [{ value: 'off', label: 'Off' }, { value: 'light', label: 'Light' }, { value: 'strong', label: 'Strong' }], 'Nudges kicks that are already close to the goal or a teammate. It never moves the ball for you.'),
        toggle('Smart swing', 'swingAssist', 'A quick tap swings round the highlighted anchor and lets go automatically toward your aim. Tap again to let go early. Holding the button gives full manual control.'),
        toggle('Anchor line', 'anchorLine', 'Draws a faint line from your robot to the highlighted anchor.'),
        toggle('Ball outline', 'ballOutline', 'Keeps a bright ring under the ball at all times.'),
        toggle('Show hints', 'showHints', 'Contextual control hints during your first matches.'),
      ),
      controls(),
      data(),
    );
  };
  render();

  const jump = (id: string, label: string, ic: string) => h('button', { onclick: () => {
    const card = root.querySelector<HTMLElement>(`#${id}`);
    if (!card) return;
    card.scrollIntoView({ behavior: document.body.classList.contains('reduced-motion') ? 'auto' : 'smooth', block: 'start' });
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
  } }, icon(ic), label);
  const jumps = h('nav', { class: 'settings-jump', 'aria-label': 'Settings sections' },
    jump('set-audio', 'Audio', 'sound'), jump('set-graphics', 'Graphics', 'settings'), jump('set-assist', 'Assistance', 'target'), jump('set-controls', 'Controls', 'edit'), jump('set-data', 'Save data', 'save'));
  const el = shell(app, { nav: 'settings', title: 'Settings', subtitle: 'Sound, comfort, controls and saves', dim: true, cls: 'settings' }, jumps, root);
  return { el, dispose: () => window.removeEventListener('keydown', onKey, true) };
}
