"""Pre-generate speech files with Google Cloud Text-to-Speech (Chirp 3 HD voices).

Usage: GOOGLE_TTS_API_KEY=... python scripts/gen_audio_google.py audio-texts.json public/audio

Same output layout as gen_audio.py (Piper), so the app doesn't care which engine made
the files: public/audio/<lang>/<key>.<voice index>.mp3 plus public/audio/manifest.json.
Already generated files are kept (the deploy caches them), so only new lines cost money.
At this app's size a full run is ~65k characters: inside Google's monthly free tier.
"""

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

API = "https://texttospeech.googleapis.com/v1"
LANG_CODES = {"sv": "sv-SE", "pa": "pa-IN"}
VOICES_PER_LANG = 4  # two female, two male where possible: different speakers train the ear
# Preferred Chirp 3 HD voices if available (clear, natural); otherwise picked automatically.
PREFERRED = ["Aoede", "Kore", "Charon", "Puck", "Leda", "Fenrir", "Zephyr", "Orus"]


def call(url: str, body: dict | None = None) -> dict:
    key = os.environ["GOOGLE_TTS_API_KEY"]
    sep = "&" if "?" in url else "?"
    req = urllib.request.Request(
        f"{url}{sep}key={key}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
    )
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < 5:
                time.sleep(2**attempt)
                continue
            # never print the URL: it contains the key
            raise RuntimeError(f"Google TTS HTTP {e.code}: {e.read()[:300]!r}") from None
    raise RuntimeError("unreachable")


def pick_voices(lang_code: str) -> list[str]:
    voices = call(f"{API}/voices?languageCode={lang_code}").get("voices", [])
    voices = [v for v in voices if lang_code in v.get("languageCodes", [])]
    for kind in ("Chirp3-HD", "Chirp-HD", "Neural2", "Wavenet", "Standard"):
        tier = [v for v in voices if f"-{kind}-" in v["name"]]
        if not tier:
            continue
        tier.sort(key=lambda v: (PREFERRED.index(v["name"].split("-")[-1]) if v["name"].split("-")[-1] in PREFERRED else 99, v["name"]))
        female = [v["name"] for v in tier if v.get("ssmlGender") == "FEMALE"]
        male = [v["name"] for v in tier if v.get("ssmlGender") == "MALE"]
        chosen: list[str] = []
        while len(chosen) < VOICES_PER_LANG and (female or male):
            if female:
                chosen.append(female.pop(0))
            if male and len(chosen) < VOICES_PER_LANG:
                chosen.append(male.pop(0))
        print(f"{lang_code}: {kind} voices {chosen}")
        return chosen
    return []


def synth(lang_code: str, voice: str, text: str, out: Path) -> int:
    res = call(
        f"{API}/text:synthesize",
        {"input": {"text": text}, "voice": {"languageCode": lang_code, "name": voice}, "audioConfig": {"audioEncoding": "MP3"}},
    )
    out.write_bytes(base64.b64decode(res["audioContent"]))
    return len(text)


def main() -> None:
    texts = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    by_lang: dict[str, list[dict]] = {}
    for t in texts:
        by_lang.setdefault(t["lang"], []).append(t)

    for lang, items in by_lang.items():
        code = LANG_CODES.get(lang)
        if not code:
            continue
        try:
            voices = pick_voices(code)
        except RuntimeError as e:
            print(f"{lang}: could not list voices ({e}); skipped")
            continue
        if not voices:
            print(f"{lang}: no Google voice; skipped")
            continue
        lang_dir = out_dir / lang
        lang_dir.mkdir(exist_ok=True)
        # different voices than last time (e.g. switching from Piper)? start this language afresh
        marker = lang_dir / "voices.json"
        if not marker.exists() or json.loads(marker.read_text()) != voices:
            for f in lang_dir.glob("*.mp3"):
                f.unlink()
            marker.write_text(json.dumps(voices))

        jobs = [(v, t) for i, v in enumerate(voices) for t in items if not (lang_dir / f"{t['key']}.{i}.mp3").exists()]
        index = {v: i for i, v in enumerate(voices)}
        chars = 0
        with ThreadPoolExecutor(max_workers=6) as pool:
            for n in pool.map(lambda j: synth(code, j[0], j[1]["text"], lang_dir / f"{j[1]['key']}.{index[j[0]]}.mp3"), jobs):
                chars += n
        keys = sorted({t["key"] for t in items if all((lang_dir / f"{t['key']}.{i}.mp3").exists() for i in range(len(voices)))})
        manifest[lang] = {"voices": voices, "keys": keys}
        print(f"{lang}: {len(jobs)} new files ({chars} characters billed), {len(keys)} texts ready")

    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")


if __name__ == "__main__":
    main()
