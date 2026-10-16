"""
生成扩展图标（纯标准库实现 PNG 编码，不依赖 PIL）。

图案：蓝紫渐变圆角方块 + 白色闪光星标，对齐 X 的深色 UI 风格。
"""
import zlib
import struct
import os
import math

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")

# 品牌渐变色（左上 → 右下）
C1 = (29, 155, 240)    # #1d9bf0
C2 = (120, 86, 255)    # #7856ff


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def rounded_rect_alpha(x, y, w, h, radius):
    """圆角矩形的有符号距离场 -> 内部 alpha 覆盖度（抗锯齿）。"""
    # 以像素中心采样
    cx = min(max(x, radius), w - radius)
    cy = min(max(y, radius), h - radius)
    dx = x - cx
    dy = y - cy
    d = math.hypot(dx, dy) - radius
    # d<0 在内部；用 1px 宽的线性过渡做抗锯齿
    return max(0.0, min(1.0, 0.5 - d))


def star_alpha(x, y, cx, cy, r, points=4, inner=0.32, samples=4):
    """
    闪光星标的 alpha 覆盖度（超采样抗锯齿）。
    points: 角数；inner: 内半径比例（越小星越尖锐）
    """
    hits = 0
    total = samples * samples
    for sy in range(samples):
        for sx in range(samples):
            px = x + (sx + 0.5) / samples
            py = y + (sy + 0.5) / samples
            ang = math.atan2(py - cy, px - cx)
            rad = math.hypot(px - cx, py - cy)
            step = 2 * math.pi / points
            # 归一化到 [0, 2pi)
            a = ang % step
            # 半径在尖角(r)与内角(inner*r)之间按角度线性插值
            t = a / (step / 2)
            # 三角波：尖角在 t=0，内角在 t=1
            wave = abs(1.0 - t)
            edge = inner + (1.0 - inner) * wave
            boundary = r * edge
            if rad <= boundary:
                hits += 1
    return hits / total


def render(size):
    """渲染 size×size 的 RGBA 像素矩阵。"""
    s = float(size)
    radius = s * 0.22
    cx, cy = s * 0.5, s * 0.5
    star_r = s * 0.30
    # 小星星（右上角点缀）
    cx2, cy2 = s * 0.72, s * 0.28
    star_r2 = s * 0.13

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            # 背景：圆角方块 + 对角渐变
            a_bg = rounded_rect_alpha(x + 0.5, y + 0.5, s, s, radius)
            t = (x + y) / (2.0 * (s - 1))
            cr, cg, cb = lerp(C1, C2, t)

            # 前景：白色星标
            a_star = star_alpha(x + 0.5, y + 0.5, cx, cy, star_r)
            a_star2 = star_alpha(x + 0.5, y + 0.5, cx2, cy2, star_r2)

            # 星标合成到背景上（白色 92% 不透明）
            a_fg = min(1.0, a_star + a_star2 * 0.85)
            br = int(round(cr + (255 - cr) * a_fg * 0.92))
            bg = int(round(cg + (255 - cg) * a_fg * 0.92))
            bb = int(round(cb + (255 - cb) * a_fg * 0.92))

            row += bytes((br, bg, bb, int(round(a_bg * 255))))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + r for r in rows)  # filter type 0

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")

    with open(path, "wb") as f:
        f.write(png)
    return len(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (16, 32, 48, 128):
        rows = render(size)
        p = os.path.join(OUT_DIR, "icon%d.png" % size)
        n = write_png(p, size, rows)
        print("  %-14s %4dx%-4d %6d bytes" % ("icon%d.png" % size, size, size, n))
    print("图标已生成 ->", os.path.normpath(OUT_DIR))


if __name__ == "__main__":
    main()
