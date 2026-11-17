import { useEffect, useMemo, useState } from 'react';
import { getPack, PACKS } from './content/index';
import type { ScriptId } from './content/schema';
import { loadProgress, loadSettings, saveSettings, type Progress, type Settings } from './engine/store';
import { Ctx } from './ctx';
import { Home } from './ui/Home';
import { Session } from './ui/Session';
import { SettingsScreen } from './ui/Settings';
import { Shop } from './ui/Shop';
import { onVoiceSource, unlockAudio, type VoiceSource } from './audio/tts';
import { sfx } from './audio/sfx';

type Tab = 'home' | 'shop' | 'settings';

const DEFAULTS: Settings = { packId: PACKS[0].pack_id, mode: 'associative', script: 'Latin', rate: 0.9 };

export default function App() {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings(DEFAULTS));
  const pack = getPack(settings.packId);
  const [progress, setProgress] = useState<Progress>(() => loadProgress(pack.pack_id));
  const [tab, setTab] = useState<Tab>('home');
  const [unit, setUnit] = useState<string | null>(null);
  const [courseId, setCourseIdState] = useState<string>(() => {
    try {
      return localStorage.getItem('lang:course') ?? '';
    } catch {
      return '';
    }
  });
  const setCourseId = (id: string) => {
    setCourseIdState(id);
    try {
      localStorage.setItem('lang:course', id);
    } catch {
      /* ignore */
    }
  };

  const [voice, setVoice] = useState<VoiceSource | null>(null);

  useEffect(() => setProgress(loadProgress(pack.pack_id)), [pack.pack_id]);
  useEffect(() => onVoiceSource(setVoice), []);
  // phones only allow sound after a tap: unlock audio on the first one
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      sfx.unlock();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const script = (pack.script_metadata.supported_scripts.includes(settings.script as ScriptId)
    ? settings.script
    : pack.script_metadata.primary_script) as ScriptId;

  const ctx = useMemo(
    () => ({
      pack,
      settings,
      script,
      progress,
      setProgress,
      setSettings: (s: Settings) => {
        saveSettings(s);
        setSettingsState(s);
      },
    }),
    [pack, settings, script, progress],
  );

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        {voice === 'none' && (
          <p className="banner voice-warning" role="alert">
            No {pack.name} voice available. The online voice didn’t load and this device has no {pack.tts_lang} voice. Check your internet connection.
          </p>
        )}
        {unit ? (
          <Session unitId={unit} onExit={() => setUnit(null)} />
        ) : (
          <>
            {tab === 'home' && <Home courseId={courseId} onCourse={setCourseId} onStart={setUnit} onShop={() => setTab('shop')} />}
            {tab === 'shop' && (
              <Shop
                onOpen={(id) => {
                  setCourseId(id);
                  setTab('home');
                }}
              />
            )}
            {tab === 'settings' && <SettingsScreen />}
            <nav className="tabs">
              {(
                [
                  ['home', '🏠', 'Learn'],
                  ['shop', '🛍️', 'Shop'],
                  ['settings', '⚙️', 'Settings'],
                ] as const
              ).map(([id, icon, label]) => (
                <button type="button" key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
                  <span aria-hidden="true">{icon}</span>
                  {label}
                </button>
              ))}
            </nav>
          </>
        )}
      </div>
    </Ctx.Provider>
  );
}
