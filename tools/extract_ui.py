#!/usr/bin/env python3
"""导出原版大厅/仓库/商城 UI：精灵图 + 布局树 + 按钮事件。

输出（client/assets/unity/ui/）：
  level1.json / level3.json   扁平节点树（世界坐标已换算到 800x600 设计空间）
  sprites/s_<pathid>.png      每个 Sprite 裁切后的原图
  index.json                  场景列表

用法：/tmp/upvenv/bin/python tools/extract_ui.py
"""
import os
import json
import UnityPy
from PIL import Image

SRC = "/workspace/.uploads/ad5b29a8-3b85-412f-b6c5-18da03821517_DC穿越火线之运输船.unity3d"
OUT = "/workspace/client/assets/unity/ui"
SPR = os.path.join(OUT, "sprites")

env = UnityPy.load(SRC)
bundle = list(env.files.values())[0]
files = {os.path.basename(k): v for k, v in bundle.files.items() if hasattr(v, "objects")}


def resolve(sf, ptr):
    fid, pid = ptr.get("m_FileID", 0), ptr.get("m_PathID", 0)
    if pid == 0:
        return None
    if fid == 0:
        return sf.objects.get(pid)
    name = os.path.basename(str(sf.externals[fid - 1]).split("(")[-1].rstrip(")>"))
    f = files.get(name)
    return None if f is None else f.objects.get(pid)


def v2(v):
    return (float(v.get("x", 0)), float(v.get("y", 0)))


def color(c):
    if c is None:
        return [1, 1, 1, 1]
    if "r" in c:
        return [round(float(c["r"]), 3), round(float(c["g"]), 3), round(float(c["b"]), 3), round(float(c.get("a", 1)), 3)]
    return [round(float(c["x"]), 3), round(float(c["y"]), 3), round(float(c["z"]), 3), round(float(c.get("w", 0)), 3)]


def calc(tr, parent_rect):
    am, ax = v2(tr["m_AnchorMin"]), v2(tr["m_AnchorMax"])
    ap, sd, pv = v2(tr["m_AnchoredPosition"]), v2(tr["m_SizeDelta"]), v2(tr["m_Pivot"])
    px, py, pw, ph = parent_rect
    arx0, arx1 = px + pw * am[0], px + pw * ax[0]
    ary0, ary1 = py + ph * am[1], py + ph * ax[1]
    w, h = (arx1 - arx0) + sd[0], (ary1 - ary0) + sd[1]
    x = arx0 + ap[0] - w * pv[0]
    y = ary0 + ap[1] - h * pv[1]
    # 缩放
    ls = tr.get("m_LocalScale", {"x": 1, "y": 1})
    sx, sy = float(ls.get("x", 1)), float(ls.get("y", 1))
    if abs(sx - 1) > 1e-6 or abs(sy - 1) > 1e-6:
        cx, cy = x + w * pv[0], y + h * pv[1]
        w, h = w * sx, h * sy
        x, y = cx - w * pv[0], cy - h * pv[1]
    return (x, y, w, h)


TEX_CACHE = {}


def sprite_file(sf, ptr, key):
    r = resolve(sf, ptr)
    if r is None:
        return None
    try:
        sp = r.read()
        rd = sp.m_RD
        tex = rd.texture.read()
        tkey = (rd.texture.m_PathID, tex.m_Name, tex.m_Width, tex.m_Height)
        if tkey not in TEX_CACHE:
            TEX_CACHE[tkey] = tex.image.convert("RGBA")
        atlas = TEX_CACHE[tkey]
        tr = rd.textureRect
        x, y, w, h = int(round(tr.x)), int(round(tr.y)), int(round(tr.width)), int(round(tr.height))
        if w <= 0 or h <= 0:
            return None
        box = (x, atlas.height - y - h, x + w, atlas.height - y)
        im = atlas.crop(box)
        if getattr(rd, "rotated", False):
            im = im.transpose(Image.ROTATE_90)
        name = f"s_{key}.png"
        im.save(os.path.join(SPR, name))
        b = getattr(rd, "border", None)
        border = [int(round(getattr(b, k, 0))) for k in ("x", "y", "z", "w")] if b is not None else [0, 0, 0, 0]
        return {"f": name, "w": im.width, "h": im.height, "border": border}
    except Exception as e:
        print("SPRITE FAIL", getattr(sp, "m_Name", "?"), e)
        return None


