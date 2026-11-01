#!/usr/bin/env python3
"""生成运输船游戏全部内置资源：武器模型(OBJ)、贴图(PNG)、音效(WAV)、地图(OBJ+JSON)"""
import os
import math
import struct
import wave
import json
import numpy as np
from PIL import Image, ImageDraw

ASSETS = os.path.join(os.path.dirname(__file__), 'client', 'assets')
os.makedirs(ASSETS, exist_ok=True)

# ============ OBJ 模型生成 ============
def write_obj(filename, vertices, faces, uv=None):
    """写入 OBJ 文件"""
    with open(filename, 'w') as f:
        f.write(f"# Generated {filename}\n")
        for v in vertices:
            f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
        if uv:
            for u in uv:
                f.write(f"vt {u[0]:.6f} {u[1]:.6f}\n")
        for face in faces:
            if uv:
                f.write("f " + " ".join(f"{v+1}/{v+1}" for v in face) + "\n")
            else:
                f.write("f " + " ".join(f"{v+1}" for v in face) + "\n")

def box(cx, cy, cz, sx, sy, sz):
    """生成长方体顶点+面（中心 cx,cy,cz，尺寸 sx,sy,sz）"""
    hx, hy, hz = sx/2, sy/2, sz/2
    verts = [
        (cx-hx, cy-hy, cz-hz), (cx+hx, cy-hy, cz-hz),
        (cx+hx, cy+hy, cz-hz), (cx-hx, cy+hy, cz-hz),
        (cx-hx, cy-hy, cz+hz), (cx+hx, cy-hy, cz+hz),
        (cx+hx, cy+hy, cz+hz), (cx-hx, cy+hy, cz+hz),
    ]
    faces = [
        [0,1,2,3], [4,5,6,7], [0,4,7,3],
        [1,5,6,2], [3,2,6,7], [0,1,5,4],
    ]
    return verts, faces

def cylinder(cx, cy, cz, radius, height, segments=12):
    """生成圆柱体"""
    verts = []
    faces = []
    # 底面中心
    verts.append((cx, cy, cz))
    # 顶面中心
    verts.append((cx, cy+height, cz))
    # 侧面顶点
    for i in range(segments):
        a = 2 * math.pi * i / segments
        verts.append((cx + radius*math.cos(a), cy, cz + radius*math.sin(a)))
        verts.append((cx + radius*math.cos(a), cy+height, cz + radius*math.sin(a)))
    # 底面
    base_bottom = 0
    for i in range(segments):
        i0 = 2 + i*2
        i1 = 2 + ((i+1) % segments)*2
        faces.append([base_bottom, i0, i1])
    # 顶面
    base_top = 1
    for i in range(segments):
        i0 = 2 + i*2 + 1
        i1 = 2 + ((i+1) % segments)*2 + 1
        faces.append([base_top, i1, i0])
    # 侧面
    for i in range(segments):
        b0 = 2 + i*2
        b1 = 2 + ((i+1) % segments)*2
        t0 = b0 + 1
        t1 = b1 + 1
        faces.append([b0, b1, t1, t0])
    return verts, faces

def merge_objects(parts):
    """合并多个 (verts, faces) 为一个，偏移顶点索引"""
    all_verts = []
    all_faces = []
    for verts, faces in parts:
        offset = len(all_verts)
        all_verts.extend(verts)
        for face in faces:
            all_faces.append([v + offset for v in face])
    return all_verts, all_faces

# ---- M4A1 步枪 ----
def gen_m4a1():
    parts = []
    # 机匣
    parts.append(box(0, 0.02, 0, 0.08, 0.10, 0.30))
    # 枪管
    parts.append(box(0, 0.02, -0.30, 0.035, 0.035, 0.36))
    # 握把
    parts.append(box(0, -0.12, 0.06, 0.04, 0.16, 0.06))
    # 弹匣
    parts.append(box(0, -0.13, -0.02, 0.05, 0.16, 0.08))
    # 枪托
    parts.append(box(0, 0.01, 0.22, 0.05, 0.08, 0.16))
    # 提把
    parts.append(box(0, 0.10, -0.05, 0.03, 0.05, 0.12))
    # 护木
    parts.append(box(0, 0.01, -0.15, 0.06, 0.06, 0.18))
    verts, faces = merge_objects(parts)
    write_obj(os.path.join(ASSETS, 'm4a1.obj'), verts, faces)

# ---- AWM 狙击枪 ----
def gen_awm():
    parts = []
    # 机匣
    parts.append(box(0, 0.02, 0, 0.07, 0.10, 0.34))
    # 长枪管
    parts.append(box(0, 0.03, -0.50, 0.03, 0.03, 0.70))
    # 握把
    parts.append(box(0, -0.12, 0.08, 0.04, 0.16, 0.06))
    # 枪托
    parts.append(box(0, 0.00, 0.28, 0.06, 0.12, 0.22))
    # 瞄准镜
    parts.append(box(0, 0.12, -0.02, 0.04, 0.06, 0.24))
    parts.append(cylinder(0, 0.12, -0.14, 0.025, 0.04))
    # 弹匣
    parts.append(box(0, -0.10, 0.02, 0.04, 0.10, 0.06))
    verts, faces = merge_objects(parts)
    write_obj(os.path.join(ASSETS, 'awm.obj'), verts, faces)

