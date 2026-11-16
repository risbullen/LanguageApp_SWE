/**
 * The learner's own native-speaker recordings (or a helper's), stored in IndexedDB.
 * Several takes per item are kept; playback rotates through them (more voice variety).
 */
const DB = 'lang-audio';
const STORE = 'clips';

export interface Clip {
  id: string; // `${packId}|${audioId}|${timestamp}`
  key: string; // `${packId}|${audioId}`
  blob: Blob;
  created: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('key', 'key');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function saveClip(packId: string, audioId: string, blob: Blob) {
  const key = `${packId}|${audioId}`;
  const created = Date.now();
  await tx('readwrite', (s) => s.put({ id: `${key}|${created}`, key, blob, created } satisfies Clip));
  notify();
}

export async function clipsFor(packId: string, audioId: string): Promise<Clip[]> {
  try {
    return await tx('readonly', (s) => s.index('key').getAll(`${packId}|${audioId}`) as IDBRequest<Clip[]>);
  } catch {
    return [];
  }
}

export async function allClipKeys(packId: string): Promise<Set<string>> {
  try {
    const all = await tx('readonly', (s) => s.getAll() as IDBRequest<Clip[]>);
    return new Set(all.filter((c) => c.key.startsWith(`${packId}|`)).map((c) => c.key.split('|')[1]));
  } catch {
    return new Set();
  }
}

export async function deleteClips(packId: string, audioId: string) {
  for (const c of await clipsFor(packId, audioId)) await tx('readwrite', (s) => s.delete(c.id));
  notify();
}

const listeners = new Set<() => void>();
export const onClipsChanged = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const notify = () => listeners.forEach((f) => f());

/** Record from the microphone until stop() is called. */
export async function startRecording(): Promise<{ stop: () => Promise<Blob> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
        };
        rec.stop();
      }),
  };
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
