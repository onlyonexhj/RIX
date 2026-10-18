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
from demo_i18n import COPY, LANGUAGES


ROOT = Path(__file__).resolve().parents[1]
W, H, FPS, TOTAL = 1920, 1080, 30, 60
BLUE, MINT, WHITE = '#75baff', '#89e1c6', '#edf4ff'
DURATIONS = [3, 8, 7, 10, 7, 6, 7, 7, 5]
CAPTION_TIMES = [(0,3),(3,5.3),(5.3,8.2),(8.2,11),(11,13.2),(13.2,18),
                 (18,23),(23,28),(28,31.5),(31.5,33.8),(33.8,35),(35,38.2),
                 (38.2,41),(41,48),(48,51.8),(51.8,55),(55,60)]


def captions(language):
    values = COPY[language]['captions']
    assert len(values) == len(CAPTION_TIMES)
    return [(begin, end, value) for (begin,end),value in zip(CAPTION_TIMES,values)]


def ease(value):
    value = max(0., min(1., value))
    return value * value * (3 - 2 * value)


@lru_cache(maxsize=128)
def font(size, bold=False, language='zh'):
    names = {'zh': ('msyh.ttc','msyhbd.ttc'), 'en': ('segoeui.ttf','segoeuib.ttf'),
             'ja': ('YuGothM.ttc','YuGothB.ttc'), 'vi': ('segoeui.ttf','segoeuib.ttf'),
             'ko': ('malgun.ttf','malgunbd.ttf')}
    return ImageFont.truetype(str(Path('C:/Windows/Fonts') / names[language][bool(bold)]), size)


def label(image, xy, value, size=26, color=WHITE, bold=False, language='zh', max_width=None):
    draw = ImageDraw.Draw(image)
    while max_width and size > 12 and draw.textlength(value, font=font(size,bold,language)) > max_width:
        size -= 1
    draw.text(xy, value, fill=color, font=font(size, bold, language))


def centered(image, y, value, size=30, color=WHITE, bold=False, language='zh'):
    draw = ImageDraw.Draw(image)
    while size > 14 and draw.textlength(value,font=font(size,bold,language)) > W-160:
        size -= 1
    width = draw.textlength(value, font=font(size, bold, language))
    label(image, ((W-width)/2, y), value, size, color, bold, language)


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
    def __init__(self, metadata, language='zh'):
        self.language = language
        self.copy = COPY[language]
        self.captions = captions(language)
        self.metadata = metadata
        self.assets = {name: {**item, 'image': Image.open(item['path']).convert('RGB')}
                       for name, item in metadata['assets'].items()}
        self.background = make_background()
        self.logo = Image.open(ROOT/'icons/icon128.png').convert('RGBA')
        self.cursor = self.make_cursor()
        self.chrome = [self.make_chrome(index) for index in range(9)]
        self.rendered = {}
        self.cameras = self.make_cameras()

    def label(self, *args, **kwargs):
        return label(*args, language=self.language, **kwargs)

    def centered(self, *args, **kwargs):
        return centered(*args, language=self.language, **kwargs)

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
        self.label(image, (141,43), self.copy['product'], 28, bold=True, max_width=1050)
        heading = self.copy['header']
        heading_width = ImageDraw.Draw(image).textlength(heading,font=font(20,False,self.language))
        self.label(image, (1844-heading_width,48), heading, 20, '#a8bdd5')
        draw = ImageDraw.Draw(image)
        draw.line((76,109,1844,109), fill='#29384b')
        if 1 <= index <= 7:
            self.label(image, (83,135), self.copy['titles'][index], 39, bold=True, max_width=1490)
            self.label(image, (1694,146), f'{index:02d} / 07', 23, BLUE)
            for step, title in enumerate(self.copy['steps'], 1):
                x = 85+(step-1)*250
                active = step == index
                color = BLUE if active else '#61758e'
                draw.rounded_rectangle((x,199,x+25,224), 12, fill='#1e4266' if active else '#172438')
                self.label(image, (x+7,200), str(step), 14, WHITE if active else '#788ca5')
                self.label(image, (x+37,197), title, 18, color, active, max_width=205)
        elif index == 0:
            overlay(image, self.logo.resize((110,110), Image.Resampling.LANCZOS), (905,220))
            self.centered(image, 382, self.copy['intro_lines'][0], 68, bold=True)
            self.centered(image, 479, self.copy['intro_lines'][1], 68, bold=True)
            self.centered(image, 614, self.copy['intro_subtitle'], 30, '#b0c4df')
            self.centered(image, 704, self.copy['intro_flow'], 27, BLUE)
        else:
            overlay(image, self.logo.resize((112,112), Image.Resampling.LANCZOS), (904,227))
            self.centered(image, 402, self.copy['product'], 69, bold=True)
            self.centered(image, 515, self.copy['outro_tagline'], 36, '#c6d8ee')
            self.centered(image, 620, self.copy['outro_features'], 29, BLUE)
            self.centered(image, 735, 'github.com/onlyonexhj/X-AI-replay', 26, '#9db6d4')
            self.centered(image, 795, self.copy['outro_note'], 20, '#7c94b0')
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
        caption = next(value for begin,end,value in self.captions if begin<=when<end)
        self.centered(image,956,caption,29,'#e0ebfa')
        self.label(image,(82,1010),self.copy['disclaimer'],16,'#7189a4',max_width=1450)
        self.label(image,(1680,1010),f'00:{int(when):02d} / 01:00',16,'#9aafc8')
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


