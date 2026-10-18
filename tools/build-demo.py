"""Build a captioned 60-second product walkthrough from verified local UI scenes.

The product controls and editor are real extension code; tweets, model replies,
and credentials are demonstration data. Exported promotional films are preserved.
"""
from __future__ import annotations

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
from PIL import Image, ImageDraw, ImageFont

from promo_audio import make_music
from demo_scenes import render_assets


ROOT = Path(__file__).resolve().parents[1]
W, H, FPS, TOTAL = 1920, 1080, 30, 60
BLUE, MINT, WHITE = '#75baff', '#89e1c6', '#edf4ff'
DURATIONS = [3, 8, 7, 10, 7, 6, 7, 7, 5]
TITLES = [
    '', '打开推文的回复弹层', '选择候选，一键填入', '切换风格，换一种表达',
    '调整条数与输出语言', '随时中止，重新生成', '选择你常用的模型服务',
    '设置人设与提示词', '',
]
STEPS = ['打开回复', '选择填入', '切换风格', '条数与语言', '中止与重试', '模型服务', '人设与提示词']
CAPTIONS = [
    (0, 3, 'X AI 回复助手 · 从推文到回复的完整演示'),
    (3, 5.3, '点击推文下方的回复按钮。'),
    (5.3, 8.2, '面板自动读取上下文，逐条显示生成的候选。'),
    (8.2, 11, '候选回复生成完成，挑选你喜欢的一条。'),
    (11, 13.2, '点击候选，即可填入回复输入框。'),
    (13.2, 18, '你可以继续修改内容，再自行决定是否发布。'),
    (18, 23, '切换到幽默风格，重新生成另一种表达。'),
    (23, 28, '也可以选择专业风格，让回复更贴近当前语境。'),
    (28, 31.5, '按需要调整回复条数和输出语言。'),
    (31.5, 33.8, '生成一条英文候选，确认内容。'),
    (33.8, 35, '点击候选，填入新的回复。'),
    (35, 38.2, '生成过程中，可以随时中止。'),
    (38.2, 41, '需要继续时，再点一次生成回复。'),
    (41, 48, '在设置中选择模型服务，填写自己的 API Key。'),
    (48, 51.8, '设置人设与提示词，让回复更符合你的表达习惯。'),
    (51.8, 55, '预览提示内容，确认设置是否符合预期。'),
    (55, 60, 'X AI 回复助手，让表达更轻松。'),
]


def ease(value):
    value = max(0., min(1., value))
    return value * value * (3 - 2 * value)


@lru_cache(maxsize=32)
def font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc', size)


def label(image, xy, value, size=26, color=WHITE, bold=False):
    ImageDraw.Draw(image).text(xy, value, fill=color, font=font(size, bold))


def centered(image, y, value, size=30, color=WHITE, bold=False):
    width = ImageDraw.Draw(image).textlength(value, font=font(size, bold))
    label(image, ((W-width)/2, y), value, size, color, bold)


def overlay(image, layer, xy=(0, 0)):
    image.paste(layer, (round(xy[0]), round(xy[1])), layer)


def mask(size, radius):
    image = Image.new('L', size)
    ImageDraw.Draw(image).rounded_rectangle((0, 0, size[0]-1, size[1]-1), radius, fill=255)
    return image


def make_background():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    glow = np.exp(-(((xx-1620)/850)**2+((yy-20)/680)**2))
    rgb = np.stack([7+glow*7, 13+glow*18, 23+glow*30], axis=-1)
    return Image.fromarray(rgb.astype('uint8'))


