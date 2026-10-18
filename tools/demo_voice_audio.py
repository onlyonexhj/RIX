"""Align local narration clips and mix them over the product demo music.

No speech is generated here. ``mix_narration`` accepts existing audio files,
preserves the complete speech in each scene, and refuses scripts that cannot fit
with a modest, pitch-preserving tempo adjustment. All audio work stays local.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import subprocess
import wave

import imageio_ffmpeg
import numpy as np


SAMPLE_RATE = 48000
MAX_TEMPO = 1.18
START_MARGIN = 0.12
END_MARGIN = 0.15
VOICE_RMS_DB = -18.0
VOICE_PEAK_DB = -2.0
MIX_PEAK_DB = -1.0
MUSIC_IDLE_RMS_DB = -30.0
MUSIC_VOICE_GAP_DB = 18.0


def _db(value: float) -> float:
    return round(20.0 * math.log10(max(float(value), 1e-12)), 4)


def _rms(audio: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(audio, dtype=np.float64)))) if audio.size else 0.0


def _peak(audio: np.ndarray) -> float:
    return float(np.max(np.abs(audio))) if audio.size else 0.0


def _metrics(audio: np.ndarray) -> dict:
    peak, rms = _peak(audio), _rms(audio)
    return {"peak": peak, "rms": rms, "peak_dbfs": _db(peak), "rms_dbfs": _db(rms)}


def _ffmpeg(arguments: list[str], input_bytes: bytes | None = None) -> bytes:
    command = [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", *arguments]
    result = subprocess.run(
        command, input=input_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), check=False,
    )
    if result.returncode:
        raise RuntimeError("Audio conversion failed: " + result.stderr.decode("utf-8", errors="replace")[-3000:])
    return result.stdout


def _decode(path: str | Path, channels: int = 1) -> np.ndarray:
    source = Path(path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    raw = _ffmpeg(["-i", str(source), "-vn", "-ac", str(channels), "-ar", str(SAMPLE_RATE),
                   "-f", "f32le", "pipe:1"])
    audio = np.frombuffer(raw, dtype="<f4").copy()
    if not audio.size or not np.isfinite(audio).all():
        raise ValueError(f"Empty or invalid audio: {source}")
    return audio if channels == 1 else audio.reshape(-1, channels)


def _trim_edges(audio: np.ndarray) -> tuple[np.ndarray, int, int]:
    """Remove only exterior silence, retaining 70 ms around detected speech.

    A low 10 ms energy threshold keeps quiet consonants and breaths. Interior
    pauses are never removed. Margins also keep the tiny anti-click fades away
    from the first and last spoken sounds.
    """
    width = round(SAMPLE_RATE * 0.01)
    blocks = math.ceil(len(audio) / width)
    padded = np.pad(audio, (0, blocks * width - len(audio)))
    energy = np.sqrt(np.mean(np.square(padded.reshape(blocks, width), dtype=np.float64), axis=1))
    threshold = max(10.0 ** (-52.0 / 20.0), float(energy.max()) * 0.004)
    active = np.flatnonzero(energy >= threshold)
    if not active.size:
        raise ValueError("Narration clip contains no detectable speech")
    margin = round(SAMPLE_RATE * 0.07)
    first = max(0, int(active[0]) * width - margin)
    last = min(len(audio), (int(active[-1]) + 1) * width + margin)
    return audio[first:last].copy(), first, len(audio) - last


def _atempo(audio: np.ndarray, tempo: float) -> np.ndarray:
    raw = _ffmpeg([
        "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0",
        "-af", f"atempo={tempo:.9f}", "-f", "f32le", "-ar", str(SAMPLE_RATE),
        "-ac", "1", "pipe:1",
    ], audio.astype("<f4", copy=False).tobytes())
    result = np.frombuffer(raw, dtype="<f4").copy()
    if not result.size or not np.isfinite(result).all():
        raise ValueError("Tempo conversion returned empty or invalid audio")
    return result


def _limit_voice_peaks(audio: np.ndarray) -> np.ndarray:
    """Catch brief TTS transients without lowering the entire narration bus.

    FFmpeg's look-ahead limiter retains the pitch and has latency compensation
    enabled. The length check prevents an unnoticed shift of scene boundaries.
    """
    ceiling = 10.0 ** (VOICE_PEAK_DB / 20.0)
    if _peak(audio) <= ceiling:
        return audio
    raw = _ffmpeg([
        "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0",
        "-af", f"alimiter=limit={ceiling:.9f}:attack=5:release=80:level=0:latency=1",
        "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "pipe:1",
    ], audio.astype("<f4", copy=False).tobytes())
    limited = np.frombuffer(raw, dtype="<f4").copy()
    if len(limited) != len(audio) or not np.isfinite(limited).all():
        raise ValueError("Peak limiter changed the narration length or returned invalid audio")
    return limited


def _edge_fade(audio: np.ndarray, duration: float = 0.008) -> None:
    count = min(round(duration * SAMPLE_RATE), len(audio) // 2)
    if count:
        curve = np.sin(np.linspace(0.0, math.pi / 2.0, count, dtype=np.float32)) ** 2
        audio[:count] *= curve
        audio[-count:] *= curve[::-1]


def _block_rms(audio: np.ndarray, block: int) -> np.ndarray:
    if audio.ndim == 2:
        energy = np.mean(np.square(audio, dtype=np.float64), axis=1)
    else:
        energy = np.square(audio, dtype=np.float64)
    count = math.ceil(len(energy) / block)
    energy = np.pad(energy, (0, count * block - len(energy)))
    return np.sqrt(np.mean(energy.reshape(count, block), axis=1))


def _duck_music(voice: np.ndarray, music: np.ndarray) -> tuple[np.ndarray, dict]:
    """Use a look-ahead energy envelope to keep music behind each spoken phrase."""
    block = round(SAMPLE_RATE * 0.02)
    voice_energy = _block_rms(voice, block)
    music_energy = _block_rms(music, block)
    idle_gain = min(1.0, 10.0 ** (MUSIC_IDLE_RMS_DB / 20.0) / max(_rms(music), 1e-12))
    desired = np.full(len(voice_energy), idle_gain, dtype=np.float64)
    speech = voice_energy > 10.0 ** (-55.0 / 20.0)
    desired[speech] = np.minimum(
        idle_gain,
        voice_energy[speech] * 10.0 ** (-MUSIC_VOICE_GAP_DB / 20.0)
        / np.maximum(music_energy[speech], 1e-12),
    )
    # Look 100 ms ahead and hold the duck for 240 ms after speech. Interpolation
    # between these conservative gains avoids audible jumps and preserves the
    # energy bound even across adjacent quiet syllables.
    before, after = 5, 12
    padded = np.pad(desired, (after, before), constant_values=idle_gain)
    windows = np.lib.stride_tricks.sliding_window_view(padded, after + before + 1)
    gains = windows.min(axis=1)
    centers = np.arange(len(gains)) * block + block / 2.0
    envelope = np.interp(np.arange(len(voice)), centers, gains).astype(np.float32)
    music *= envelope[:, None]
    # The music has its own small global fades, independent of the narration.
    fade = min(round(0.3 * SAMPLE_RATE), len(music) // 2)
    if fade:
        curve = np.sin(np.linspace(0.0, math.pi / 2.0, fade, dtype=np.float32)) ** 2
        music[:fade] *= curve[:, None]
        music[-fade:] *= curve[::-1, None]
    after_energy = _block_rms(music, block)
    gaps = 20.0 * np.log10(np.maximum(voice_energy[speech], 1e-12)
                              / np.maximum(after_energy[speech], 1e-12))
    return music, {
        "idle_gain": float(idle_gain),
        "minimum_gain": float(envelope.min()),
        "maximum_gain": float(envelope.max()),
        "speech_music_minimum_gap_db": float(gaps.min()) if gaps.size else None,
        "speech_energy_block_seconds": block / SAMPLE_RATE,
        "lookahead_seconds": before * block / SAMPLE_RATE,
        "release_seconds": after * block / SAMPLE_RATE,
    }


def mix_narration(clips: list[dict], music_path: str | Path, output_wav: str | Path,
                  total: float = 60, report_path: str | Path | None = None) -> dict:
    """Place complete local speech clips into scenes and write a stereo PCM16 WAV.

    Each clip needs ``path``, ``start`` and ``end`` (seconds); ``text`` is copied
    into the report. Reports use zero-based ``index`` and include exact placed
    speech bounds suitable for a narration SRT. ``ValueError`` identifies any
    clip needing a shorter script; no speech is truncated to force a fit.
    """
    total = float(total)
    if not math.isfinite(total) or total <= 0 or not clips:
        raise ValueError("total must be positive and at least one narration clip is required")
    frame_count = round(total * SAMPLE_RATE)
    voice = np.zeros(frame_count, dtype=np.float32)
    placed_clips = []
    segments = []
    previous_end = 0.0
    for index, clip in enumerate(clips):
        start, end = float(clip["start"]), float(clip["end"])
        if not all(math.isfinite(value) for value in (start, end)) or not (0 <= start < end <= total):
            raise ValueError(f"Narration segment index={index}: invalid scene bounds {start}..{end}")
        if start < previous_end:
            raise ValueError(f"Narration segment index={index}: scene overlaps the previous scene")
        previous_end = end
        source = _decode(clip["path"])
        source_duration = len(source) / SAMPLE_RATE
        trimmed, leading, trailing = _trim_edges(source)
        trimmed_duration = len(trimmed) / SAMPLE_RATE
        first = round((start + START_MARGIN) * SAMPLE_RATE)
        last = math.floor((end - END_MARGIN) * SAMPLE_RATE)
        available_frames = last - first
        available = available_frames / SAMPLE_RATE
        if available_frames <= 0:
            raise ValueError(f"Narration segment index={index}: duration={trimmed_duration:.3f}s "
                             f"available={available:.3f}s leaves no room for narration")
        tempo = 1.0
        audio = trimmed
        if len(audio) > available_frames:
            minimum_tempo = len(audio) / available_frames
            if minimum_tempo > MAX_TEMPO:
                raise ValueError(f"Narration segment index={index}: duration={trimmed_duration:.3f}s "
                                 f"available={available:.3f}s requires tempo={minimum_tempo:.4f}, "
                                 f"above maximum={MAX_TEMPO:.2f}; shorten this script")
            tempo = min(MAX_TEMPO, minimum_tempo * 1.003)
            audio = _atempo(trimmed, tempo)
            # atempo works in windows; compensate for a small rounding overrun
            # by retrying from the complete source, never by cutting the tail.
            for _ in range(3):
                if len(audio) <= available_frames:
                    break
                tempo = min(MAX_TEMPO, tempo * len(audio) / available_frames * 1.002)
                audio = _atempo(trimmed, tempo)
            if len(audio) > available_frames:
                raise ValueError(f"Narration segment index={index}: duration={trimmed_duration:.3f}s "
                                 f"available={available:.3f}s still does not fit at tempo={tempo:.4f}; "
                                 "shorten this script")
        _edge_fade(audio)
        placed_end = first + len(audio)
        voice[first:placed_end] += audio
        placed_clips.append((first, placed_end))
        segments.append({
            "index": index, "path": str(Path(clip["path"]).resolve()), "text": clip.get("text", ""),
            "start": start, "end": end, "placed_start": first / SAMPLE_RATE,
            "placed_end": placed_end / SAMPLE_RATE, "tempo": float(tempo),
            "source_duration": source_duration, "trimmed_duration": trimmed_duration,
            "placed_duration": len(audio) / SAMPLE_RATE, "available_duration": available,
            "trimmed_leading_seconds": leading / SAMPLE_RATE,
            "trimmed_trailing_seconds": trailing / SAMPLE_RATE,
        })

    active_samples = sum(end - start for start, end in placed_clips)
    active_energy = sum(float(np.sum(np.square(voice[start:end], dtype=np.float64)))
                        for start, end in placed_clips)
    active_rms = math.sqrt(active_energy / max(active_samples, 1))
    target_gain = 10.0 ** (VOICE_RMS_DB / 20.0) / max(active_rms, 1e-12)
    voice_gain = target_gain
    voice *= voice_gain
    pre_limit_peak = _peak(voice)
    voice = _limit_voice_peaks(voice)

    music = _decode(music_path, channels=2)
    if len(music) < frame_count:
        raise ValueError(f"Music is {len(music) / SAMPLE_RATE:.3f}s; expected at least {total:.3f}s")
    music = music[:frame_count].copy()
    music, duck_report = _duck_music(voice, music)
    mix = music + voice[:, None]
    final_gain = min(1.0, 10.0 ** (MIX_PEAK_DB / 20.0) / max(_peak(mix), 1e-12))
    mix *= final_gain
    voice *= final_gain
    music *= final_gain
    pcm = np.rint(mix * 32767.0).astype("<i2")
    output = Path(output_wav).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output), "wb") as writer:
        writer.setnchannels(2)
        writer.setsampwidth(2)
        writer.setframerate(SAMPLE_RATE)
        writer.writeframes(pcm.tobytes())

    for segment, (first, last) in zip(segments, placed_clips):
        segment.update(_metrics(voice[first:last]))
        segment["music_rms_dbfs"] = _db(_rms(music[first:last]))
    active_energy = sum(float(np.sum(np.square(voice[start:end], dtype=np.float64)))
                        for start, end in placed_clips)
    final_active_rms = math.sqrt(active_energy / max(active_samples, 1))
    final_metrics = _metrics(pcm.astype(np.float32) / 32768.0)
    report = {
        "output": str(output), "duration": frame_count / SAMPLE_RATE,
        "sample_rate": SAMPLE_RATE, "channels": 2, "sample_width_bytes": 2,
        "segments": segments, "narration_coverage_seconds": active_samples / SAMPLE_RATE,
        "narration_coverage_fraction": active_samples / frame_count,
        "narration_intervals": [[item["placed_start"], item["placed_end"]] for item in segments],
        "narration": {**_metrics(voice), "active_rms_dbfs": _db(final_active_rms),
                      "gain": float(voice_gain * final_gain),
                      "peak_limiter_applied": bool(pre_limit_peak > 10.0 ** (VOICE_PEAK_DB / 20.0)),
                      "pre_limit_peak_dbfs": _db(pre_limit_peak)},
        "music": {**_metrics(music), **duck_report},
        "final_gain": float(final_gain), **final_metrics,
        "clipped_samples": int(np.count_nonzero(np.abs(pcm.astype(np.int32)) >= 32767)),
    }
    if report_path is not None:
        destination = Path(report_path).expanduser().resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clips", required=True, help="JSON array of local clips with scene start/end times")
    parser.add_argument("--music", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report")
    parser.add_argument("--total", type=float, default=60.0)
    args = parser.parse_args()
    clips = json.loads(Path(args.clips).read_text(encoding="utf-8"))
    report = mix_narration(clips, args.music, args.output, args.total, args.report)
    print(json.dumps({key: report[key] for key in ("output", "duration", "peak_dbfs", "rms_dbfs", "clipped_samples")},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