# ---- 沙漠之鹰手枪 ----
def gen_deagle():
    parts = []
    # 套筒
    parts.append(box(0, 0.03, -0.04, 0.05, 0.07, 0.22))
    # 枪管
    parts.append(box(0, 0.03, -0.18, 0.03, 0.03, 0.10))
    # 握把
    parts.append(box(0, -0.10, 0.06, 0.045, 0.18, 0.07))
    # 扳机护圈
    parts.append(box(0, -0.04, 0.02, 0.05, 0.05, 0.06))
    verts, faces = merge_objects(parts)
    write_obj(os.path.join(ASSETS, 'deagle.obj'), verts, faces)

# ---- 运输船地图 ----
def gen_transport_ship():
    parts = []
    # 主甲板
    parts.append(box(0, -0.2, 0, 20.4, 0.4, 64.4))
    # 船体侧面
    for sx in [-1, 1]:
        parts.append(box(sx*10.2, -1.8, 0, 0.6, 3.2, 64.0))
    # 船首
    parts.append(box(0, -0.2, 32.2, 16.0, 0.4, 2.0))
    # 船尾
    parts.append(box(0, -0.2, -32.2, 16.0, 0.4, 2.0))
    # 上层建筑
    parts.append(box(0, 2.0, -20, 8.0, 3.0, 6.0))
    parts.append(box(0, 4.5, -20, 5.0, 2.0, 4.0))
    verts, faces = merge_objects(parts)
    write_obj(os.path.join(ASSETS, 'polySurface528.obj'), verts, faces)

    # 第二部分 - 甲板细节
    parts2 = []
    for z in [-25, -15, -5, 5, 15, 25]:
        parts2.append(box(-7, 0.5, z, 2.4, 1.0, 2.4))
        parts2.append(box(7, 0.5, z, 2.4, 1.0, 2.4))
    verts2, faces2 = merge_objects(parts2)
    write_obj(os.path.join(ASSETS, 'polySurface588.obj'), verts2, faces2)

    # 第三部分 - 栏杆
    parts3 = []
    for z in range(-30, 31, 3):
        for sx in [-1, 1]:
            parts3.append(box(sx*10.0, 1.0, z, 0.1, 2.0, 0.1))
    verts3, faces3 = merge_objects(parts3)
    write_obj(os.path.join(ASSETS, 'polySurface620.obj'), verts3, faces3)

    # 第四部分 - 吊机
    parts4 = []
    parts4.append(box(-3.2, 3.6, 29.2, 0.5, 7.2, 0.5))
    parts4.append(box(3.2, 3.6, 29.2, 0.5, 7.2, 0.5))
    parts4.append(box(0, 7.0, 29.2, 16.4, 0.5, 0.6))
    verts4, faces4 = merge_objects(parts4)
    write_obj(os.path.join(ASSETS, 'polySurface621.obj'), verts4, faces4)

    # 地图实体变换 JSON
    entities = [
        {"mesh_name": "polySurface528", "position": [0, -2.5, 0], "scale": [1, 1, 1]},
        {"mesh_name": "polySurface588", "position": [0, -2.5, 0], "scale": [1, 1, 1]},
        {"mesh_name": "polySurface620", "position": [0, -2.5, 0], "scale": [1, 1, 1]},
        {"mesh_name": "polySurface621", "position": [0, -2.5, 0], "scale": [1, 1, 1]},
    ]
    with open(os.path.join(ASSETS, 'map_entities.json'), 'w') as f:
        json.dump(entities, f, indent=2)

# ============ PNG 贴图生成 ============
def gen_texture(filename, base_color, pattern='metal', size=256):
    img = Image.new('RGB', (size, size), base_color)
    draw = ImageDraw.Draw(img)
    arr = np.array(img)
    noise = np.random.randint(-20, 20, (size, size, 3), dtype=np.int16)
    arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    if pattern == 'metal':
        for y in range(0, size, 8):
            arr[y:y+2, :, :] = np.clip(arr[y:y+2, :, :].astype(np.int16) - 15, 0, 255)
    elif pattern == 'wood':
        for i in range(15):
            y = np.random.randint(0, size)
            alpha = np.random.randint(30, 80)
            for x in range(size):
                offset = int(math.sin(x * 0.05 + i) * 3)
                yy = y + offset
                if 0 <= yy < size:
                    arr[yy, x, :] = np.clip(arr[yy, x, :].astype(np.int16) - alpha, 0, 255)
    elif pattern == 'gun':
        for y in range(0, size, 4):
            if y % 8 == 0:
                arr[y:y+1, :, :] = np.clip(arr[y:y+1, :, :].astype(np.int16) + 10, 0, 255)
            else:
                arr[y:y+1, :, :] = np.clip(arr[y:y+1, :, :].astype(np.int16) - 8, 0, 255)

    img = Image.fromarray(arr)
    img.save(filename)