class Walkthrough:
    def __init__(self, metadata):
        self.metadata = metadata
        self.assets = {name: {**item, 'image': Image.open(item['path']).convert('RGB')}
                       for name, item in metadata['assets'].items()}
        self.background = make_background()
        self.logo = Image.open(ROOT/'icons/icon128.png').convert('RGBA')
        self.cursor = self.make_cursor()
        self.chrome = [self.make_chrome(index) for index in range(9)]
        self.rendered = {}
        self.cameras = self.make_cameras()

    @staticmethod
    def make_cursor():
        image = Image.new('RGBA', (132, 168))
        draw = ImageDraw.Draw(image)
        points = [(3,2),(5,39),(15,30),(23,48),(30,45),(22,27),(37,27)]
        draw.polygon([(x*3+4,y*3+6) for x,y in points], fill=(0,0,0,150))
        draw.polygon([(x*3,y*3) for x,y in points], fill='white', outline='#13243a', width=5)
        return image.resize((44,56), Image.Resampling.LANCZOS)

    def make_chrome(self, index):
        image = self.background.copy()
        overlay(image, self.logo.resize((48,48), Image.Resampling.LANCZOS), (76,37))
        label(image, (141,43), 'X AI 回复助手', 28, bold=True)
        label(image, (1510,48), '产品操作演示  /  1080p', 20, '#a8bdd5')
        draw = ImageDraw.Draw(image)
        draw.line((76,109,1844,109), fill='#29384b')
        if 1 <= index <= 7:
            label(image, (83,135), TITLES[index], 39, bold=True)
            label(image, (1694,146), f'{index:02d} / 07', 23, BLUE)
            for step, title in enumerate(STEPS, 1):
                x = 85+(step-1)*250
                active = step == index
                color = BLUE if active else '#61758e'
                draw.rounded_rectangle((x,199,x+25,224), 12, fill='#1e4266' if active else '#172438')
                label(image, (x+7,200), str(step), 14, WHITE if active else '#788ca5')
                label(image, (x+37,197), title, 18, color, active)
        elif index == 0:
            overlay(image, self.logo.resize((110,110), Image.Resampling.LANCZOS), (905,220))
            centered(image, 382, '从一条推文，', 68, bold=True)
            centered(image, 479, '到一句想说的回复。', 68, bold=True)
            centered(image, 614, 'X AI 回复助手 · 60 秒操作演示', 30, '#b0c4df')
            centered(image, 704, '打开回复   →   生成候选   →   选择填入', 27, BLUE)
        else:
            overlay(image, self.logo.resize((112,112), Image.Resampling.LANCZOS), (904,227))
            centered(image, 402, 'X AI 回复助手', 69, bold=True)
            centered(image, 515, '回复写好了，发布由你决定。', 36, '#c6d8ee')
            centered(image, 620, '自动生成  ·  多种风格  ·  一键填入', 29, BLUE)
            centered(image, 735, 'github.com/onlyonexhj/X-AI-replay', 26, '#9db6d4')
            centered(image, 795, 'Chrome 扩展  /  自备模型 API Key', 20, '#7c94b0')
        return image

    def choose(self, *names):
        for name in names:
            if name in self.assets:
                return name
        raise KeyError(names)

    def make_cameras(self):
        cameras = {}
        for index,reference in ((1,'results'),(2,'results'),(3,'style-pro'),
                                (4,'language-results'),(5,'language-results')):
            item = self.assets[reference]
            points = item['targets']
            panel,dialog = points['panel'],points['dialog']
            left = max(0,math.floor(panel['x']-15))
            right = min(item['image'].width,math.ceil(dialog['x']+dialog['width']+15))
            if index == 1:
                top = min(panel['y'],dialog['y'])-15
                bottom = max(panel['y']+panel['height'],dialog['y']+dialog['height'])+15
            elif index == 2:
                top = min(points['generate']['y']-14,points['candidate_0']['y']-25,points['editor']['y']-25)
                bottom = max(points['candidate_2']['y']+points['candidate_2']['height'],
                             points['editor']['y']+points['editor']['height'])+20
            else:
                first = 'style_humor' if index == 3 else 'count_1' if index == 4 else 'generate'
                top = points[first]['y']-26
                bottom = max(points['candidate_0']['y']+points['candidate_0']['height'],
                             points['editor']['y']+points['editor']['height'])+20
            cameras[index] = (left,max(0,math.floor(top)),right,min(item['image'].height,math.ceil(bottom)))
        return cameras

    def ui_base(self, index, name):
        key = (index,name)
        if key in self.rendered:
            return self.rendered[key]
        image = self.chrome[index].copy()
        item = self.assets[name]
        source = item['image']
        camera = self.cameras.get(index) if name not in ('timeline',) else None
        if camera:
            source = source.crop(camera)
        # Full-width content keeps the actual controls large enough to read.
        x,y,width,height = 80,246,1760,688
        scale = min((width-26)/source.width, (height-26)/source.height)
        dimensions = (round(source.width*scale),round(source.height*scale))
        shown = source.resize(dimensions, Image.Resampling.LANCZOS)
        ix,iy = x+(width-dimensions[0])//2,y+(height-dimensions[1])//2
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((ix-11,iy-11,ix+dimensions[0]+11,iy+dimensions[1]+11), 22,
                               fill='#0a111a', outline='#34485f', width=2)
        image.paste(shown, (ix,iy), mask(dimensions,14))
        points = {}
        for target, box in item.get('targets',{}).items():
            cx,cy = box['cx']-(camera[0] if camera else 0),box['cy']-(camera[1] if camera else 0)
            if not (0<=cx<=source.width and 0<=cy<=source.height):
                continue
            points[target] = {'cx':ix+cx*scale, 'cy':iy+cy*scale,
                              'x':ix+(box['x']-(camera[0] if camera else 0))*scale,
                              'y':iy+(box['y']-(camera[1] if camera else 0))*scale,
                              'width':box['width']*scale,'height':box['height']*scale}
        self.rendered[key] = image,points
        return image,points

    def screen(self, index, name, local, target=None, click=None, highlight=None):
        base,points = self.ui_base(index,name)
        image = base.copy()
        if highlight in points:
            point = points[highlight]
            layer = Image.new('RGBA',(W,H))
            ImageDraw.Draw(layer).rounded_rectangle(
                (point['x']-7,point['y']-7,point['x']+point['width']+7,point['y']+point['height']+7),
                13, outline=(137,225,198,220), width=3)
            overlay(image,layer)
        if target in points:
            point = points[target]
            motion = ease(local/.85)
            tx,ty = point['cx']+88*(1-motion),point['cy']+63*(1-motion)
            if click is not None and 0 <= click < .65:
                layer = Image.new('RGBA',(W,H))
                radius = 14+27*click/.65
                ImageDraw.Draw(layer).ellipse((tx-radius,ty-radius,tx+radius,ty+radius),
                    outline=(117,186,255,round(220*(1-click/.65))),width=3)
                overlay(image,layer)
            overlay(image,self.cursor,(tx-6,ty-5))
        return image

    def scene(self, index, t):
        if index in (0,8):
            return self.chrome[index].copy()
        if index == 1:
            if t < 2.3:
                return self.screen(index,'timeline',t,'reply',t-1.85)
            if t < 3.8:
                return self.screen(index,'loading',t-2.3,highlight='generate')
            if t < 5.2:
                return self.screen(index,'partial',t-3.8,highlight='candidate_0')
            return self.screen(index,'results',t-5.2)
        if index == 2:
            if t < 2.2:
                return self.screen(index,'results',t,'candidate_1',t-1.75)
            return self.screen(index,'filled',t-2.2,highlight='editor')
        if index == 3:
            if t < 1.2:
                return self.screen(index,'filled',t,'style_humor',t-.9)
            if t < 2.15:
                return self.screen(index,self.choose('humor-selected','style-humor'),t-1.2,'generate',t-1.85)
            if t < 3.0:
                return self.screen(index,self.choose('humor-loading','loading'),t-2.15)
            if t < 5.0:
                return self.screen(index,'style-humor',t-3,highlight='candidate_0')
            if t < 6.2:
                return self.screen(index,'style-humor',t-5,'style_pro',t-5.9)
            if t < 7.15:
                return self.screen(index,self.choose('pro-selected','style-pro'),t-6.2,'generate',t-6.85)
            if t < 8.0:
                return self.screen(index,self.choose('pro-loading','loading'),t-7.15)
            return self.screen(index,'style-pro',t-8,highlight='candidate_0')
        if index == 4:
            if t < 1.2:
                return self.screen(index,'style-pro',t,'count_1',t-.9)
            if t < 2.4:
                return self.screen(index,self.choose('count-selected','language-selected'),t-1.2,'language',t-2.05)
            if t < 3.5:
                return self.screen(index,'language-selected',t-2.4,'generate',t-3.15)
            if t < 4.5:
                return self.screen(index,self.choose('language-loading','loading'),t-3.5)
            if t < 6.0:
                return self.screen(index,'language-results',t-4.5,'candidate_0',t-5.65)
            return self.screen(index,'language-filled',t-6.0,highlight='editor')
        if index == 5:
            if t < 1.0:
                return self.screen(index,'language-filled',t,'generate',t-.7)
            if t < 2.25:
                return self.screen(index,self.choose('cancel-loading','language-loading','loading'),t-1,'stop',t-1.95)
            if t < 3.2:
                return self.screen(index,self.choose('demo-cancelled','cancelled'),t-2.25,highlight='generate')
            if t < 4.15:
                return self.screen(index,self.choose('demo-cancelled','cancelled'),t-3.2,'generate',t-3.85)
            if t < 4.9:
                return self.screen(index,self.choose('retry-loading','language-loading','loading'),t-4.15)
            return self.screen(index,self.choose('retry-results','language-results'),t-4.9,highlight='candidate_0')
        if index == 6:
            return self.screen(index,'providers',t,'preset' if t<3 else 'api_key',
                               None,highlight='preset' if t<3 else 'api_key')
        if index == 7:
            if t < 3.8:
                return self.screen(index,'prompt',t,'persona',highlight='persona')
            return self.screen(index,'prompt-preview',t-3.8,highlight='user')
        raise ValueError(index)

    def frame(self, when):
        start = 0
        for index,duration in enumerate(DURATIONS):
            if when < start+duration or index==len(DURATIONS)-1:
                break
            start += duration
        local = when-start
        image = self.scene(index,local)
        if index and local<.2:
            image = Image.blend(self.scene(index-1,DURATIONS[index-1]-.001),image,ease(local/.2))
        caption = next(value for begin,end,value in CAPTIONS if begin<=when<end)
        centered(image,956,caption,29,'#e0ebfa')
        label(image,(82,1010),'示例界面与推文 · AI 回复为模拟数据',16,'#7189a4')
        label(image,(1680,1010),f'00:{int(when):02d} / 01:00',16,'#9aafc8')
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((82,1046,1838,1050),2,fill='#243449')
        draw.rounded_rectangle((82,1046,82+1756*when/TOTAL,1050),2,fill=BLUE)
        if when<.3:
            image=Image.blend(Image.new('RGB',(W,H)),image,ease(when/.3))
        if when>TOTAL-.5:
            image=Image.blend(image,Image.new('RGB',(W,H)),ease((when-TOTAL+.5)/.5))
        return image