def notes(output, language):
    localized = captions(language)
    subtitles=[f'{index}\n{stamp(begin)} --> {stamp(end)}\n{caption}\n'
               for index,(begin,end,caption) in enumerate(localized,1)]
    (output/'captions.srt').write_text('\n'.join(subtitles),encoding='utf-8-sig')
    details = {'language': language, 'name': COPY[language]['name'], 'duration_seconds': TOTAL,
               'resolution': [W,H], 'fps': FPS, 'video_codec': 'H.264', 'audio_codec': 'AAC',
               'audio': 'instrumental background music, no voiceover',
               'real_extension_ui': True, 'fictional_data': True,
               'captions': [{'start': begin,'end': end,'text': value} for begin,end,value in localized]}
    (output/'production.json').write_text(json.dumps(details,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def build(args, language, music_path):
    output = args.out_dir / language
    work = args.work_dir / language
    output.mkdir(parents=True,exist_ok=True)
    work.mkdir(parents=True,exist_ok=True)
    manifest=work/'assets.json'
    if args.reuse_assets and manifest.exists():
        metadata=json.loads(manifest.read_text(encoding='utf-8'))
        assert metadata.get('language') == language, 'Cached scene language does not match'
    else:
        metadata=asyncio.run(render_assets(str(work/'frames'), language=language))
        manifest.write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    film=Walkthrough(metadata,language)
    times=[1.8,4.6,7.5,10,15.5,21.5,26.5,33.5,37.7,40.7,45,50,53,57.5]
    sheet=Image.new('RGB',(1920,1080),'#07101c')
    for index,when in enumerate(times):
        frame=film.frame(when)
        frame.save(work/f'review-{index:02d}.png')
        sheet.paste(frame.resize((480,270),Image.Resampling.LANCZOS),((index%4)*480,(index//4)*270))
    sheet.save(work/'contact-sheet.jpg',quality=92)
    film.frame(15.5).save(output/'cover.png')
    notes(output,language)
    print(f'{language} preview: '+str(work/'contact-sheet.jpg'),flush=True)
    if args.preview_only:
        return
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    silent=work/'video-silent.mp4'
    command=[ffmpeg,'-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24',
             '-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','19','-threads','4',
             '-vf','scale=out_color_matrix=bt709:out_range=tv','-pix_fmt','yuv420p',
             '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',str(silent)]
    log_path=work/'encode.log'
    frames=TOTAL*FPS
    with log_path.open('wb') as log:
        process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=log,
                                 creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for number in range(frames):
                process.stdin.write(film.frame(number/FPS).tobytes())
                if number%150==0:
                    print(f'{language} encoding: {number} / {frames}',flush=True)
            process.stdin.close()
            result=process.wait()
        except BaseException:
            process.kill()
            process.wait()
            raise
    if result:
        raise RuntimeError(log_path.read_text(encoding='utf-8',errors='replace')[-3000:])
    if not music_path.exists():
        make_music(str(music_path),TOTAL)
    temporary=output/'video-building.mp4'
    target=output/'x-ai-reply-demo-1080p.mp4'
    subprocess.run([ffmpeg,'-y','-i',str(silent),'-i',str(music_path),'-map','0:v','-map','1:a','-c:v','copy',
                    '-af','loudnorm=I=-20:TP=-1.5:LRA=8','-c:a','aac','-b:a','192k','-ar','48000','-ac','2',
                    '-t',str(TOTAL),'-movflags','+faststart',str(temporary)],check=True,
                   stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,
                   creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    os.replace(temporary,target)
    print(f'{language} video: {target} ({target.stat().st_size/1024/1024:.2f} MB)',flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out-dir',type=Path,default=ROOT/'store/demos',help='Output parent directory; each language gets a subdirectory')
    parser.add_argument('--work-dir',type=Path,default=ROOT/'dev/_promo_demo_i18n')
    choices=parser.add_mutually_exclusive_group()
    choices.add_argument('--language',choices=LANGUAGES,default='zh')
    choices.add_argument('--all-languages',action='store_true')
    parser.add_argument('--reuse-assets',action='store_true')
    parser.add_argument('--preview-only',action='store_true')
    args=parser.parse_args()
    args.work_dir.mkdir(parents=True,exist_ok=True)
    for language in LANGUAGES if args.all_languages else [args.language]:
        build(args,language,args.work_dir/'music.wav')


if __name__=='__main__':
    main()
