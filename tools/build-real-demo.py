"""Edit the user's real X recording into five narrated, captioned walkthroughs.

The source is read only and is never uploaded. Its Chinese interface and actual
reply contents remain intact. Only editorial titles, captions and narration are
localized. Uncached narration uses the online speech service via real_demo_voice.
"""
from __future__ import annotations

import argparse
import asyncio
from functools import lru_cache
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

from promo_audio import make_music
from real_demo_copy import COPY, LANGUAGES, WINDOWS
from real_demo_voice import prepare_voice


ROOT = Path(__file__).resolve().parents[1]
W, H, FPS, TOTAL = 1920, 1080, 30, 60
FLAGS = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
BLUE, WHITE, MUTED = '#77baff', '#edf4ff', '#a9b8ca'
ROIS = {'close': [120,160,1632,918], 'wide': [0,140,2304,1296]}
# Source timestamps were checked at 0.2 s intervals. The recorded configuration
# auto-inserts the first suggestion; both recorded sends were done by the user.
# Each hold is documented explicitly instead of implying real generation speed.
SHOTS = [
    {'id':'intro','chapter':0,'source_start':28.0,'source_end':28.04,'duration':3.0,'roi':'close','blur':True},
    {'id':'open','chapter':1,'source_start':7.8,'source_end':11.8,'duration':8.0,'roi':'close'},
    {'id':'options','chapter':2,'source_start':11.8,'source_end':18.0,'duration':8.0,'roi':'close'},
    {'id':'first-filled','chapter':3,'source_start':25.8,'source_end':29.6,'duration':5.8,'roi':'close'},
    {'id':'first-sent','chapter':3,'source_start':29.6,'source_end':31.8,'duration':4.2,'roi':'wide'},
    {'id':'quoted-post','chapter':4,'source_start':48.6,'source_end':56.6,'duration':8.0,'roi':'close'},
    {'id':'second-results','chapter':5,'source_start':60.8,'source_end':63.9,'duration':8.0,'roi':'close'},
    {'id':'second-filled','chapter':6,'source_start':64.0,'source_end':68.8,'duration':4.8,'roi':'close'},
    {'id':'second-sent','chapter':6,'source_start':71.2,'source_end':74.0,'duration':5.2,'roi':'wide'},
    {'id':'outro','chapter':7,'source_start':67.0,'source_end':67.04,'duration':5.0,'roi':'close','blur':True},
]


def run_ffmpeg(arguments):
    result = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-y',*arguments],
                            stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=FLAGS)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8',errors='replace')[-5000:])
    return result.stdout


def json_write(path, value):
    Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


@lru_cache(maxsize=100)
def font(size, language, bold=False):
    files={'zh':('msyh.ttc','msyhbd.ttc'),'en':('segoeui.ttf','segoeuib.ttf'),
           'ja':('YuGothM.ttc','YuGothB.ttc'),'vi':('segoeui.ttf','segoeuib.ttf'),
           'ko':('malgun.ttf','malgunbd.ttf')}
    return ImageFont.truetype(str(Path('C:/Windows/Fonts')/files[language][bool(bold)]),size)


def text(image, xy, value, language, size=24, color=WHITE, bold=False, width=None, center=False):
    draw=ImageDraw.Draw(image)
    while width and size>13 and draw.textlength(value,font=font(size,language,bold))>width:
        size-=1
    face=font(size,language,bold)
    x,y=xy
    if center:
        x-=draw.textlength(value,font=face)/2
    draw.text((x,y),value,font=face,fill=color)


def overlay_image(language, chapter):
    copy=COPY[language]
    image=Image.new('RGBA',(W,H))
    draw=ImageDraw.Draw(image)
    if chapter in (0,7):
        draw.rectangle((0,0,W,H),fill=(0,5,12,120))
        logo=Image.open(ROOT/'icons/icon128.png').convert('RGBA').resize((88,88),Image.Resampling.LANCZOS)
        image.alpha_composite(logo,(916,250))
        if chapter==0:
            for row,value in enumerate(copy['intro_title']):
                text(image,(W/2,400+row*95),value,language,64,bold=True,width=1700,center=True)
            text(image,(W/2,650),copy['header'],language,28,color=BLUE,center=True,width=1700)
        else:
            text(image,(W/2,402),copy['product'],language,55,bold=True,width=1720,center=True)
            text(image,(W/2,510),copy['outro_title'],language,38,width=1720,center=True)
            text(image,(W/2,650),'github.com/onlyonexhj/X-AI-replay',language,24,color=BLUE,center=True)
    draw.rectangle((0,0,W,48),fill='#070c12')
    draw.rectangle((0,990,W,H),fill='#070c12')
    logo=Image.open(ROOT/'icons/icon128.png').convert('RGBA').resize((28,28),Image.Resampling.LANCZOS)
    image.alpha_composite(logo,(30,10))
    text(image,(70,7),copy['product'],language,23,bold=True,width=540)
    text(image,(W/2,9),f'{chapter+1:02d} · '+copy['chapters'][chapter],language,21,color=BLUE,width=620,center=True)
    badge=copy['edited_badge']
    badge_width=ImageDraw.Draw(image).textlength(badge,font=font(16,language))
    text(image,(1888-badge_width,12),badge,language,16,color=MUTED,width=520)
    text(image,(W/2,1001),copy['captions'][chapter],language,28,width=1840,center=True)
    text(image,(32,1058),copy['footer'],language,14,color=MUTED,width=1600)
    text(image,(1730,1058),'1080p / 60s',language,14,color=MUTED)
    return image


