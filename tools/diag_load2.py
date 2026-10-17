"""直接子进程拉起 Chrome，verbose 日志，定位 load-extension 失败原因。"""
import os
import shutil
import subprocess
import time

ROOT = r"C:\Users\onlyo\WorkBuddy\X-AI-replay"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
EXT = os.path.join(ROOT, ".rec-ext")
PROF = os.path.join(ROOT, ".rec-profile-test3")
LOG = os.path.join(PROF, "chrome.err.txt")

if os.path.isdir(PROF):
    shutil.rmtree(PROF)

env = dict(os.environ)
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    env.pop(k, None)
env["NO_PROXY"] = "127.0.0.1,localhost"

args = [
    CHROME, f"--user-data-dir={PROF}",
    f"--load-extension={EXT}",
    "--disable-extension-content-verification",
    "--disable-features=ExtensionContentVerification",
    "--enable-logging=stderr", "--v=1",
    "--no-first-run", "--new-window", "about:blank",
]
p = subprocess.Popen(args, env=env, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
time.sleep(7)

ext_dir = os.path.join(PROF, "Default", "Extensions")
print("Extensions dir exists:", os.path.isdir(ext_dir))
if os.path.isdir(ext_dir):
    print("contents:", os.listdir(ext_dir))

# 抓日志里的扩展相关行
if os.path.exists(LOG):
    lines = open(LOG, encoding="utf-8", errors="ignore").read().splitlines()
    hits = [l for l in lines if any(k in l for k in
            ("extension", "Extension", "verify", "Verify", "load-extension",
             "Could not", "Failed", "manifest", "Manifest", "fatal", "ERROR"))]
    print("--- relevant log lines ---")
    for l in hits[:30]:
        print(l[-200:])
else:
    print("no log file")

p.terminate()
