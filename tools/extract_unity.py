#!/usr/bin/env python3
"""从原版 DC穿越火线之运输船.unity3d 提取真实资源。

输出（client/assets/unity/map/）：
  map.json          场景渲染条目（世界坐标烘焙的 OBJ 分片 + 材质 + 变换 + 灯光）
  colliders.json    原始碰撞体（Box/Sphere/Mesh）世界坐标
  *.obj             每个 MeshRenderer 的每个子网格（世界坐标，已转 Three.js 手系）
  *.png             材质贴图

用法：/tmp/upvenv/bin/python tools/extract_unity.py
"""
import os
import json
import math
import shutil

import numpy as np
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler

SRC = "/workspace/.uploads/ad5b29a8-3b85-412f-b6c5-18da03821517_DC穿越火线之运输船.unity3d"
OUT = "/workspace/client/assets/unity/map"
SCENE = "level4"


def qmat(q):
    x, y, z, w = q
    n = x * x + y * y + z * z + w * w
    if n < 1e-12:
        return np.eye(3)
    s = 2.0 / n
    return np.array([
        [1 - s * (y * y + z * z), s * (x * y - z * w), s * (x * z + y * w)],
        [s * (x * y + z * w), 1 - s * (x * x + z * z), s * (y * z - x * w)],
        [s * (x * z - y * w), s * (y * z + x * w), 1 - s * (x * x + y * y)],
    ])


def local_mat(t):
    r, p, s = t["m_LocalRotation"], t["m_LocalPosition"], t["m_LocalScale"]
    M = np.eye(4)
    M[:3, :3] = qmat((r["x"], r["y"], r["z"], r["w"])) @ np.diag([s["x"], s["y"], s["z"]])
    M[:3, 3] = [p["x"], p["y"], p["z"]]
    return M


def pref(ptr):
    if isinstance(ptr, dict):
        return ptr.get("m_FileID", 0), ptr.get("m_PathID", 0)
    return getattr(ptr, "m_FileID", 0), getattr(ptr, "m_PathID", 0)


def vec3(v):
    return [float(v["x"]), float(v["y"]), float(v["z"])]


def vec4(v):
    if "r" in v:
        return [float(v["r"]), float(v["g"]), float(v["b"]), float(v.get("a", 1.0))]
    return [float(v["x"]), float(v["y"]), float(v["z"]), float(v.get("w", 0.0))]


# ---------- 顶点色/UV/法线 ----------
def build_builtin(path_id):
    """Unity 内置图元（library/unity default resources 不在包内）。"""
    if path_id == 10202:  # Cube 1m
        verts, uvs, norms, idx = [], [], [], []
        faces = [
            ((0, 0, 1), [(0.5, -0.5, 0.5), (0.5, 0.5, 0.5), (-0.5, 0.5, 0.5), (-0.5, -0.5, 0.5)]),
            ((0, 0, -1), [(-0.5, -0.5, -0.5), (-0.5, 0.5, -0.5), (0.5, 0.5, -0.5), (0.5, -0.5, -0.5)]),
            ((1, 0, 0), [(0.5, -0.5, -0.5), (0.5, 0.5, -0.5), (0.5, 0.5, 0.5), (0.5, -0.5, 0.5)]),
            ((-1, 0, 0), [(-0.5, -0.5, 0.5), (-0.5, 0.5, 0.5), (-0.5, 0.5, -0.5), (-0.5, -0.5, -0.5)]),
            ((0, 1, 0), [(-0.5, 0.5, 0.5), (0.5, 0.5, 0.5), (0.5, 0.5, -0.5), (-0.5, 0.5, -0.5)]),
            ((0, -1, 0), [(-0.5, -0.5, -0.5), (0.5, -0.5, -0.5), (0.5, -0.5, 0.5), (-0.5, -0.5, 0.5)]),
        ]
        uv = [(0, 0), (0, 1), (1, 1), (1, 0)]
        for n, quad in faces:
            b = len(verts)
            for i, p in enumerate(quad):
                verts.append(p)
                norms.append(n)
                uvs.append(uv[i])
            idx += [b, b + 1, b + 2, b, b + 2, b + 3]
        return np.array(verts, np.float64), np.array(uvs, np.float64), np.array(norms, np.float64), np.array(idx, np.int64), 1
    if path_id == 10210:  # Quad 1m，面朝 +Z
        verts = np.array([(-0.5, -0.5, 0), (0.5, -0.5, 0), (0.5, 0.5, 0), (-0.5, 0.5, 0)], np.float64)
        uvs = np.array([(0, 0), (1, 0), (1, 1), (0, 1)], np.float64)
        norms = np.tile([0.0, 0.0, 1.0], (4, 1))
        idx = np.array([0, 1, 2, 0, 2, 3], np.int64)
        return verts, uvs, norms, idx, 1
    if path_id == 10209:  # Plane 10m
        verts = np.array([(-5, 0, -5), (5, 0, -5), (5, 0, 5), (-5, 0, 5)], np.float64)
        uvs = np.array([(0, 0), (1, 0), (1, 1), (0, 1)], np.float64)
        norms = np.tile([0.0, 1.0, 0.0], (4, 1))
        idx = np.array([0, 1, 2, 0, 2, 3], np.int64)
        return verts, uvs, norms, idx, 1
    return None


