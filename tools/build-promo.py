"""Build a 40-second landscape product film from the current extension UI.

All web requests and AI replies in the demonstration are local fixtures.
Existing promotional exports are preserved; new files go into a dated folder.
"""
import argparse
import asyncio
from functools import lru_cache
import json
import math
import os
from pathlib import Path
import subprocess

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from promo_audio import make_music
from promo_scenes import render_assets


ROOT = Path(__file__).resolve().parent.parent
W, H, FPS = 1920, 1080, 30
TOTAL = 40.0
FONT = 'C:/Windows/Fonts/msyh.ttc'
BOLD = 'C:/Windows/Fonts/msyhbd.ttc'
INK = '#edf4ff'
MUTED = '#9baac0'
BLUE = '#65b5ff'
MINT = '#87e7cb'
DURATIONS = [4, 7, 6, 6, 6, 7, 4]
CAPTIONS = [
    '想好好回复，不必每次从空白开始。',
    '点开回复，AI 自动生成多条候选。',
    '选中喜欢的一条，一键填入，再由你决定发布。',
    '多种回复风格，找到适合这条推文的表达。',
    '自定义人设与提示词，让表达更贴近你。',
    '多家模型自由选，API Key 保存在浏览器本地。',
    'X AI 回复助手，把想说的话写出来。',
]
COPY = {
    1: ('01  /  从一条推文开始', '点开回复，\n灵感就到。',
        ['读取原推文上下文', '流式逐条呈现候选', '保留你的选择空间']),
    2: ('02  /  选择你的表达', '挑一句，\n填进去。',
        ['一次生成多条候选', '点击即可回填', '是否发布，由你决定']),
    3: ('03  /  不止一种口吻', '同一条推文，\n不同的表达。',
        ['自动判断 · 幽默 · 专业', '共情 · 犀利 · 更多风格', '条数与语言也能调整']),
    4: ('04  /  让 AI 了解你', '有你的风格，\n才像你的回复。',
        ['自定义人设与背景', 'System / User 模板', '变量插入与实时预览']),
    5: ('05  /  模型自由选择', '用你熟悉的\n模型服务。',
        ['GLM · DeepSeek · OpenAI', 'Claude · Kimi · OpenRouter', '支持 OpenAI 兼容接口']),
}


def ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


@lru_cache(maxsize=32)
def ft(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)


def wrapped(text, font, max_width):
    draw = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    lines, line = [], ''
    for char in text:
        if char == '\n':
            lines.append(line)
            line = ''
        elif draw.textlength(line + char, font=font) > max_width:
            lines.append(line)
            line = char
        else:
            line += char
    if line:
        lines.append(line)
    return lines


def text(im, xy, value, size, color=INK, bold=False, width=None, spacing=12):
    draw, font = ImageDraw.Draw(im), ft(size, bold)
    lines = wrapped(value, font, width) if width else value.split('\n')
    for index, line in enumerate(lines):
        draw.text((xy[0], xy[1] + index * (size + spacing)), line, font=font, fill=color)


def center(im, y, value, size, color=INK, bold=False):
    font = ft(size, bold)
    width = ImageDraw.Draw(im).textlength(value, font=font)
    text(im, ((W - width) / 2, y), value, size, color, bold)


def paste_alpha(im, layer, xy=(0, 0), alpha=1):
    if alpha < 1:
        layer = layer.copy()
        layer.putalpha(layer.getchannel('A').point(lambda a: int(a * alpha)))
    im.paste(layer, (int(xy[0]), int(xy[1])), layer)


def rounded_mask(size, radius):
    mask = Image.new('L', size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius, fill=255)
    return mask


def background():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    glow = np.exp(-(((xx - 1530) / 600) ** 2 + ((yy - 200) / 600) ** 2))
    purple = np.exp(-(((xx - 1050) / 800) ** 2 + ((yy - 1100) / 750) ** 2))
    rgb = np.stack((6 + glow * 9 + purple * 13,
                    12 + glow * 21 + purple * 8,
                    22 + glow * 41 + purple * 23), axis=-1)
    im = Image.fromarray(rgb.astype('uint8'))
    draw = ImageDraw.Draw(im)
    for x in range(84, W, 84):
        for y in range(132, H - 84, 84):
            draw.ellipse((x, y, x + 2, y + 2), fill=(25, 37, 53))
    return im


