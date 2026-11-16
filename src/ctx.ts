import { createContext, useContext } from 'react';
import type { Pack, ScriptId } from './content/schema';
import type { Progress, Settings } from './engine/store';

export interface AppCtx {
  pack: Pack;
  settings: Settings;
  script: ScriptId;
  setSettings: (s: Settings) => void;
  progress: Progress;
  setProgress: (p: Progress) => void;
}

export const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('no app context');
  return c;
};
