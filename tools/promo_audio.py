"""Synthesize a quiet electronic instrumental bed for product demos, offline.

Import ``make_music`` or run ``python tools/promo_audio.py --help``.
The arrangement is deterministic and uses only NumPy and the Python standard library.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path
import wave

import numpy as np


def _frequency(note: float) -> float:
    return 440.0 * 2.0 ** ((note - 69.0) / 12.0)


def _envelope(time: np.ndarray, length: float, attack: float, release: float) -> np.ndarray:
    attack = min(attack, length * 0.3)
    release = min(release, length * 0.45)
    entering = np.sin(np.minimum(time / max(attack, 1e-5), 1.0) * math.pi / 2.0) ** 2
    leaving = np.sin(np.clip((length - time) / max(release, 1e-5), 0.0, 1.0) * math.pi / 2.0) ** 2
    return entering * leaving


def _place(bus: np.ndarray, sound: np.ndarray, start: float, sample_rate: int,
           gain: float, pan: float = 0.0) -> None:
    """Add a mono voice with equal-power panning, clipping only its time bounds."""
    first = round(start * sample_rate)
    source_start = max(0, -first)
    first = max(0, first)
    count = min(len(sound) - source_start, len(bus) - first)
    if count <= 0:
        return
    voice = sound[source_start:source_start + count] * gain
    angle = (float(np.clip(pan, -1.0, 1.0)) + 1.0) * math.pi / 4.0
    bus[first:first + count, 0] += voice * math.cos(angle)
    bus[first:first + count, 1] += voice * math.sin(angle)


def _soft_noise(rng: np.random.Generator, frames: int, sample_rate: int,
                smoothing: float) -> np.ndarray:
    width = max(5, round(sample_rate * smoothing))
    if width % 2 == 0:
        width += 1
    kernel = np.hanning(width)
    kernel /= kernel.sum()
    noise = rng.standard_normal(frames + width - 1)
    result = np.convolve(noise, kernel, mode="valid")
    return result / max(float(np.std(result)), 1e-8)


def make_music(path: str, duration: float, sample_rate: int = 48000) -> str:
    """Write a stereo PCM16 WAV and return its absolute path.

    The default 40-second arrangement has sixteen bars at 96 BPM. Shorter or
    longer durations retain the same instruments and receive their own fades.
    Overall RMS is normalized near 0.107 with an absolute peak ceiling of 0.86.
    """
    duration = float(duration)
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("duration must be a positive finite number of seconds")
    if not isinstance(sample_rate, (int, np.integer)) or not 8000 <= sample_rate <= 192000:
        raise ValueError("sample_rate must be an integer between 8000 and 192000")
    sample_rate = int(sample_rate)
    frames = max(1, round(duration * sample_rate))
    actual_duration = frames / sample_rate
    mix = np.zeros((frames, 2), dtype=np.float64)
    ambience = np.zeros_like(mix)
    rng = np.random.default_rng(20261018)
    beat = 60.0 / 96.0
    bar = beat * 4.0

    # B minor 7, G major 7, D major 7, A add 9. Each voicing lasts two bars.
    harmony = [(59, 62, 66, 69), (55, 59, 62, 66),
               (57, 62, 66, 73), (57, 61, 64, 71)]
    bass_roots = [35, 31, 38, 33]
    segment = bar * 2.0
    for section in range(math.ceil(actual_duration / segment)):
        start = section * segment
        length = segment + 0.65
        time = np.arange(round(length * sample_rate)) / sample_rate
        envelope = _envelope(time, length, attack=0.48, release=1.0)
        for index, note in enumerate(harmony[section % len(harmony)]):
            frequency = _frequency(note)
            phase = rng.uniform(0.0, math.tau)
            # Two soft, slightly detuned voices; no sharp saw or square waves.
            for side, detune in [(-1.0, -0.0022), (1.0, 0.0022)]:
                oscillation = math.tau * frequency * (1.0 + detune) * time + phase
                sound = (np.sin(oscillation) + 0.12 * np.sin(2.0 * oscillation + 0.3))
                sound *= envelope * (0.95 + 0.05 * np.sin(math.tau * 0.19 * time + index))
                _place(ambience, sound, start, sample_rate, 0.021, side * 0.6)

    # Rounded bass pulses leave room for the subtitles and interface activity.
    for measure in range(math.ceil(actual_duration / bar)):
        root = bass_roots[(measure // 2) % len(bass_roots)]
        for position, note, velocity in [(0.0, root, 1.0), (1.5, root, 0.6),
                                         (2.0, root, 0.85), (3.5, root + 7, 0.4)]:
            length = beat * (0.86 if position in (0.0, 2.0) else 0.43)
            time = np.arange(round(length * sample_rate)) / sample_rate
            phase = math.tau * _frequency(note) * time
            sound = np.sin(phase) + 0.17 * np.sin(2.0 * phase) + 0.035 * np.sin(3.0 * phase)
            sound *= _envelope(time, length, attack=0.025, release=0.11) * np.exp(-time / 0.7)
            _place(mix, sound, measure * bar + position * beat, sample_rate, 0.10 * velocity)

    # Soft low kick, muted backbeat and a very quiet eighth-note texture.
    kick_length = 0.32
    kick_time = np.arange(round(kick_length * sample_rate)) / sample_rate
    kick_phase = math.tau * (46.0 * kick_time + 65.0 * 0.028 * (1.0 - np.exp(-kick_time / 0.028)))
    kick = np.sin(kick_phase) * np.exp(-kick_time / 0.085)
    kick *= _envelope(kick_time, kick_length, attack=0.006, release=0.08)
    for pulse in range(math.ceil(actual_duration / beat)):
        position = pulse * beat
        # Let the opening harmony settle before the rhythm enters.
        intensity = 0.58 if position < bar else 1.0
        _place(mix, kick, position, sample_rate, 0.13 * intensity * rng.uniform(0.92, 1.03))
        if pulse % 4 in (1, 3):
            length = 0.15
            time = np.arange(round(length * sample_rate)) / sample_rate
            sound = _soft_noise(rng, len(time), sample_rate, smoothing=0.0006)
            sound = (sound * 0.58 + np.sin(math.tau * 165.0 * time) * 0.24)
            sound *= np.exp(-time / 0.035) * _envelope(time, length, 0.005, 0.045)
            _place(mix, sound, position + 0.006, sample_rate, 0.023 * intensity, -0.12)
        for offset in (0.0, 0.5):
            if position < bar or (pulse % 4 == 0 and offset == 0.0):
                continue
            length = 0.055
            time = np.arange(round(length * sample_rate)) / sample_rate
            texture = _soft_noise(rng, len(time), sample_rate, smoothing=0.00014)
            texture *= np.exp(-time / 0.012) * _envelope(time, length, 0.003, 0.02)
            _place(mix, texture, position + offset * beat, sample_rate,
                   0.0055 * rng.uniform(0.7, 1.0), 0.24 if offset else -0.24)

    # A sparse, low-level melodic motif; its softened attack avoids beeping.
    melody = [
        (2, 0.5, 74), (2, 2.5, 71), (3, 2.0, 78),
        (5, 0.5, 74), (5, 2.0, 71), (6, 2.5, 69),
        (8, 0.5, 73), (8, 3.0, 76), (9, 2.0, 74),
        (11, 0.5, 71), (11, 2.5, 69), (12, 2.0, 66),
        (14, 0.5, 74), (14, 2.0, 71),
    ]
    cycle = bar * 16.0
    for repetition in range(math.ceil(actual_duration / cycle)):
        for index, (measure, position, note) in enumerate(melody):
            start = repetition * cycle + measure * bar + position * beat
            if start >= actual_duration:
                continue
            length = 1.45
            time = np.arange(round(length * sample_rate)) / sample_rate
            phase = math.tau * _frequency(note) * time
            sound = (np.sin(phase) + 0.13 * np.sin(2.0 * phase + 0.2)
                     + 0.035 * np.sin(3.0 * phase + 0.5))
            sound *= np.exp(-time / 0.52) * _envelope(time, length, 0.055, 0.45)
            pan = -0.3 if index % 2 else 0.3
            _place(ambience, sound, start, sample_rate, 0.040, pan)
            _place(ambience, sound, start + beat * 0.75, sample_rate, 0.008, -pan)

    # Low-level crossed early reflections add width without a conspicuous tail.
    mix += ambience
    for delay, gain in [(0.083, 0.045), (0.137, 0.035), (0.229, 0.028), (0.347, 0.022)]:
        shift = round(delay * sample_rate)
        if shift < frames:
            mix[shift:] += ambience[:-shift, ::-1] * gain

    mix -= mix.mean(axis=0, keepdims=True)
    mix = np.tanh(mix * 1.15) / 1.15
    fade_in = min(1.8, actual_duration * 0.18)
    fade_out = min(2.7, actual_duration * 0.18)
    time = np.arange(frames) / sample_rate
    fade = _envelope(time, actual_duration, fade_in, fade_out)
    mix *= fade[:, None]
    rms = float(np.sqrt(np.mean(mix * mix)))
    if rms > 1e-12:
        mix *= 0.107 / rms
    peak = float(np.max(np.abs(mix)))
    if peak > 0.86:
        mix *= 0.86 / peak
    # Make the final frame exactly silent as well as the first.
    mix[0] = 0.0
    mix[-1] = 0.0
    pcm = np.rint(mix * 32767.0).astype("<i2")

    output = Path(path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return str(output)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", nargs="?", default="dev/_promo_preview/audio.wav")
    parser.add_argument("--duration", type=float, default=40.0)
    parser.add_argument("--sample-rate", type=int, default=48000)
    args = parser.parse_args()
    print(make_music(args.output, args.duration, args.sample_rate))


if __name__ == "__main__":
    main()
