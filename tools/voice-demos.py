"""Add localized synthetic narration to the existing five 60-second demos.

Install edge-tts==7.3.1 to synthesize uncached narration (requires Internet).
Only the fictional narration text is sent to the speech service. Video, browser
data, API keys, and project files are never sent. Rendering and mixing are local.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

import imageio_ffmpeg

from demo_i18n import LANGUAGES
from demo_narration_data import NARRATION, VOICES
from promo_audio import make_music


ROOT = Path(__file__).resolve().parents[1]
FLAGS = getattr(subprocess, 'CREATE_NO_WINDOW', 0)


def write_json(path, value):
    Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def speech_engine():
    # A project-local dependency directory is also supported for isolated builds.
    local_deps = ROOT / 'dev/_promo_demo_i18n/tts-deps'
    if local_deps.is_dir() and str(local_deps) not in sys.path:
        sys.path.insert(0,str(local_deps))
    try:
        import edge_tts
    except ImportError as error:
        raise RuntimeError('Install the voice dependency: python -m pip install edge-tts==7.3.1') from error
    return edge_tts


async def synthesize(language, work, semaphore, segments=None):
    """Cache narration clips; callers may supply a different localized script."""
    segments = NARRATION[language] if segments is None else segments
    directory = work / language / 'narration-cache'
    directory.mkdir(parents=True,exist_ok=True)
    voice = VOICES[language]
    clips = []
    for index, segment in enumerate(segments):
        identity = {'voice':voice,'text':segment['text'],'rate':'+0%','engine':'edge-tts-7.3.1'}
        key = hashlib.sha256(json.dumps(identity,ensure_ascii=False,sort_keys=True).encode()).hexdigest()[:20]
        path = directory / f'{index:02d}-{key}.mp3'
        info = path.with_suffix('.json')
        if not path.exists() or path.stat().st_size < 1000 or not info.exists():
            edge_tts = speech_engine()
            async with semaphore:
                for attempt in range(3):
                    temporary = path.with_suffix('.part.mp3')
                    try:
                        events = []
                        speech = edge_tts.Communicate(segment['text'],voice,rate='+0%',boundary='WordBoundary',
                                                      connect_timeout=15,receive_timeout=45)
                        with temporary.open('wb') as stream:
                            async for chunk in speech.stream():
                                if chunk['type'] == 'audio':
                                    stream.write(chunk['data'])
                                elif chunk['type'] in ('WordBoundary','SentenceBoundary'):
                                    events.append({key:chunk[key] for key in ('type','offset','duration','text')})
                        assert temporary.stat().st_size > 1000 and events, (language,index,'empty synthesized speech')
                        os.replace(temporary,path)
                        write_json(info,{'identity':identity,'boundaries':events})
                        break
                    except Exception:
                        if attempt == 2:
                            raise
                        await asyncio.sleep(1+attempt)
        clips.append({**segment,'path':str(path)})
        print(f'{language} voice: {index+1} / {len(segments)}',flush=True)
    write_json(work/language/'narration-clips.json',clips)
    return clips


def stamp(seconds):
    value = round(seconds*1000)
    return f'{value//3600000:02d}:{value//60000%60:02d}:{value//1000%60:02d},{value%1000:03d}'


def finish(language, clips, args, music):
    from demo_voice_audio import mix_narration

    directory = args.work_dir / language
    output = args.out_dir / language
    output.mkdir(parents=True,exist_ok=True)
    target = output / 'x-ai-reply-demo-voiced-1080p.mp4'
    original = output / 'x-ai-reply-demo-1080p.mp4'
    silent = directory / 'video-silent.mp4'
    source = silent if silent.exists() else original if original.exists() else target
    if not source.exists():
        raise FileNotFoundError(f'Build the {language} demo first with tools/build-demo.py')
    mixed = directory/'narration-mix.wav'
    report = mix_narration(clips,music,mixed,total=60,report_path=directory/'mix-report.json')
    temporary = output/'voiced-building.mp4'
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    command = [ffmpeg,'-y','-i',str(source),'-i',str(mixed),'-map','0:v:0','-map','1:a:0',
               '-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-t','60',
               '-metadata:s:a:0',f'language={dict(zh="zho",en="eng",ja="jpn",vi="vie",ko="kor")[language]}',
               '-movflags','+faststart',str(temporary)]
    result = subprocess.run(command,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,creationflags=FLAGS)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8',errors='replace')[-3000:])
    os.replace(temporary,target)

    segments = report['segments']
    subtitles = []
    for index,(segment,details) in enumerate(zip(clips,segments),1):
        subtitles.append(f'{index}\n{stamp(details["placed_start"])} --> {stamp(details["placed_end"])}\n{segment["text"]}\n')
    (output/'narration.srt').write_text('\n'.join(subtitles),encoding='utf-8-sig')
    narration = {'language':language,'voice':VOICES[language],'synthetic':True,'duration_seconds':60,
                 'segments':[{**{key:value for key,value in details.items() if key != 'path'},'text':segment['text']}
                             for segment,details in zip(clips,segments)],
                 'mix':{key:value for key,value in report.items() if key not in ('segments','output')}}
    write_json(output/'narration.json',narration)
    production_path = output/'production.json'
    production = json.loads(production_path.read_text(encoding='utf-8')) if production_path.exists() else {}
    production.update({'language':language,'duration_seconds':60,'file':target.name,'audio':'localized synthetic narration with ducked instrumental music',
                       'voice':VOICES[language],'synthetic_voice':True,'narration_subtitles':'narration.srt'})
    write_json(production_path,production)
    print(f'{language} voiced video: {target}',flush=True)


async def run(args):
    selected = LANGUAGES if args.all_languages else [args.language]
    args.work_dir.mkdir(parents=True,exist_ok=True)
    semaphore = asyncio.Semaphore(2)
    clip_sets = await asyncio.gather(*(synthesize(language,args.work_dir,semaphore) for language in selected))
    if args.synthesize_only:
        return
    music = args.work_dir/'music.wav'
    if not music.exists():
        make_music(str(music),60)
    for language,clips in zip(selected,clip_sets):
        finish(language,clips,args,music)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    choices = parser.add_mutually_exclusive_group()
    choices.add_argument('--language',choices=LANGUAGES,default='zh')
    choices.add_argument('--all-languages',action='store_true')
    parser.add_argument('--out-dir',type=Path,default=ROOT/'store/demos')
    parser.add_argument('--work-dir',type=Path,default=ROOT/'dev/_promo_demo_i18n')
    parser.add_argument('--synthesize-only',action='store_true',help='Generate/cache speech clips without changing the videos')
    asyncio.run(run(parser.parse_args()))


if __name__ == '__main__':
    main()