class Film:
    def __init__(self, metadata):
        self.metadata = metadata
        raw = metadata.get('assets', metadata)
        self.assets = {}
        for name, item in raw.items():
            if isinstance(item, str):
                item = {'path': item}
            if not isinstance(item, dict) or 'path' not in item:
                continue
            self.assets[name.removesuffix('.png')] = {
                **item, 'image': Image.open(item['path']).convert('RGB')}
        self.bg = background()
        logo = Image.open(ROOT / 'icons/icon128.png').convert('RGBA')
        self.logo = logo
        self.bases = [self.build_base(i) for i in range(7)]
        self.cursor = self.make_cursor()

    def branded(self):
        im = self.bg.copy()
        logo = self.logo.resize((54, 54), Image.Resampling.LANCZOS)
        paste_alpha(im, logo, (88, 50))
        text(im, (162, 55), 'X AI 回复助手', 28, bold=True)
        draw = ImageDraw.Draw(im)
        draw.rounded_rectangle((1530, 57, 1828, 99), 21, fill='#111d2d', outline='#2a3d56')
        text(im, (1557, 64), 'CHROME EXTENSION', 18, '#bdcce0')
        draw.line((88, 126, 1832, 126), fill='#233047', width=1)
        return im

    def build_base(self, index):
        im = self.branded()
        if index == 0:
            text(im, (112, 244), '让每一次回复，更像你', 27, BLUE)
            text(im, (108, 308), '好回复，\n不必从零开始。', 88, bold=True, spacing=25)
            text(im, (116, 576), 'X AI 回复助手', 36, '#c5d7ef')
            text(im, (116, 639), '从推文到回复，让想法自然落笔。', 27, MUTED)
            draw = ImageDraw.Draw(im)
            draw.rounded_rectangle((115, 739, 474, 793), 27, fill='#183455', outline='#3975ad')
            text(im, (143, 748), '自动生成  /  多条候选  /  一键回填', 18, '#b8dbff')
        elif index == 6:
            logo = self.logo.resize((132, 132), Image.Resampling.LANCZOS)
            paste_alpha(im, logo, ((W - 132) / 2, 224))
            center(im, 403, 'X AI 回复助手', 78, bold=True)
            center(im, 521, '把想说的话写出来。', 42, '#c8d9ef')
            center(im, 620, '自动生成  ·  多种风格  ·  一键回填', 28, MUTED)
            center(im, 726, 'github.com/onlyonexhj/X-AI-replay', 28, BLUE)
            center(im, 792, 'Chrome 扩展  /  自备模型 API Key', 21, '#93a7c1')
        else:
            eyebrow, title, bullets = COPY[index]
            text(im, (112, 219), eyebrow, 23, BLUE)
            text(im, (106, 297), title, 60, bold=True, spacing=23)
            draw = ImageDraw.Draw(im)
            for j, bullet in enumerate(bullets):
                y = 555 + j * 68
                draw.ellipse((115, y + 15, 123, y + 23), fill=MINT)
                text(im, (145, y + 1), bullet, 24, '#b4c5dc')
            if index == 5:
                text(im, (112, 805), '请求由浏览器发送至\n你所选择的模型服务商。', 19, '#8fa6c0', spacing=10)
        return im

    @staticmethod
    def make_cursor():
        image = Image.new('RGBA', (44 * 3, 56 * 3))
        draw = ImageDraw.Draw(image)
        polygon = [(3, 2), (5, 39), (15, 30), (23, 48), (30, 45), (22, 27), (37, 27)]
        polygon = [(x * 3, y * 3) for x, y in polygon]
        draw.polygon([(x + 3, y + 5) for x, y in polygon], fill=(0, 0, 0, 160))
        draw.polygon(polygon, fill='white', outline='#13243a', width=4)
        return image.resize((44, 56), Image.Resampling.LANCZOS)

    def ui(self, im, name, t, target=None, click=None):
        item = self.assets[name]
        source = item['image']
        rect = (636, 180, 1196, 735)
        x, y, width, height = rect
        draw = ImageDraw.Draw(im)
        draw.rounded_rectangle((x - 7, y + 10, x + width + 7, y + height + 17), 28, fill='#030912')
        draw.rounded_rectangle((x, y, x + width, y + height), 25, fill='#0d1725', outline='#34465e', width=2)
        inner = Image.new('RGB', (width - 22, height - 22), '#0b1320')
        zoom = 1 + 0.008 * ease(t / 5)
        scale = min(inner.width / source.width, inner.height / source.height) * zoom
        size = (round(source.width * scale), round(source.height * scale))
        shown = source.resize(size, Image.Resampling.LANCZOS)
        ox, oy = (inner.width - size[0]) // 2, (inner.height - size[1]) // 2
        inner.paste(shown, (ox, oy))
        im.paste(inner, (x + 11, y + 11), rounded_mask(inner.size, 16))
        if target:
            targets = item.get('targets', {})
            point = targets.get(target)
            if point:
                px = point.get('cx', point.get('x', 0) + point.get('width', 0) / 2)
                py = point.get('cy', point.get('y', 0) + point.get('height', 0) / 2)
                tx, ty = x + 11 + ox + px * scale, y + 11 + oy + py * scale
                # A short approach to the real target, followed by a click pulse.
                approach = ease(min(t, 0.9) / 0.9)
                tx += 74 * (1 - approach)
                ty += 50 * (1 - approach)
                if click is not None and 0 <= click < 0.8:
                    layer = Image.new('RGBA', (W, H))
                    ripple = ImageDraw.Draw(layer)
                    radius = 14 + 26 * click / 0.8
                    alpha = int(190 * (1 - click / 0.8))
                    ripple.ellipse((tx - radius, ty - radius, tx + radius, ty + radius),
                                   outline=(101, 181, 255, alpha), width=3)
                    paste_alpha(im, layer)
                paste_alpha(im, self.cursor, (tx - 7, ty - 6))

    def intro_cards(self, im, t):
        entries = [
            ('01', '工具替我加班，我替它喝咖啡，\n这才叫周末。', BLUE),
            ('02', '把重复步骤自动化，\n才有余力把体验做细。', MINT),
            ('03', '省下来的时间，用在真正\n喜欢的事情上，真好。', '#b4aaff'),
        ]
        for index, (number, value, accent) in enumerate(entries):
            layer = Image.new('RGBA', (740, 166))
            draw = ImageDraw.Draw(layer)
            draw.rounded_rectangle((1, 1, 738, 164), 21, fill=(17, 30, 49, 245), outline='#304964', width=2)
            text(layer, (24, 28), number, 21, accent)
            text(layer, (88, 25), value, 27, '#e3ecf8', spacing=13)
            alpha = ease((t - index * 0.20 - 0.15) / 0.7)
            offset = int(50 * (1 - alpha))
            paste_alpha(im, layer, (1052 + offset, 248 + index * 183), alpha)

    def scene(self, index, t):
        im = self.bases[index].copy()
        if index == 0:
            self.intro_cards(im, t)
        elif index == 1:
            if t < 1.2:
                self.ui(im, 'timeline', t, 'reply', t - 0.9)
            elif t < 2.6:
                self.ui(im, 'loading', t)
            elif t < 4.1:
                self.ui(im, 'partial', t)
            else:
                self.ui(im, 'results', t)
        elif index == 2:
            if t < 2.0:
                self.ui(im, 'results', t, 'candidate_1', t - 1.5)
            else:
                self.ui(im, 'filled', t, 'editor')
        elif index == 3:
            if t < 1.7:
                self.ui(im, 'results', t)
            elif t < 3.8:
                self.ui(im, 'style-humor', t, 'style_humor', t - 1.7)
            else:
                self.ui(im, 'style-pro', t, 'style_pro', t - 3.8)
        elif index == 4:
            self.ui(im, 'prompt-preview' if t > 3 and 'prompt-preview' in self.assets else 'prompt', t)
        elif index == 5:
            self.ui(im, 'providers', t)
        return im

    def frame(self, when):
        start = 0
        for i, duration in enumerate(DURATIONS):
            if when < start + duration or i == 6:
                break
            start += duration
        local = when - start
        image = self.scene(i, local)
        if i and local < 0.38:
            previous = self.scene(i - 1, DURATIONS[i - 1])
            image = Image.blend(previous, image, ease(local / 0.38))
        draw = ImageDraw.Draw(image)
        draw.line((88, 1009, 1832, 1009), fill='#26354a')
        center(image, 950, CAPTIONS[i], 28, '#d6e3f5')
        for k in range(7):
            x = 90 + k * 39
            draw.rounded_rectangle((x, 1039, x + 25, 1043), 2, fill=BLUE if k <= i else '#354256')
        text(image, (1300, 1025), '示例界面与推文  ·  AI 回复为模拟数据', 17, '#8598b1')
        if when < 0.4:
            image = Image.blend(Image.new('RGB', (W, H)), image, ease(when / 0.4))
        if when > TOTAL - 0.55:
            image = Image.blend(image, Image.new('RGB', (W, H)), ease((when - TOTAL + 0.55) / 0.55))
        return image