def stamp(seconds):
    value=round(seconds*1000)
    return f'{value//3600000:02d}:{value//60000%60:02d}:{value//1000%60:02d},{value%1000:03d}'


def prepare_base(source, work, reuse):
    with source.open('rb') as stream:
        fingerprint=hashlib.file_digest(stream,'sha256').hexdigest()
    identity={'source_sha256':fingerprint,'shots':SHOTS,'rois':ROIS,'resolution':[W,H],'fps':FPS}
    manifest=work/'base-edit.json'
    target=work/'base-cut.mp4'
    if reuse and target.is_file() and manifest.is_file():
        previous=json.loads(manifest.read_text(encoding='utf-8'))
        if previous.get('identity')==identity:
            return target,previous
    pieces=work/'pieces'
    pieces.mkdir(parents=True,exist_ok=True)
    files=[]
    edit=[]
    output_time=0.0
    for shot in SHOTS:
        duration=shot['source_end']-shot['source_start']
        x,y,width,height=ROIS[shot['roi']]
        filters=[f'trim=duration={duration:.6f}','setpts=PTS-STARTPTS',f'crop={width}:{height}:{x}:{y}']
        if shot.get('blur'):
            filters+=['gblur=sigma=14','eq=brightness=-0.1:saturation=0.7']
        filters+=['scale=1674:942:flags=lanczos','setsar=1','pad=1920:1080:123:48:color=0x070c12',
                  'fps=30',f'tpad=stop_mode=clone:stop_duration={shot["duration"]:.6f}']
        piece=pieces/(shot['id']+'.mp4')
        run_ffmpeg(['-ss',str(shot['source_start']),'-i',str(source),'-an','-sn','-vf',','.join(filters),
                    '-frames:v',str(round(shot['duration']*FPS)),'-c:v','libx264','-preset','fast','-crf','18',
                    '-threads','4','-pix_fmt','yuv420p',str(piece)])
        files.append(piece)
        edit.append({**shot,'output_start':round(output_time,3),'output_end':round(output_time+shot['duration'],3),
                     'hold_seconds':round(shot['duration']-duration,3),'crop':ROIS[shot['roi']]})
        output_time+=shot['duration']
        print(f'Real footage cut: {shot["id"]}',flush=True)
    assert round(output_time,3)==TOTAL
    listing=pieces/'concat.txt'
    # This file contains only renderer-created, fixed ASCII filenames.
    listing.write_text(''.join(f"file '{path.name}'\n" for path in files),encoding='utf-8')
    temporary=work/'base-building.mp4'
    run_ffmpeg(['-f','concat','-safe','1','-i',str(listing),'-c:v','copy','-an','-movflags','+faststart',str(temporary)])
    os.replace(temporary,target)
    metadata={'identity':identity,'source_filename':source.name,'source_duration':76.77,
              'interface_language':'zh','edited_waits':True,'real_recording':True,'shots':edit,
              'notes':['First suggestions were automatically inserted in the recording.',
                       'The original user manually sent both replies; successful-send notifications are shown.',
                       'No settings, stop/retry, style switching or language switching is staged.']}
    json_write(manifest,metadata)
    return target,metadata


def extract_frame(path, when):
    data=run_ffmpeg(['-v','error','-ss',str(when),'-i',str(path),'-frames:v','1','-f','image2pipe','-vcodec','png','-'])
    return Image.open(io.BytesIO(data)).convert('RGBA')


