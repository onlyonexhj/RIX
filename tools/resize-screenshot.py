"""
把指定图片转成 Chrome Web Store 要求的 1280x800 截图。

策略：原图若不是 16:10，按 16:10 裁剪（优先裁掉浏览器边框/任务栏等无效区域），
再用 LANCZOS 高质量缩放到精确 1280x800 —— 不拉伸、不变形。

安全：只写新文件，绝不覆盖原图。
"""
import sys
import os
from PIL import Image

SRC = r"C:/Users/onlyo/Desktop/LJ/cjjj.png"
TARGET_W, TARGET_H = 1280, 800
TARGET_AR = TARGET_W / TARGET_H  # 1.6

OUT_LOCAL = r"C:/Users/onlyo/Desktop/LJ/cjjj-1280x800.png"
OUT_STORE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "store", "screenshot-3-1280x800.png",
)


def main():
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    print("原图: %dx%d  宽高比 %.4f" % (w, h, w / h))

    if abs(w / h - TARGET_AR) < 0.001:
        box = (0, 0, w, h)
        print("原图已是 16:10，无需裁剪")
    else:
        # 目标是 1.6。原图 1.49 更"方"，需要**减少高度**
        new_h = int(round(w / TARGET_AR))
        cut = h - new_h
        if cut <= 0:
            # 原图过宽：改为裁宽度
            new_w = int(round(h * TARGET_AR))
            cutx = w - new_w
            left = cutx // 2
            box = (left, 0, left + new_w, h)
            print("裁剪宽度 %dpx -> %dx%d" % (cutx, new_w, h))
        else:
            # 上下分配：顶部少裁（保留 AI 面板，它贴着上边缘），底部多裁（任务栏）
            top = min(20, cut)
            bottom = cut - top
            box = (0, top, w, top + new_h)
            print("裁剪高度 %dpx（上 %d / 下 %d）-> %dx%d" % (cut, top, bottom, w, new_h))

    cropped = im.crop(box)
    print("裁剪后: %dx%d  宽高比 %.4f" % (cropped.size[0], cropped.size[1],
                                        cropped.size[0] / cropped.size[1]))

    resized = cropped.resize((TARGET_W, TARGET_H), Image.LANCZOS)
    print("缩放后: %dx%d" % resized.size)

    # 保存（新文件，不覆盖原图）
    resized.save(OUT_LOCAL, "PNG", optimize=True)
    print("\n已保存 -> %s (%.1f KB)" % (OUT_LOCAL, os.path.getsize(OUT_LOCAL) / 1024))

    os.makedirs(os.path.dirname(OUT_STORE), exist_ok=True)
    resized.save(OUT_STORE, "PNG", optimize=True)
    print("已保存 -> %s (%.1f KB)" % (OUT_STORE, os.path.getsize(OUT_STORE) / 1024))

    # 校验
    chk = Image.open(OUT_LOCAL)
    ok = chk.size == (TARGET_W, TARGET_H)
    print("\n尺寸校验: %dx%d %s" % (chk.size[0], chk.size[1], "✓ 符合要求" if ok else "✗ 不符合"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
