"""Prepare localized narration for the 60-second demo using real X footage.

Only an uncached narration line is sent to the speech service. Importing this
module does not connect to that service. Speech uses the same standard voices,
cache identities and measured, local audio mixing as ``voice-demos.py``.
"""

from __future__ import annotations

import argparse
import asyncio
from functools import lru_cache
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = ("zh", "en", "ja", "vi", "ko")
WINDOWS = ((0, 3), (3, 11), (11, 19), (19, 29), (29, 37), (37, 45), (45, 55), (55, 60))
DEFAULT_WORK_DIR = ROOT / "dev/_promo_real"
DEFAULT_MUSIC = ROOT / "dev/_promo_demo_i18n/music.wav"


@lru_cache(maxsize=1)
def _voice_driver():
    """Load the existing hyphenated CLI without changing its module globals."""
    source = Path(__file__).with_name("voice-demos.py")
    spec = importlib.util.spec_from_file_location("real_demo_shared_voice_driver", source)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load narration driver: {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _segments(language: str) -> list[dict]:
    from real_demo_copy import COPY

    if language not in LANGUAGES:
        raise ValueError(f"Unsupported demo language: {language}")
    narration = COPY[language]["narration"]
    if len(narration) != len(WINDOWS):
        raise ValueError(f"{language} narration needs exactly {len(WINDOWS)} scenes")
    segments = []
    for index, (item, (start, end)) in enumerate(zip(narration, WINDOWS)):
        text = item.get("text") if isinstance(item, dict) else item
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"{language} narration scene {index} has no text")
        segments.append({"start": start, "end": end, "text": text})
    return segments


def _write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


async def _prepare_clips(language: str, work_dir: Path, semaphore: asyncio.Semaphore) -> list[dict]:
    segments = _segments(language)
    return await _voice_driver().synthesize(language, work_dir, semaphore, segments=segments)


def _finish(language: str, work_dir: Path, music_path: Path, clips: list[dict]) -> dict:
    from demo_voice_audio import mix_narration

    music_path = music_path.expanduser().resolve()
    if not music_path.is_file():
        raise FileNotFoundError(f"Background music is missing: {music_path}")
    directory = work_dir / language
    directory.mkdir(parents=True, exist_ok=True)
    mixed = directory / "narration-mix.wav"
    report_path = directory / "mix-report.json"
    report = mix_narration(clips, music_path, mixed, total=60, report_path=report_path)
    voice_driver = _voice_driver()

    subtitles = []
    for index, (clip, details) in enumerate(zip(clips, report["segments"]), 1):
        subtitles.append(
            f'{index}\n{voice_driver.stamp(details["placed_start"])} --> '
            f'{voice_driver.stamp(details["placed_end"])}\n{clip["text"]}\n'
        )
    subtitle_path = directory / "narration.srt"
    subtitle_path.write_text("\n".join(subtitles), encoding="utf-8-sig")
    metadata = {
        "language": language,
        "voice": voice_driver.VOICES[language],
        "synthetic": True,
        "duration_seconds": 60,
        "segments": [
            {key: value for key, value in segment.items() if key != "path"}
            for segment in report["segments"]
        ],
        "mix": {key: value for key, value in report.items() if key not in ("segments", "output")},
    }
    metadata_path = directory / "narration.json"
    _write_json(metadata_path, metadata)
    return {
        "language": language,
        "voice": metadata["voice"],
        "audio": mixed,
        "subtitles": subtitle_path,
        "metadata": metadata_path,
        "clips": directory / "narration-clips.json",
        "report_path": report_path,
        "report": report,
    }


async def prepare_voice(language: str, work_dir: str | Path = DEFAULT_WORK_DIR,
                        music_path: str | Path = DEFAULT_MUSIC) -> dict:
    """Synthesize/cache eight scenes, then return paths and metrics for rendering.

    ``audio``, ``subtitles`` and ``metadata`` are local ``Path`` objects pointing
    to a complete 60-second stereo mix, a timed SRT, and portable narration JSON.
    The mixer measures every spoken line and refuses to truncate one to fit.
    """
    directory = Path(work_dir).expanduser().resolve()
    music = Path(music_path).expanduser().resolve()
    if not music.is_file():
        raise FileNotFoundError(f"Background music is missing: {music}")
    clips = await _prepare_clips(language, directory, asyncio.Semaphore(2))
    return _finish(language, directory, music, clips)


async def run(args: argparse.Namespace) -> None:
    languages = LANGUAGES if args.all_languages else (args.language,)
    work_dir = args.work_dir.expanduser().resolve()
    music_path = args.music.expanduser().resolve()
    if not args.synthesize_only and not music_path.is_file():
        raise FileNotFoundError(f"Background music is missing: {music_path}")
    semaphore = asyncio.Semaphore(2)
    clips = await asyncio.gather(*(_prepare_clips(language, work_dir, semaphore) for language in languages))
    if args.synthesize_only:
        print(json.dumps({"languages": languages, "work_dir": str(work_dir), "synthesized_only": True}))
        return
    for language, language_clips in zip(languages, clips):
        result = _finish(language, work_dir, music_path, language_clips)
        print(json.dumps({"language": language, "audio": str(result["audio"]),
                          "subtitles": str(result["subtitles"]), "metadata": str(result["metadata"])},
                         ensure_ascii=False), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    languages = parser.add_mutually_exclusive_group()
    languages.add_argument("--language", choices=LANGUAGES, default="zh")
    languages.add_argument("--all-languages", action="store_true")
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK_DIR)
    parser.add_argument("--music", type=Path, default=DEFAULT_MUSIC)
    parser.add_argument("--synthesize-only", action="store_true", help="Cache speech without mixing audio")
    asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    main()