def export_scene(scene):
    sf = files[scene]
    gos, trs = {}, {}
    for pid, o in sf.objects.items():
        if o.type.name == "GameObject":
            gos[pid] = o.read_typetree()
        elif o.type.name in ("RectTransform", "Transform"):
            trs[pid] = o.read_typetree()

    comps = {}
    for pid, o in sf.objects.items():
        if o.type.name != "MonoBehaviour":
            continue
        try:
            tt = o.read_typetree()
            r = resolve(sf, tt.get("m_Script", {}))
            if r is None:
                continue
            cn = r.read_typetree().get("m_ClassName")
        except Exception:
            continue
        if not cn:
            continue
        gpid = tt["m_GameObject"]["m_PathID"]
        comps.setdefault(gpid, []).append((cn, tt, r))

    canvas = next(pid for pid, o in sf.objects.items() if o.type.name == "Canvas")
    cgo = sf.objects[canvas].read_typetree()["m_GameObject"]["m_PathID"]
    root_t = next(pid for pid, t in trs.items() if t.get("m_GameObject", {}).get("m_PathID") == cgo)
    root_rect = calc(trs[root_t], (0, 0, 800, 600))

    nodes = []
    order = {}

    def walk(tpid, parent_idx, parent_rect):
        tr = trs[tpid]
        gpid = tr["m_GameObject"]["m_PathID"]
        g = gos.get(gpid, {})
        rect = calc(tr, parent_rect)
        base = calc({**tr, "m_LocalScale": {"x": 1, "y": 1}}, parent_rect)
        sx = abs(rect[2] / base[2]) if base[2] else 1.0
        sy = abs(rect[3] / base[3]) if base[3] else 1.0
        idx = len(nodes)
        order[tpid] = idx
        node = {
            "n": g.get("m_Name", "?"),
            "a": 1 if g.get("m_IsActive", 1) else 0,
            "r": [round(v, 1) for v in rect],
            "p": parent_idx,
            "sc": round(min(sx, sy), 4),
        }
        if tpid == root_t:
            node["r"] = [round(v, 1) for v in root_rect]
        for cn, tt, r in comps.get(gpid, []):
            if cn == "Image" and tt.get("m_Enabled", 1):
                spr = sprite_file(sf, tt.get("m_Sprite", {}), f"{scene}_{tt.get('m_Sprite', {}).get('m_PathID')}")
                if spr:
                    node["img"] = {
                        **spr, "c": color(tt.get("m_Color")),
                        "t": int(tt.get("m_Type", 0)),
                        "pa": 1 if tt.get("m_PreserveAspect") else 0,
                    }
            elif cn == "Text" and tt.get("m_Enabled", 1):
                fd = tt.get("m_FontData", {})
                node["txt"] = {
                    "s": tt.get("m_Text", ""),
                    "sz": float(fd.get("m_FontSize", 14)),
                    "al": int(fd.get("m_Alignment", 4)),
                    "c": color(tt.get("m_Color")),
                    "st": int(fd.get("m_FontStyle", 0)),
                    "wrap": 1 if fd.get("m_BestFit") else 0,
                }
            elif cn == "Outline" and tt.get("m_Enabled", 1):
                node["ol"] = {"c": color(tt.get("m_EffectColor")), "d": [float(tt.get("m_EffectDistance", {}).get("x", 1)), float(tt.get("m_EffectDistance", {}).get("y", -1))]}
            elif cn == "Button":
                calls = []
                for c in tt.get("m_OnClick", {}).get("m_PersistentCalls", {}).get("m_Calls", []):
                    target = c.get("m_Target", {})
                    mname = c.get("m_MethodName", "")
                    tscript = "?"
                    trr = resolve(sf, target)
                    if trr is not None:
                        try:
                            tscript = trr.read_typetree().get("m_ClassName", "?")
                        except Exception:
                            pass
                    calls.append({"t": tscript, "m": mname})
                node["btn"] = {"calls": calls, "act": 1 if tt.get("m_Interactable", 1) else 0}
                tg = resolve(sf, tt.get("m_TargetGraphic", {}))
                if tg is not None and "img" not in node:
                    try:
                        ttt = tg.read_typetree()
                        spr = sprite_file(sf, ttt.get("m_Sprite", {}), f"{scene}_{ttt.get('m_Sprite', {}).get('m_PathID')}")
                        if spr:
                            node["img"] = {**spr, "c": color(ttt.get("m_Color")), "t": int(ttt.get("m_Type", 0)), "pa": 0}
                    except Exception:
                        pass
            elif cn == "Mask":
                node["mask"] = 1
            elif cn == "ScrollRect":
                node["scroll"] = {"h": 1 if tt.get("m_Horizontal") else 0, "v": 1 if tt.get("m_Vertical") else 0}
            elif cn == "InputField":
                node["input"] = {"text": tt.get("m_Text", "")}
            elif cn == "Toggle":
                node["toggle"] = {"on": 1 if tt.get("m_IsOn") else 0}
        nodes.append(node)
        for c in tr.get("m_Children", []):
            cp = c["m_PathID"]
            if cp in trs:
                walk(cp, idx, rect)

    walk(root_t, -1, (0, 0, 800, 600))

    data = {
        "scene": scene,
        "w": 800,
        "h": 600,
        "root": [round(v, 1) for v in root_rect],
        "nodes": nodes,
    }
    path = os.path.join(OUT, f"{scene}.json")
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(data, fp, ensure_ascii=False, separators=(",", ":"))
    used = sum(1 for n in nodes if "img" in n)
    print(f"{scene}: {len(nodes)} nodes, {used} images -> {path}")


def main():
    os.makedirs(SPR, exist_ok=True)
    export_scene("level1")
    export_scene("level3")
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as fp:
        json.dump({"scenes": ["level1", "level3"]}, fp)
    total = sum(os.path.getsize(os.path.join(SPR, n)) for n in os.listdir(SPR))
    print(f"sprites: {len(os.listdir(SPR))} files, {total / 1048576:.1f} MB")


if __name__ == "__main__":
    main()
