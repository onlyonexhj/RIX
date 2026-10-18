# 五语演示视频 / Multilingual demos

每个版本均为 60 秒、1920 × 1080、30 fps，配有对应语言的旁白和字幕；旁白播放时背景音乐会自动降低音量。五个版本分别使用对应语言的标准合成音色，非真人录音。画面使用真实插件 UI，推文及 AI 回复为虚构演示数据。

Each version is 60 seconds at 1920 × 1080 and 30 fps, with narration and subtitles in the selected language. Background music is automatically lowered during narration. Each language uses a standard synthetic voice, not a human recording. The videos show the actual extension UI with fictional posts and AI replies for demonstration.

配音版文件名含 `voiced`，原字幕版视频保留。

Narrated versions include `voiced` in the filename; the original subtitle-only videos are preserved.

| 语言 / Language | 视频 / Video | 封面 / Cover | 屏幕字幕 / On-screen subtitles | 旁白字幕 / Narration subtitles |
|---|---|---|---|---|
| 中文 | [MP4](zh/x-ai-reply-demo-voiced-1080p.mp4) | [PNG](zh/cover.png) | [SRT](zh/captions.srt) | [SRT](zh/narration.srt) |
| English | [MP4](en/x-ai-reply-demo-voiced-1080p.mp4) | [PNG](en/cover.png) | [SRT](en/captions.srt) | [SRT](en/narration.srt) |
| 日本語 | [MP4](ja/x-ai-reply-demo-voiced-1080p.mp4) | [PNG](ja/cover.png) | [SRT](ja/captions.srt) | [SRT](ja/narration.srt) |
| Tiếng Việt | [MP4](vi/x-ai-reply-demo-voiced-1080p.mp4) | [PNG](vi/cover.png) | [SRT](vi/captions.srt) | [SRT](vi/narration.srt) |
| 한국어 | [MP4](ko/x-ai-reply-demo-voiced-1080p.mp4) | [PNG](ko/cover.png) | [SRT](ko/captions.srt) | [SRT](ko/narration.srt) |

`captions.srt` 保留原屏幕字幕；`narration.srt` 按章节记录实际旁白。各语言目录中的 `narration.json` 记录所用音色、旁白片段及时间。

`captions.srt` preserves the original on-screen subtitles; `narration.srt` contains the actual narration by chapter. Each language directory also includes `narration.json` with the voice, narration segments, and timing.

## 重新生成 / Rebuild

在项目根目录运行。先生成画面，再生成旁白并合成视频。配音脚本依赖 `edge-tts==7.3.1`；配音阶段需要联网，仅将演示旁白文本发送到语音服务。插件本身的使用不依赖此工具。

Run these commands from the repository root. Build the visuals first, then generate narration and mix it into the videos. The narration script requires `edge-tts==7.3.1` and an internet connection; only the demo narration text is sent to the speech service. Using the extension itself does not require this tool.

```bash
python -m pip install edge-tts==7.3.1

# 全部五种语言 / All five languages
python tools/build-demo.py --all-languages
python tools/voice-demos.py --all-languages

# 仅英文 / English only
python tools/build-demo.py --language en
python tools/voice-demos.py --language en
```
