import { PACKS } from '../content/index';
import { emptyProgress, saveProgress } from '../engine/store';
import { voicesFor } from '../audio/tts';
import { useApp } from '../ctx';

export function SettingsScreen() {
  const { pack, settings, setSettings, setProgress, script } = useApp();
  const voices = voicesFor(pack.tts_lang);
  return (
    <div className="screen settings">
      <h2>Settings</h2>
      <label className="field">
        <span>Language</span>
        <select
          value={settings.packId}
          onChange={(e) => {
            const p = PACKS.find((x) => x.pack_id === e.target.value)!;
            setSettings({ ...settings, packId: p.pack_id, script: p.script_metadata.primary_script });
          }}
        >
          {PACKS.map((p) => (
            <option key={p.pack_id} value={p.pack_id}>
              {p.flag} {p.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="field">
        <legend>Learning style</legend>
        <label className="radio">
          <input type="radio" checked={settings.mode === 'associative'} onChange={() => setSettings({ ...settings, mode: 'associative' })} />
          <span>
            <strong>Listen first</strong>
            <small>Pictures and sound. Text stays hidden until you ask for it.</small>
          </span>
        </label>
        <label className="radio">
          <input type="radio" checked={settings.mode === 'analytical'} onChange={() => setSettings({ ...settings, mode: 'analytical' })} />
          <span>
            <strong>Read along</strong>
            <small>Spelling, pronunciation symbols and notes shown right away.</small>
          </span>
        </label>
      </fieldset>

      {pack.script_metadata.supported_scripts.length > 1 && (
        <label className="field">
          <span>Script</span>
          <select value={script} onChange={(e) => setSettings({ ...settings, script: e.target.value })}>
            {pack.script_metadata.supported_scripts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>Speech speed: {settings.rate.toFixed(2)}×</span>
        <input type="range" min="0.6" max="1.2" step="0.05" value={settings.rate} onChange={(e) => setSettings({ ...settings, rate: Number(e.target.value) })} />
      </label>

      <div className="field">
        <span>Voices on this device for {pack.tts_lang}</span>
        {voices.length ? (
          <ul className="voices">
            {voices.map((v) => (
              <li key={v.voiceURI}>{v.name}</li>
            ))}
          </ul>
        ) : (
          <p className="hint">
            None found. Add your own recordings under Recordings{pack.target_language === 'pa' ? ' (Punjabi voices are rare on most devices)' : ''}.
          </p>
        )}
        {voices.length === 1 && <p className="hint">Only one voice, so every word sounds the same speaker. Recording a few different people helps your ear.</p>}
      </div>

      <button
        type="button"
        className="danger"
        onClick={() => {
          if (confirm(`Reset all progress for ${pack.name}? Recordings are kept.`)) {
            const p = emptyProgress();
            saveProgress(pack.pack_id, p);
            setProgress(p);
          }
        }}
      >
        Reset progress for {pack.name}
      </button>
      <p className="muted small">Pack {pack.pack_id}. Everything is stored on this device only.</p>
    </div>
  );
}