def gen_weapon_textures():
    # M4A1 - 黑色金属
    gen_texture(os.path.join(ASSETS, 'm4a1_tex.png'), (40, 42, 46), 'gun')
    # AWM - 深绿/黑
    gen_texture(os.path.join(ASSETS, 'awm_tex.png'), (35, 45, 35), 'gun')
    # 沙鹰 - 银色金属
    gen_texture(os.path.join(ASSETS, 'deagle_tex.png'), (120, 125, 130), 'metal')

def gen_ship_texture():
    size = 1024
    img = Image.new('RGB', (size, size), (90, 85, 75))
    arr = np.array(img)
    noise = np.random.randint(-15, 15, (size, size, 3), dtype=np.int16)
    arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    # 甲板木纹
    for y in range(0, size, 32):
        arr[y:y+1, :, :] = np.clip(arr[y:y+1, :, :].astype(np.int16) - 25, 0, 255)
    for x in range(0, size, 64):
        arr[:, x:x+1, :] = np.clip(arr[:, x:x+1, :].astype(np.int16) - 20, 0, 255)
    # 锈迹
    for _ in range(500):
        cx, cy = np.random.randint(0, size, 2)
        r = np.random.randint(5, 20)
        for dy in range(-r, r+1):
            for dx in range(-r, r+1):
                if dx*dx + dy*dy <= r*r:
                    px, py = cx+dx, cy+dy
                    if 0 <= px < size and 0 <= py < size:
                        arr[py, px, 0] = min(255, arr[py, px, 0] + 40)
                        arr[py, px, 1] = min(255, arr[py, px, 1] + 20)
    img = Image.fromarray(arr)
    img.save(os.path.join(ASSETS, 'yunshuchuan.png'))

# ============ WAV 音效生成 ============
def write_wav(filename, samples, sample_rate=44100):
    samples = np.clip(samples, -1.0, 1.0)
    pcm = (samples * 32767).astype(np.int16)
    with wave.open(filename, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())

def gen_shot_rifle():
    sr = 44100
    dur = 0.15
    t = np.linspace(0, dur, int(sr * dur))
    # 噪声爆裂
    noise = np.random.randn(len(t)) * np.exp(-t * 25)
    # 低频轰鸣
    boom = np.sin(2 * np.pi * 80 * t) * np.exp(-t * 15) * 0.5
    # 高频嘶嘶
    hiss = np.random.randn(len(t)) * np.exp(-t * 60) * 0.3
    sig = noise * 0.6 + boom + hiss * 0.3
    write_wav(os.path.join(ASSETS, 'shot_rifle.wav'), sig, sr)

def gen_shot_sniper():
    sr = 44100
    dur = 0.4
    t = np.linspace(0, dur, int(sr * dur))
    noise = np.random.randn(len(t)) * np.exp(-t * 12)
    boom = np.sin(2 * np.pi * 55 * t) * np.exp(-t * 8) * 0.7
    crack = np.random.randn(len(t)) * np.exp(-t * 80) * 0.4
    sig = noise * 0.5 + boom + crack * 0.2
    write_wav(os.path.join(ASSETS, 'shot_sniper.wav'), sig, sr)

def gen_shot_pistol():
    sr = 44100
    dur = 0.12
    t = np.linspace(0, dur, int(sr * dur))
    noise = np.random.randn(len(t)) * np.exp(-t * 30)
    boom = np.sin(2 * np.pi * 120 * t) * np.exp(-t * 20) * 0.5
    sig = noise * 0.5 + boom
    write_wav(os.path.join(ASSETS, 'shot_pistol.wav'), sig, sr)

# ============ 主函数 ============
if __name__ == '__main__':
    print("生成武器模型...")
    gen_m4a1()
    gen_awm()
    gen_deagle()
    print("  m4a1.obj, awm.obj, deagle.obj ✓")

    print("生成运输船地图...")
    gen_transport_ship()
    print("  polySurface*.obj + map_entities.json ✓")

    print("生成武器贴图...")
    gen_weapon_textures()
    print("  m4a1_tex.png, awm_tex.png, deagle_tex.png ✓")

    print("生成运输船贴图...")
    gen_ship_texture()
    print("  yunshuchuan.png ✓")

    print("生成武器音效...")
    gen_shot_rifle()
    gen_shot_sniper()
    gen_shot_pistol()
    print("  shot_rifle.wav, shot_sniper.wav, shot_pistol.wav ✓")

    print("\n全部资源生成完成 →", ASSETS)
