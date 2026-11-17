import { useEffect, useState } from 'react';
import { PACKS } from '../content/index';
import { emptyProgress, saveProgress } from '../engine/store';
import { deviceVoicesFor, getVoiceSource, speak, type VoiceSource } from '../audio/tts';
import { canRecordAlongside, recognitionSupported, type ListenResult } from '../audio/listen';
import { PushToTalk } from './common';
import { versionLabel } from '../version';
import { useApp } from '../ctx';

const SAMPLE: Record<string, string> = { sv: 'Hej! Välkommen.', pa: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ' };

export function SettingsScreen() {
  const { pack, settings, setSettings, setProgress, script } = useApp();
  const [deviceVoices, setDeviceVoices] = useState<string[]>([]);
  const [tested, setTested] = useState<VoiceSource | null>(getVoiceSource());
  const [mic, setMic] = useState<ListenResult | null>(null);
  useEffect(() => {
    deviceVoicesFor(pack.tts_lang).then((v) => setDeviceVoices(v.map((x) => x.name)));
  }, [pack.tts_lang]);

  const voiceText: Record<VoiceSource, string> = {
    file: 'Built-in voices (pre-recorded with Piper, several speakers). Works offline.',
    google: 'Online voice (Google). Works.',
    device: `This device's ${pack.tts_lang} voice. The online voice didn't load.`,
    none: `No ${pack.tts_lang} voice found. Check your internet connection.`,
  };

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

      <label className="radio">
        <input
          type="checkbox"
          checked={settings.english !== false}
          onChange={(e) => setSettings({ ...settings, english: e.target.checked })}
        />
        <span>
          <strong>Show English after answering</strong>
          <small>Confirms what a word or sentence meant, once you've answered. Never shown before.</small>
        </span>
      </label>

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
        <input type="range" min="0.6" max="1.1" step="0.05" value={settings.rate} onChange={(e) => setSettings({ ...settings, rate: Number(e.target.value) })} />
      </label>

      <div className="field">
        <span>Voice</span>
        <button
          type="button"
          className="secondary"
          onClick={async () => setTested(await speak(SAMPLE[pack.target_language] ?? 'Hello', pack.tts_lang, { rate: settings.rate }))}
        >
          🔊 Test voice
        </button>
        {tested && <p className={tested === 'none' ? 'banner' : 'hint left'}>{voiceText[tested]}</p>}
        <p className="hint left">
          Backup voices on this device: {deviceVoices.length ? deviceVoices.join(', ') : 'none'}
        </p>
      </div>

      <div className="field">
        <span>Speaking</span>
        {recognitionSupported() ? (
          <div className="mic-test">
            <p className="hint left">Test the microphone: hold the button, wait for “Speak now…”, then say something in {pack.name}.</p>
            <PushToTalk onResult={setMic} label="Test microphone" compact />
            {mic && (
              <p className="mic-result">
                {mic.transcripts.length ? (
                  <>
                    ✅ Heard: “{mic.transcripts[0]}”
                  </>
                ) : (
                  <>❌ Nothing recognised. Error code: {mic.rawError ?? mic.error}</>
                )}
                <br />
                <span className="muted small">
                  Your-voice playback: {canRecordAlongside() ? 'on' : 'off on this device (it would block the microphone)'}
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="hint left">This browser can’t check speech. Use Chrome (Android or computer) for push-to-talk.</p>
        )}
      </div>

      <button
        type="button"
        className="danger"
        onClick={() => {
          if (confirm(`Reset all progress for ${pack.name}?`)) {
            const p = emptyProgress();
            saveProgress(pack.pack_id, p);
            setProgress(p);
          }
        }}
      >
        Reset progress for {pack.name}
      </button>
      <p className="muted small">Pack {pack.pack_id}. Progress is stored on this device only.</p>
      <p className="version">{versionLabel()}</p>
    </div>
  );
}
