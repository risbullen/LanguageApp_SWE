import { useEffect, useMemo, useState } from 'react';
import { getPack, PACKS } from './content/index';
import type { ScriptId } from './content/schema';
import { loadProgress, loadSettings, saveSettings, type Progress, type Settings } from './engine/store';
import { Ctx } from './ctx';
import { Home } from './ui/Home';
import { Session } from './ui/Session';
import { SettingsScreen } from './ui/Settings';
import { Recorder } from './ui/Recorder';

type Tab = 'home' | 'record' | 'settings';

const DEFAULTS: Settings = { packId: PACKS[0].pack_id, mode: 'associative', script: 'Latin', rate: 0.9 };

export default function App() {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings(DEFAULTS));
  const pack = getPack(settings.packId);
  const [progress, setProgress] = useState<Progress>(() => loadProgress(pack.pack_id));
  const [tab, setTab] = useState<Tab>('home');
  const [unit, setUnit] = useState<string | null>(null);

  useEffect(() => setProgress(loadProgress(pack.pack_id)), [pack.pack_id]);

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
        {unit ? (
          <Session unitId={unit} onExit={() => setUnit(null)} />
        ) : (
          <>
            <header className="top">
              <h1>
                <span aria-hidden="true">{pack.flag}</span> {pack.name}
              </h1>
            </header>
            {tab === 'home' && <Home onStart={setUnit} />}
            {tab === 'record' && <Recorder />}
            {tab === 'settings' && <SettingsScreen />}
            <nav className="tabs">
              {(
                [
                  ['home', '🏠', 'Learn'],
                  ['record', '🎙️', 'Recordings'],
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
