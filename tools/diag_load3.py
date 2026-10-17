"""抓取 --load-extension 真实报错：stderr 落盘 + 读关键行。"""
import os
import re
import shutil
import subprocess
import sys
import time

ROOT = r"C:\Users\onlyo\WorkBuddy\X-AI-replay"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
EXT = os.path.join(ROOT, ".rec-ext")
PROF = os.path.join(ROOT, ".rec-profile-dbg")
LOG = os.path.join(PROF, "chrome.err.txt")

if os.path.isdir(PROF):
    shutil.rmtree(PROF)
os.makedirs(PROF, exist_ok=True)

env = dict(os.environ)
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    env.pop(k, None)
env["NO_PROXY"] = "127.0.0.1,localhost"

use_flags = (len(sys.argv) > 1 and sys.argv[1] == "flags")
args = [CHROME, f"--user-data-dir={PROF}", f"--load-extension={EXT}",
        "--enable-logging=stderr", "--v=1",
        "--no-first-run", "--new-window", "about:blank"]
if use_flags:
    args += ["--disable-extension-content-verification",
             "--disable-features=ExtensionContentVerification"]

with open(LOG, "w", encoding="utf-8") as lf:
    p = subprocess.Popen(args, env=env, stderr=lf, stdout=subprocess.DEVNULL)
time.sleep(8)

print("=== Extensions installed ===")
ed = os.path.join(PROF, "Default", "Extensions")
if os.path.isdir(ed):
    for n in os.listdir(ed):
        print(" ", n)

print("=== extension-related log lines ===")
try:
    lines = open(LOG, encoding="utf-8", errors="ignore").read().splitlines()
except Exception:
    lines = []
seen = set()
for l in lines:
    low = l.lower()
    if any(k in low for k in ("extension", "verify", "failed", "could not",
                              "manifest", "load-extension", "error", "refused", "blocked")):
        key = l[-160:]
        if key not in seen:
            seen.add(key)
            print(" ", key)
p.terminate()
