"""从主 Chrome 解密 x.com / twitter.com 的 cookie，存为 JSON 供注入录制浏览器。

解密链路（同 Windows 用户下有效）：
  Local State -> os_crypt.encrypted_key (base64) -> 去 "DPAPI" 前缀
    -> CryptUnprotectData (DPAPI) -> 32 字节 AES 密钥
  每条 cookie.encrypted_value:
    v10 -> 去 3 字节前缀 -> AES-GCM(nonce=前12字节, tag=后16字节)
    v11 -> App-Bound Encryption，标准 DPAPI 解不开（脚本会报并跳过）
"""
import base64
import json
import os
import shutil
import sqlite3

from win32crypt import CryptUnprotectData
from Crypto.Cipher import AES

MAIN = r"C:\Users\onlyo\AppData\Local\Google\Chrome\User Data"
DEFAULT = os.path.join(MAIN, "Default")
LOCAL_STATE = os.path.join(MAIN, "Local State")
COOKIES_DB = os.path.join(DEFAULT, "Network", "Cookies")
OUT = r"C:\Users\onlyo\WorkBuddy\X-AI-replay\dev\_video\x_cookies.json"
TMP = r"C:\Users\onlyo\WorkBuddy\X-AI-replay\dev\_video\cookies_copy.db"


def get_key():
    with open(LOCAL_STATE, "r", encoding="utf-8") as f:
        ls = json.load(f)
    raw = base64.b64decode(ls["os_crypt"]["encrypted_key"])
    assert raw[:5] == b"DPAPI", "unexpected key prefix"
    return CryptUnprotectData(raw[5:], None, None, None, 0)[1]


def decrypt(key, val):
    if val[:3] == b"v10":
        iv = val[3:15]
        ct = val[15:]
        return AES.new(key, AES.MODE_GCM, nonce=iv).decrypt(ct[:-16]).decode("utf-8", "replace")
    if val[:3] == b"v11":
        return None  # ABE
    try:
        return val.decode("utf-8", "replace")
    except Exception:
        return None


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # 主 Chrome 在跑，SQLite 文件被占用；先复制一份再读，失败则走只读 URI
    db_to_read = COOKIES_DB
    try:
        shutil.copy2(COOKIES_DB, TMP)
        db_to_read = TMP
        print("copied live Cookies DB to temp")
    except Exception as e:
        print("copy failed:", e, "-> 尝试只读 URI")
        db_to_read = f"file:{COOKIES_DB}?mode=ro"
    key = get_key()
    conn = sqlite3.connect(db_to_read)
    cols = [d[1] for d in conn.execute("PRAGMA table_info(cookies)")]
    has_partition = "partition_key" in cols
    q = ("SELECT host_key, name, encrypted_value, path, expires_utc, is_secure, "
         "is_httponly, has_expire, samesite" + (", partition_key" if has_partition else "")
         + " FROM cookies WHERE host_key LIKE '%x.com%' OR host_key LIKE '%twitter.com%'")
    rows = conn.execute(q).fetchall()
    cookies = []
    abe = 0
    for r in rows:
        host, name, ev, path, exp, sec, httponly, has_expire, samesite = r[:9]
        pkey = r[9] if has_partition else ""
        val = decrypt(key, ev)
        if val is None:
            abe += 1
            continue
        c = {
            "name": name, "value": val, "domain": host, "path": path or "/",
            "secure": bool(sec), "httpOnly": bool(httponly),
            "sameSite": "None" if samesite == 0 else ("Lax" if samesite == 1 else "Strict"),
        }
        if has_expire and exp:
            # Chrome expires_utc 是 microseconds since 1601; 转 Unix 秒
            c["expires"] = exp / 1_000_000 - 11_644_473_600
        if pkey:
            c["partitionKey"] = {"sourceOrigin": pkey}
        cookies.append(c)
    conn.close()
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(cookies, f, ensure_ascii=False, indent=1)
    print(f"extracted: {len(cookies)} cookies, ABE-skipped: {abe}")
    names = sorted({c['name'] for c in cookies})
    print("names:", names)
    print("saved:", OUT)


if __name__ == "__main__":
    main()