def prepare_graphics(language, base, work, output, edit):
    directory=work/language
    directory.mkdir(parents=True,exist_ok=True)
    output.mkdir(parents=True,exist_ok=True)
    overlays=[]
    for chapter in range(8):
        path=directory/f'overlay-{chapter}.png'
        overlay_image(language,chapter).save(path)
        overlays.append(path)
    times=[1.5,7,14,21,27,33,41,47,53,57]
    sheet=Image.new('RGB',(1920,1080),'#070c12')
    for index,when in enumerate(times):
        chapter=next(i for i,(start,end) in enumerate(WINDOWS) if start<=when<end)
        frame=extract_frame(base,when)
        frame.alpha_composite(overlay_image(language,chapter))
        frame.convert('RGB').save(directory/f'review-{index:02d}.png')
        sheet.paste(frame.convert('RGB').resize((480,270),Image.Resampling.LANCZOS),((index%4)*480,(index//4)*270))
    sheet.save(directory/'contact-sheet.jpg',quality=94)
    cover=extract_frame(base,21)
    cover.alpha_composite(overlay_image(language,3))
    cover.convert('RGB').save(output/'cover.png')
    subtitles=[f'{i}\n{stamp(start)} --> {stamp(end)}\n{text}\n'
               for i,((start,end),text) in enumerate(zip(WINDOWS,COPY[language]['captions']),1)]
    (output/'captions.srt').write_text('\n'.join(subtitles),encoding='utf-8-sig')
    json_write(output/'edit.json',{key:value for key,value in edit.items() if key!='identity'} | {'source_sha256':edit['identity']['source_sha256']})
    print(f'{language} real-footage preview: {directory/"contact-sheet.jpg"}',flush=True)
    return overlays


def render(language, base, overlays, voice, output):
    command=['-i',str(base),'-i',str(voice['audio'])]
    for overlay in overlays:
        command+=['-i',str(overlay)]
    filters=[]
    previous='0:v'
    for index,(start,end) in enumerate(WINDOWS):
        name=f'v{index}'
        filters.append(f'[{previous}][{index+2}:v]overlay=0:0:eof_action=repeat:enable=\'gte(t,{start})*lt(t,{end})\'[{name}]')
        previous=name
    filters.append(f'[{previous}]format=yuv420p[video]')
    target=output/'x-ai-reply-real-demo-voiced-1080p.mp4'
    temporary=output/'real-video-building.mp4'
    command+=['-filter_complex',';'.join(filters),'-filter_complex_threads','1','-map','[video]','-map','1:a:0',
              '-c:v','libx264','-preset','fast','-crf','18','-threads','4','-pix_fmt','yuv420p',
              '-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-t','60',
              '-metadata:s:a:0',f'language={dict(zh="zho",en="eng",ja="jpn",vi="vie",ko="kor")[language]}',
              '-movflags','+faststart',str(temporary)]
    run_ffmpeg(command)
    os.replace(temporary,target)
    shutil.copyfile(voice['subtitles'],output/'narration.srt')
    shutil.copyfile(voice['metadata'],output/'narration.json')
    json_write(output/'production.json',{'file':target.name,'language':language,'interface_language':'zh',
               'real_user_recording':True,'localized':['editorial_titles','captions','synthetic_narration'],
               'duration_seconds':60,'resolution':[W,H],'fps':FPS,'original_recording_modified':False})
    print(f'{language} REAL voiced video: {target} ({target.stat().st_size/1024/1024:.2f} MB)',flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    choices=parser.add_mutually_exclusive_group()
    choices.add_argument('--language',choices=LANGUAGES,default='zh')
    choices.add_argument('--all-languages',action='store_true')
    parser.add_argument('--work-dir',type=Path,default=ROOT/'dev/_promo_real')
    parser.add_argument('--out-dir',type=Path,default=ROOT/'store/real-demos')
    parser.add_argument('--reuse-base',action='store_true')
    parser.add_argument('--preview-only',action='store_true')
    args=parser.parse_args()
    args.source=args.source.resolve(strict=True)
    args.work_dir.mkdir(parents=True,exist_ok=True)
    base,edit=prepare_base(args.source,args.work_dir,args.reuse_base)
    music=ROOT/'dev/_promo_demo_i18n/music.wav'
    if not args.preview_only and not music.exists():
        make_music(str(music),TOTAL)
    for language in LANGUAGES if args.all_languages else [args.language]:
        output=args.out_dir/language
        overlays=prepare_graphics(language,base,args.work_dir,output,edit)
        if not args.preview_only:
            voice=asyncio.run(prepare_voice(language,args.work_dir,music))
            render(language,base,overlays,voice,output)


if __name__=='__main__':
    main()
