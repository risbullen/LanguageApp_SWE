"""Pre-generate speech files with Piper (free, offline, MIT).

Usage: python scripts/gen_audio.py audio-texts.json voices/ public/audio/

For every language with Piper voices in voices/ (files like sv_SE-nst-medium.onnx) and every
text, writes public/audio/<lang>/<key>.<voice index>.mp3 and a manifest the app reads.
Existing files are kept, so a cached run only synthesizes new texts.
"""

import json
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

from piper import PiperVoice


def main() -> None:
    texts = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    voices_dir, out_dir = Path(sys.argv[2]), Path(sys.argv[3])
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {}

    by_lang = {}
    for t in texts:
        by_lang.setdefault(t["lang"], []).append(t)

    for lang, items in by_lang.items():
        models = sorted(voices_dir.glob(f"{lang}_*.onnx"))
        if not models:
            print(f"{lang}: no Piper voice, skipped (app falls back to live voice)")
            continue
        lang_dir = out_dir / lang
        lang_dir.mkdir(exist_ok=True)
        made = 0
        for vi, model in enumerate(models):
            voice = PiperVoice.load(str(model))
            for t in items:
                mp3 = lang_dir / f"{t['key']}.{vi}.mp3"
                if mp3.exists():
                    continue
                with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
                    with wave.open(tmp.name, "wb") as wf:
                        voice.synthesize_wav(t["text"], wf)
                    subprocess.run(
                        ["ffmpeg", "-loglevel", "error", "-y", "-i", tmp.name, "-ac", "1", "-b:a", "40k", str(mp3)],
                        check=True,
                    )
                made += 1
            print(f"{lang}: voice {vi} = {model.stem}")
        keys = sorted({t["key"] for t in items if all((lang_dir / f"{t['key']}.{i}.mp3").exists() for i in range(len(models)))})
        manifest[lang] = {"voices": [m.stem for m in models], "keys": keys}
        print(f"{lang}: {made} new files, {len(keys)} texts ready")

    (out_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


if __name__ == "__main__":
    main()
