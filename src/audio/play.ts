import { clipsFor, playBlob } from './recordings';
import { speak } from './tts';

const turn: Record<string, number> = {};

/**
 * Play an item: a real recording if one exists (rotating takes), otherwise browser TTS
 * with a rotating voice.
 */
export async function playItem(packId: string, audioId: string, text: string, lang: string, rate = 0.9) {
  const clips = await clipsFor(packId, audioId);
  if (clips.length) {
    const k = `${packId}|${audioId}`;
    const i = turn[k] ?? 0;
    turn[k] = i + 1;
    return playBlob(clips[i % clips.length].blob);
  }
  return speak(text, lang, { rate });
}
