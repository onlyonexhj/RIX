# 真实 X 录屏演示 / Real X screen-recording demos

## ▶ 在线播放 / Watch on YouTube

[![点击观看中文版 / Watch the Chinese demo](zh/cover.png)](https://youtu.be/dpnf_gy5-6I)

**[中文](https://youtu.be/dpnf_gy5-6I) | [English](https://youtu.be/Rwp-c2AgEto) | [日本語](https://youtu.be/YlWo3uloYP8) | [Tiếng Việt](https://youtu.be/kYoX6VaA7LA) | [한국어](https://youtu.be/Q62Dzl1gD8s)**

点击封面或语言链接即可在 YouTube 观看对应配音和字幕版。/ Click the preview or a language link to watch the matching narration and subtitle version on YouTube.

使用用户提供的 76.77 秒真实 X 浏览器录屏剪辑，成片为 60 秒、1920 × 1080、30 fps。五个版本共享同一段中文界面的录屏，保留真实页面、实际回复内容和操作过程；新增标题、字幕和合成旁白分别使用中文、英文、日文、越南语和韩文。

Edited from the user's 76.77-second recording of the real X website. Each video is 60 seconds at 1920 × 1080 and 30 fps. All five versions use the same recording with a Chinese interface, preserving the actual page, replies, and actions. Added titles, subtitles, and synthetic narration are localized into Chinese, English, Japanese, Vietnamese, and Korean.

视频展示打开回复、自动生成、首条候选自动填入、人工检查和手动点击 X 的“回复”按钮发布，并保留发送成功提示。剪辑去除浏览与导航片段、缩短生成等待，部分画面停帧用于说明操作；字幕和旁白说明等待过程已缩短。配音为合成语音。

The recording shows opening a reply, automatic generation and insertion of the first suggestion, human review, and a manual click on X's Reply button to publish, followed by the success message. Browsing and navigation are removed, generation waits are shortened, and brief freeze frames explain the controls. Subtitles and narration identify the shortened wait. Narration uses synthetic voices.

| 语言 / Language | 在线播放 / Watch | 视频文件 / Video file | 封面 / Cover | 屏幕字幕 / On-screen subtitles | 旁白字幕 / Narration subtitles |
|---|---|---|---|---|---|
| 中文 | [▶ YouTube](https://youtu.be/dpnf_gy5-6I) | [MP4](zh/x-ai-reply-real-demo-voiced-1080p.mp4) | [PNG](zh/cover.png) | [SRT](zh/captions.srt) | [SRT](zh/narration.srt) |
| English | [▶ YouTube](https://youtu.be/Rwp-c2AgEto) | [MP4](en/x-ai-reply-real-demo-voiced-1080p.mp4) | [PNG](en/cover.png) | [SRT](en/captions.srt) | [SRT](en/narration.srt) |
| 日本語 | [▶ YouTube](https://youtu.be/YlWo3uloYP8) | [MP4](ja/x-ai-reply-real-demo-voiced-1080p.mp4) | [PNG](ja/cover.png) | [SRT](ja/captions.srt) | [SRT](ja/narration.srt) |
| Tiếng Việt | [▶ YouTube](https://youtu.be/kYoX6VaA7LA) | [MP4](vi/x-ai-reply-real-demo-voiced-1080p.mp4) | [PNG](vi/cover.png) | [SRT](vi/captions.srt) | [SRT](vi/narration.srt) |
| 한국어 | [▶ YouTube](https://youtu.be/Q62Dzl1gD8s) | [MP4](ko/x-ai-reply-real-demo-voiced-1080p.mp4) | [PNG](ko/cover.png) | [SRT](ko/captions.srt) | [SRT](ko/narration.srt) |

`captions.srt` 记录新增屏幕字幕，`narration.srt` 记录旁白文本与时间。各语言目录的 `narration.json` 记录音色和配音片段，`edit.json` 记录源文件名、文件哈希、裁切范围和剪辑表。原始录屏不复制到仓库。

`captions.srt` contains the added on-screen subtitles; `narration.srt` contains the narration and timing. Each language directory includes `narration.json` with voice and narration segments, and `edit.json` with the source filename, file hash, crop, and edit list. The original recording is not copied into the repository.

## 重新生成 / Rebuild

从项目根目录运行，使用本地原始录屏路径。工具依赖 Python、Pillow、NumPy、imageio-ffmpeg 和 `edge-tts==7.3.1`。配音生成需要联网，仅将旁白文本发送至语音服务；原始视频在本地剪辑。

Run from the repository root with the path to the original local recording. The tool requires Python, Pillow, NumPy, imageio-ffmpeg, and `edge-tts==7.3.1`. Narration generation requires an internet connection and sends only narration text to the speech service; video editing stays local.

```bash
python -m pip install Pillow numpy imageio-ffmpeg edge-tts==7.3.1
python tools/build-real-demo.py --source "录屏路径.mp4" --all-languages
```
