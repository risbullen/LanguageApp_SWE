/**
 * Push-to-talk: browser speech recognition, plus (where the browser allows both at
 * once) an in-memory recording of the attempt so the learner can hear native vs. self.
 * Nothing is stored: the recording lives only until the next attempt.
 */

// Minimal typing for the Web Speech API (not in TS's DOM lib everywhere).
interface RecAlternative {
  transcript: string;
  confidence: number;
}
interface RecEvent {
  results: ArrayLike<ArrayLike<RecAlternative> & { isFinal: boolean }>;
}
interface Rec {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecEvent) => void) | null;
  onstart: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecCtor = new () => Rec;

const Ctor = (): RecCtor | undefined =>
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecCtor }).webkitSpeechRecognition);

export const recognitionSupported = () => !!Ctor();

export interface ListenResult {
  transcripts: string[]; // best first
  recording: Blob | null;
  error?: 'no-speech' | 'not-allowed' | 'network' | 'other';
  rawError?: string; // the browser's own error code, shown for diagnosis
  usedRecorder: boolean;
}

export interface Listening {
  /** Stop listening and get the result (also resolves on its own when the user goes quiet). */
  stop: () => void;
  result: Promise<ListenResult>;
  /** Live partial transcript callback. */
  onPartial?: (t: string) => void;
}

const CONFLICT_KEY = 'lang:recorderConflicts';
const recorderConflicts = () => {
  try {
    return localStorage.getItem(CONFLICT_KEY) === '1';
  } catch {
    return false;
  }
};
export function markRecorderConflict() {
  try {
    localStorage.setItem(CONFLICT_KEY, '1');
  } catch {
    /* ignore */
  }
}

/**
 * Can we record the attempt (for "▶ You") while recognising it? Not on Android: Chrome
 * there gives the microphone to only one of them, and recognition then hears silence.
 */
export function canRecordAlongside(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return !/Android/i.test(ua) && !recorderConflicts();
}

async function startRecorder(): Promise<{ stop: () => Promise<Blob | null> } | null> {
  if (!canRecordAlongside() || typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start();
    return {
      stop: () =>
        new Promise((resolve) => {
          const finish = () => {
            stream.getTracks().forEach((t) => t.stop());
            resolve(chunks.length ? new Blob(chunks, { type: rec.mimeType || 'audio/webm' }) : null);
          };
          if (rec.state === 'inactive') return finish();
          rec.onstop = finish;
          rec.stop();
        }),
    };
  } catch {
    return null;
  }
}

export function listen(lang: string, onPartial?: (t: string) => void, onStart?: () => void): Listening {
  const C = Ctor();
  let stopFn = () => {};
  const result = new Promise<ListenResult>((resolve) => {
    if (!C) return resolve({ transcripts: [], recording: null, error: 'other', rawError: 'unsupported', usedRecorder: false });
    const rec = new C();
    rec.lang = lang;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = false;
    const finals: string[] = [];
    let partial = '';
    let error: ListenResult['error'];
    let rawError: string | undefined;
    const recorderP = startRecorder();
    let ended = false;
    rec.onstart = () => onStart?.();

    rec.onresult = (e) => {
      partial = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) for (let k = 0; k < r.length; k++) finals.push(r[k].transcript);
        else partial += r[0].transcript;
      }
      onPartial?.(partial || finals[0] || '');
    };
    rec.onerror = (e) => {
      rawError = e.error;
      error = e.error === 'no-speech' ? 'no-speech' : e.error === 'not-allowed' ? 'not-allowed' : e.error === 'network' ? 'network' : 'other';
      // Some phones can't share the mic between recognition and a recorder.
      if (e.error === 'audio-capture') markRecorderConflict();
    };
    rec.onend = async () => {
      if (ended) return;
      ended = true;
      const recorder = await recorderP;
      const recording = recorder ? await recorder.stop() : null;
      const transcripts = finals.length ? finals : partial ? [partial] : [];
      resolve({
        transcripts,
        recording,
        error: transcripts.length ? undefined : (error ?? 'no-speech'),
        rawError: transcripts.length ? undefined : (rawError ?? 'no-result'),
        usedRecorder: !!recorder,
      });
    };
    stopFn = () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    };
    try {
      rec.start();
    } catch {
      ended = true;
      resolve({ transcripts: [], recording: null, error: 'other', rawError: 'start-failed', usedRecorder: false });
    }
  });
  return { stop: () => stopFn(), result };
}

export function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    const done = () => (URL.revokeObjectURL(url), resolve());
    a.onended = done;
    a.onerror = done;
    a.play().catch(done);
  });
}