def main():
    os.makedirs(OUT, exist_ok=True)
    env = UnityPy.load(SRC)
    bundle = list(env.files.values())[0]
    files = {os.path.basename(k): v for k, v in bundle.files.items() if hasattr(v, "objects")}
    sf = files[SCENE]
    objs = sf.objects

    def resolve(ptr, owner=None):
        owner = owner or sf
        fid, pid = pref(ptr)
        if pid == 0:
            return None
        if fid == 0:
            return owner.objects.get(pid)
        name = os.path.basename(str(owner.externals[fid - 1]).split("(")[-1].rstrip(")>"))
        f = files.get(name)
        return None if f is None else f.objects.get(pid)

    # 层级与变换
    tr = {}
    for pid, o in objs.items():
        if o.type.name in ("Transform", "RectTransform"):
            tr[pid] = o.read_typetree()
    parent = {}
    for pid, t in tr.items():
        for c in t.get("m_Children", []):
            parent[c["m_PathID"] if isinstance(c, dict) else c] = pid
    cache = {}

    def world(pid):
        if pid in cache:
            return cache[pid]
        M = local_mat(tr[pid])
        p = parent.get(pid)
        if p in tr:
            M = world(p) @ M
        cache[pid] = M
        return M

    def transform_of(gpid):
        for pid, t in tr.items():
            if t["m_GameObject"]["m_PathID"] == gpid:
                return pid
        return None

    def go_of(pid):
        return objs[pid].read_typetree()

    geo_cache = {}
    mesh_info = {}

    def mesh_geo(ptr):
        key = pref(ptr)
        if key in geo_cache:
            return geo_cache[key]
        r = resolve(ptr)
        if r is None:
            b = build_builtin(key[1])
            if b is None:
                geo_cache[key] = None
                return None
            v, uv, nrm, idx, nsub = b
            geo_cache[key] = ({"v": v, "uv": uv, "n": nrm, "idx": idx,
                               "subs": [{"first": 0, "count": len(idx), "firstV": 0, "countV": len(v)}],
                               "name": "builtin%d" % key[1]}, None)
            return geo_cache[key]
        mesh = r.read()
        h = MeshHandler(mesh)
        h.process()
        v = np.array(h.m_Vertices, np.float64).reshape(-1, 3)
        uv = np.zeros((len(v), 2)) if h.m_UV0 is None else np.array(h.m_UV0, np.float64).reshape(-1, 2)
        nr = np.zeros((len(v), 3)) if h.m_Normals is None else np.array(h.m_Normals, np.float64).reshape(-1, 3)
        idx = np.array(h.m_IndexBuffer, np.int64).reshape(-1)
        subs = []
        isz = 4 if len(v) > 65535 else 2
        for s in mesh.m_SubMeshes:
            subs.append({"first": int(s.firstByte) // isz, "count": int(s.indexCount),
                         "firstV": int(s.firstVertex), "countV": int(s.vertexCount),
                         "topology": int(s.topology or 0)})
        info = {"v": v, "uv": uv, "n": nr, "idx": idx, "subs": subs, "name": mesh.m_Name}
        geo_cache[key] = (info, mesh)
        return geo_cache[key]

    # 材质
    mat_cache = {}

    def material_info(ptr, owner=None):
        key = pref(ptr)
        if key in mat_cache:
            return mat_cache[key]
        owner = owner or sf
        r = resolve(ptr, owner)
        if r is None:
            mat_cache[key] = {"name": "builtin-default", "tex": None, "color": [1, 1, 1, 1],
                              "metallic": 0.0, "glossiness": 0.5, "transparent": False, "renderQueue": -1,
                              "_owner": owner}
            return mat_cache[key]
        tt = r.read_typetree()
        owner = getattr(r, "assets_file", None) or owner
        tex_envs = tt["m_SavedProperties"].get("m_TexEnvs", [])
        tex, scale, offset = None, [1, 1], [0, 0]
        for name_entry, val in tex_envs:
            if name_entry["name"] == "_MainTex":
                tp = val["m_Texture"]
                if tp["m_PathID"]:
                    tex = {"fid": tp["m_FileID"], "pid": tp["m_PathID"]}
                    scale = [val["m_Scale"]["x"], val["m_Scale"]["y"]]
                    offset = [val["m_Offset"]["x"], val["m_Offset"]["y"]]
        colors = {n["name"]: vec4(c) for n, c in tt["m_SavedProperties"].get("m_Colors", [])}
        floats = {n["name"]: float(v) for n, v in tt["m_SavedProperties"].get("m_Floats", [])}
        info = {
            "name": tt["m_Name"],
            "tex": tex,
            "color": colors.get("_Color", [1, 1, 1, 1]),
            "metallic": floats.get("_Metallic", 0.0),
            "glossiness": floats.get("_Glossiness", 0.5),
            "transparent": tt.get("m_CustomRenderQueue", -1) != -1 or floats.get("_Mode", 0) >= 2,
            "renderQueue": tt.get("m_CustomRenderQueue", -1),
            "tiling": scale,
            "offset": offset,
            "_owner": owner,
        }
        mat_cache[key] = info
        return info

    # 导出贴图
    tex_files = {}

    def export_texture(tex, owner=None):
        key = (tex["fid"], tex["pid"], id(owner))
        if key in tex_files:
            return tex_files[key]
        r = resolve({"m_FileID": tex["fid"], "m_PathID": tex["pid"]}, owner)
        if r is None:
            tex_files[key] = None
            return None
        t = r.read()
        safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in t.m_Name) or ("tex_%d" % key[1])
        fname = safe + ".png"
        try:
            img = t.image
            img.save(os.path.join(OUT, fname))
            print("TEX", t.m_Name, t.m_Width, "x", t.m_Height, "->", fname)
            tex_files[key] = fname
        except Exception as e:
            print("TEX FAIL", t.m_Name, e)
            tex_files[key] = None
        return tex_files[key]

    # 逐 MeshRenderer 烘焙到世界坐标
    renderers = []
    for pid, o in objs.items():
        if o.type.name != "MeshRenderer":
            continue
        mr_tt = o.read_typetree()
        gpid = mr_tt["m_GameObject"]["m_PathID"]
        go = go_of(gpid)
        if not mr_tt.get("m_Enabled", True) or not go.get("m_IsActive", True):
            continue
        tpid = transform_of(gpid)
        if tpid is None:
            continue
        M = world(tpid)
        mats = mr_tt.get("m_Materials", [])
        mesh = None
        mesh_ptr = None
        for c in go["m_Component"]:
            cp = c[1]["m_PathID"] if not isinstance(c, dict) else c.get("second", c).get("m_PathID")
            if objs[cp].type.name == "MeshFilter":
                mf = objs[cp].read()
                mesh_ptr = mf.m_Mesh
                g = mesh_geo(mesh_ptr)
                if g:
                    mesh = g[0]
                break
        if mesh is None:
            continue

        det = float(np.linalg.det(M[:3, :3]))
        A = M[:3, :3]
        t = M[:3, 3]
        parts = []
        for si, sub in enumerate(mesh["subs"]):
            mi = si if si < len(mats) else len(mats) - 1
            if mi < 0:
                break
            minfo = material_info(mats[mi])
            texname = export_texture(minfo["tex"], minfo["_owner"]) if minfo["tex"] else None
            first, count = sub["first"], sub["count"]
            tri = mesh["idx"][first:first + count]
            if len(tri) == 0:
                continue
            v = mesh["v"]
            uv = mesh["uv"]
            nr = mesh["n"]
            wv = (A @ v.T).T + t
            wn = (np.linalg.inv(A).T @ nr.T).T if det != 0 else nr
            nrm_len = np.linalg.norm(wn, axis=1, keepdims=True)
            nrm_len[nrm_len == 0] = 1
            wn = wn / nrm_len
            # Unity(左手, Y上) -> Three(右手): z 取反
            wv[:, 2] *= -1
            wn[:, 2] *= -1
            if det < 0:
                tri = tri.reshape(-1, 3)[:, ::-1].reshape(-1)
            fname = "%s_%03d_%d.obj" % (mesh["name"], gpid, si)
            fname = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in fname)
            write_obj(os.path.join(OUT, fname), wv, uv, wn, tri)
            parts.append({
                "obj": fname,
                "material": {
                    "name": minfo["name"],
                    "color": minfo["color"],
                    "metallic": minfo["metallic"],
                    "glossiness": minfo["glossiness"],
                    "transparent": minfo["transparent"],
                    "tiling": minfo["tiling"],
                    "offset": minfo["offset"],
                },
                "texture": texname,
                "verts": int(len(wv)),
                "tris": int(len(tri) // 3),
            })
        if not parts:
            continue
        renderers.append({
            "name": go["m_Name"],
            "gameObject": gpid,
            "mesh": mesh["name"],
            "det": det,
            "aabb": [wv.min(0).tolist(), wv.max(0).tolist()],
            "parts": parts,
            "castShadows": mr_tt.get("m_CastShadows", 1) != 0,
            "receiveShadows": bool(mr_tt.get("m_ReceiveShadows", True)),
        })

    # 碰撞体
    colliders = []
    for pid, o in objs.items():
        if o.type.name not in ("BoxCollider", "SphereCollider", "MeshCollider"):
            continue
        tt = o.read_typetree()
        gpid = tt["m_GameObject"]["m_PathID"]
        go = go_of(gpid)
        if not tt.get("m_Enabled", True) or not go.get("m_IsActive", True):
            continue
        tpid = transform_of(gpid)
        if tpid is None:
            continue
        M = world(tpid)
        kind = o.type.name
        entry = {"type": kind, "name": go["m_Name"],
                 "trigger": bool(tt.get("m_IsTrigger", False)),
                 "position": M[:3, 3].tolist()}
        entry["position"][2] *= -1
        if kind == "BoxCollider":
            c = tt["m_Center"]
            s = tt["m_Size"]
            # 世界尺寸（假设轴对齐缩放；旋转则保留四元数）
            sc = np.linalg.norm(M[:3, :3], axis=0)
            entry["size"] = [abs(float(sc[0] * s["x"])), abs(float(sc[1] * s["y"])), abs(float(sc[2] * s["z"]))]
            entry["center"] = [(M[:3, :3] @ np.array([c["x"], c["y"], c["z"]]))[i] for i in range(3)]
            entry["center"][2] *= -1
        elif kind == "SphereCollider":
            sc = np.linalg.norm(M[:3, :3], axis=0)
            entry["radius"] = float(abs(sc[0] * tt.get("m_Radius", 0.5)))
            c = tt.get("m_Center", {"x": 0, "y": 0, "z": 0})
            entry["center"] = [(M[:3, :3] @ np.array([c["x"], c["y"], c["z"]]))[i] for i in range(3)]
            entry["center"][2] *= -1
        else:
            entry["mesh"] = None
        colliders.append(entry)

    # 灯光 / 渲染设置
    lights = []
    for pid, o in objs.items():
        if o.type.name != "Light":
            continue
        tt = o.read_typetree()
        gpid = tt["m_GameObject"]["m_PathID"]
        # 灯光方向：Unity forward 为 +Z
        tpid = transform_of(gpid)
        M = world(tpid) if tpid else np.eye(4)
        fwd = M[:3, :3] @ np.array([0.0, 0.0, 1.0])
        fwd[2] *= -1
        lights.append({"type": tt.get("m_Type", 1), "color": vec4(tt.get("m_Color", {"r": 1, "g": 1, "b": 1, "a": 1}))[:3],
                       "intensity": float(tt.get("m_Intensity", 1.0)), "direction": fwd.tolist(),
                       "range": float(tt.get("m_Range", 10))})

    render_settings = {}
    for pid, o in objs.items():
        if o.type.name == "RenderSettings":
            tt = o.read_typetree()
            amb = tt.get("m_AmbientSkyColor", None)
            render_settings = {
                "fog": bool(tt.get("m_Fog", False)),
                "fogColor": vec4(tt["m_FogColor"])[:3] if tt.get("m_FogColor") else None,
                "fogMode": tt.get("m_FogMode", 1),
                "fogDensity": tt.get("m_FogDensity", 0.01),
                "fogStart": tt.get("m_LinearFogStart", 0),
                "fogEnd": tt.get("m_LinearFogEnd", 100),
                "ambientMode": tt.get("m_AmbientMode", 0),
                "ambientSky": vec4(amb)[:3] if amb else None,
                "ambientEquator": vec4(tt["m_AmbientEquatorColor"])[:3] if tt.get("m_AmbientEquatorColor") else None,
                "ambientGround": vec4(tt["m_AmbientGroundColor"])[:3] if tt.get("m_AmbientGroundColor") else None,
                "skybox": tt.get("m_SkyboxMaterial", {}).get("m_PathID", 0) if isinstance(tt.get("m_SkyboxMaterial"), dict) else 0,
            }

    with open(os.path.join(OUT, "map.json"), "w", encoding="utf-8") as f:
        json.dump({"scene": SCENE, "renderers": renderers, "colliders": colliders,
                   "lights": lights, "renderSettings": render_settings}, f, ensure_ascii=False)
    print("RENDERERS", len(renderers), "COLLIDERS", len(colliders), "->", OUT)


def write_obj(path, v, uv, n, tri):
    lines = []
    for p in v:
        lines.append("v %.6f %.6f %.6f" % (p[0], p[1], p[2]))
    for p in uv:
        lines.append("vt %.6f %.6f" % (p[0], p[1]))
    for p in n:
        lines.append("vn %.6f %.6f %.6f" % (p[0], p[1], p[2]))
    for i in range(0, len(tri), 3):
        a, b, c = tri[i], tri[i + 1], tri[i + 2]
        lines.append("f %d/%d/%d %d/%d/%d %d/%d/%d" % (
            a + 1, a + 1, a + 1, b + 1, b + 1, b + 1, c + 1, c + 1, c + 1))
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