def export_notes(out_dir):
    position = 0
    subtitles, storyboard = [], ['# X AI 回复助手 · 横屏产品介绍', '',
        '- 1920×1080，30fps，40 秒，H.264 / AAC。',
        '- 中文字幕与程序合成背景音乐，无旁白。',
        '- 使用当前扩展界面；推文、模型回复和 API Key 均为演示数据。',
        '- 操作止于回填，未连接个人 X 登录态，未点击发布。', '', '## 分镜', '']
    for i, (duration, caption) in enumerate(zip(DURATIONS, CAPTIONS), 1):
        def stamp(seconds):
            whole = int(seconds)
            return '%02d:%02d:%02d,000' % (whole // 3600, (whole // 60) % 60, whole % 60)
        subtitles.append('%d\n%s --> %s\n%s\n' % (i, stamp(position), stamp(position + duration), caption))
        storyboard.append('%02d–%02d 秒：%s' % (position, position + duration, caption))
        position += duration
    (out_dir / 'captions.srt').write_text('\n'.join(subtitles), encoding='utf-8-sig')
    (out_dir / '说明与分镜.md').write_text('\n'.join(storyboard) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out-dir', type=Path, default=ROOT / 'store/promo-20261018')
    parser.add_argument('--work-dir', type=Path, default=ROOT / 'dev/_promo')
    parser.add_argument('--reuse-assets', action='store_true')
    parser.add_argument('--preview-only', action='store_true')
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    args.work_dir.mkdir(parents=True, exist_ok=True)
    manifest = args.work_dir / 'assets.json'
    if args.reuse_assets and manifest.exists():
        metadata = json.loads(manifest.read_text(encoding='utf-8'))
    else:
        metadata = asyncio.run(render_assets(str(args.work_dir / 'frames')))
        manifest.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    film = Film(metadata)
    times = [2.8, 8.8, 14.8, 20.5, 26.4, 32.6, 38.0]
    sheet = Image.new('RGB', (1920, 540), '#06101c')
    for i, when in enumerate(times):
        frame = film.frame(when)
        frame.save(args.work_dir / ('review-%02d.png' % i))
        tile = frame.resize((480, 270), Image.Resampling.LANCZOS)
        sheet.paste(tile, ((i % 4) * 480, (i // 4) * 270))
    sheet.save(args.work_dir / 'contact-sheet.jpg', quality=92)
    film.frame(2.8).save(args.out_dir / 'cover.png')
    export_notes(args.out_dir)
    print('Preview:', args.work_dir / 'contact-sheet.jpg', flush=True)
    if args.preview_only:
        return
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    silent = args.work_dir / 'video-silent.mp4'
    log_path = args.work_dir / 'encode.log'
    command = [ffmpeg, '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo', '-pix_fmt', 'rgb24',
               '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-an', '-c:v', 'libx264',
               '-preset', 'fast', '-crf', '19', '-vf', 'scale=out_color_matrix=bt709:out_range=tv',
               '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709',
               '-colorspace', 'bt709', str(silent)]
    print('Encoding 1200 frames…', flush=True)
    with log_path.open('wb') as log:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            for number in range(int(TOTAL * FPS)):
                process.stdin.write(film.frame(number / FPS).tobytes())
                if number % 120 == 0:
                    print('  %d / 1200' % number, flush=True)
            process.stdin.close()
            result = process.wait()
        except BaseException:
            process.kill()
            process.wait()
            raise
    if result:
        raise RuntimeError(log_path.read_text(encoding='utf-8', errors='replace')[-3000:])
    music = make_music(str(args.work_dir / 'music.wav'), TOTAL)
    temporary = args.out_dir / 'video-building.mp4'
    output = args.out_dir / 'x-ai-reply-promo-1080p.mp4'
    subprocess.run([ffmpeg, '-y', '-i', str(silent), '-i', music, '-map', '0:v', '-map', '1:a',
                    '-c:v', 'copy', '-af', 'loudnorm=I=-20:TP=-1.5:LRA=8', '-c:a', 'aac', '-b:a', '192k',
                    '-ar', '48000', '-ac', '2',
                    '-t', str(TOTAL), '-movflags', '+faststart', str(temporary)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    os.replace(temporary, output)
    print('Video:', output, flush=True)
    print('Size: %.2f MB' % (output.stat().st_size / 1024 / 1024), flush=True)


if __name__ == '__main__':
    main()