def stamp(seconds):
    value=round(seconds*1000)
    return f'{value//3600000:02d}:{value//60000%60:02d}:{value//1000%60:02d},{value%1000:03d}'


def notes(output):
    subtitles=[f'{index}\n{stamp(begin)} --> {stamp(end)}\n{caption}\n'
               for index,(begin,end,caption) in enumerate(CAPTIONS,1)]
    (output/'captions.srt').write_text('\n'.join(subtitles),encoding='utf-8-sig')
    lines=['# X AI 回复助手 · 产品操作演示','','- 时长：60 秒。1920×1080，30fps，H.264 / AAC。',
           '- 中文字幕、背景音乐，无旁白。','- 使用当前扩展代码与虚构推文；模型回复、账号及 API Key 均为演示数据。',
           '- 所有网络请求在本地拦截，操作止于回填。','','## 演示流程','']
    lines.extend(f'{begin:04.1f}–{end:04.1f} 秒：{caption}' for begin,end,caption in CAPTIONS)
    (output/'演示说明.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out-dir',type=Path,default=ROOT/'store/demo-20261018')
    parser.add_argument('--work-dir',type=Path,default=ROOT/'dev/_promo_demo')
    parser.add_argument('--reuse-assets',action='store_true')
    parser.add_argument('--preview-only',action='store_true')
    args=parser.parse_args()
    args.out_dir.mkdir(parents=True,exist_ok=True)
    args.work_dir.mkdir(parents=True,exist_ok=True)
    manifest=args.work_dir/'assets.json'
    if args.reuse_assets and manifest.exists():
        metadata=json.loads(manifest.read_text(encoding='utf-8'))
    else:
        metadata=asyncio.run(render_assets(str(args.work_dir/'frames')))
        manifest.write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    film=Walkthrough(metadata)
    times=[1.8,4.6,7.5,10,15.5,21.5,26.5,33.5,37.7,40.7,45,50,53,57.5]
    sheet=Image.new('RGB',(1920,1080),'#07101c')
    for index,when in enumerate(times):
        frame=film.frame(when)
        frame.save(args.work_dir/f'review-{index:02d}.png')
        sheet.paste(frame.resize((480,270),Image.Resampling.LANCZOS),((index%4)*480,(index//4)*270))
    sheet.save(args.work_dir/'contact-sheet.jpg',quality=92)
    film.frame(15.5).save(args.out_dir/'cover.png')
    notes(args.out_dir)
    print('Preview: '+str(args.work_dir/'contact-sheet.jpg'),flush=True)
    if args.preview_only:
        return
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    silent=args.work_dir/'video-silent.mp4'
    command=[ffmpeg,'-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24',
             '-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','19',
             '-vf','scale=out_color_matrix=bt709:out_range=tv','-pix_fmt','yuv420p',
             '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',str(silent)]
    log_path=args.work_dir/'encode.log'
    frames=TOTAL*FPS
    with log_path.open('wb') as log:
        process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=log,
                                 creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for number in range(frames):
                process.stdin.write(film.frame(number/FPS).tobytes())
                if number%150==0:
                    print(f'Encoding: {number} / {frames}',flush=True)
            process.stdin.close()
            result=process.wait()
        except BaseException:
            process.kill()
            process.wait()
            raise
    if result:
        raise RuntimeError(log_path.read_text(encoding='utf-8',errors='replace')[-3000:])
    music=make_music(str(args.work_dir/'music.wav'),TOTAL)
    temporary=args.out_dir/'video-building.mp4'
    target=args.out_dir/'x-ai-reply-demo-1080p.mp4'
    subprocess.run([ffmpeg,'-y','-i',str(silent),'-i',music,'-map','0:v','-map','1:a','-c:v','copy',
                    '-af','loudnorm=I=-20:TP=-1.5:LRA=8','-c:a','aac','-b:a','192k','-ar','48000','-ac','2',
                    '-t',str(TOTAL),'-movflags','+faststart',str(temporary)],check=True,
                   stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,
                   creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    os.replace(temporary,target)
    print(f'Video: {target}',flush=True)
    print(f'Size: {target.stat().st_size/1024/1024:.2f} MB',flush=True)


if __name__=='__main__':
    main()
