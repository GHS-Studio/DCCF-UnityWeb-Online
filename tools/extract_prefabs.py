#!/usr/bin/env python3
"""导出原版角色（骨骼+蒙皮）与第一人称武器（含手臂）为 Three.js 可直接使用的 JSON。

输出：
  client/assets/unity/actors/actors.json    + PNG
  client/assets/unity/weapons/weapons.json  + PNG

坐标：Unity 左手系 -> Three.js 右手系（z 取反、绕序反转、绑定矩阵做 M·B·M）
用法：/tmp/upvenv/bin/python tools/extract_prefabs.py
"""
import os
import json
import numpy as np
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler

SRC = "/workspace/.uploads/ad5b29a8-3b85-412f-b6c5-18da03821517_DC穿越火线之运输船.unity3d"
CH_OUT = "/workspace/client/assets/unity/actors"
WP_OUT = "/workspace/client/assets/unity/weapons"

CHAR_PREFABS = [
    ("0", "新赛斯BLModel"),
    ("1", "新赛斯GRModel"),
]
WEAPON_PREFABS = [
    ("rifle", "M4A1"),
    ("sniper", "AWM"),
    ("pistol", "沙漠之鹰"),
]

env = UnityPy.load(SRC)
bundle = list(env.files.values())[0]
files = {os.path.basename(k): v for k, v in bundle.files.items() if hasattr(v, "objects")}


def pref(ptr):
    if isinstance(ptr, dict):
        return int(ptr.get("m_FileID", 0)), int(ptr.get("m_PathID", 0))
    return int(getattr(ptr, "m_FileID", 0)), int(getattr(ptr, "m_PathID", 0))


class Ctx:
    """单个 SerializedFile 上下文。"""

    def __init__(self, sf):
        self.sf = sf
        self.objs = sf.objects
        self.gos = {}
        self.trs = {}
        for pid, o in self.objs.items():
            if o.type.name == "GameObject":
                self.gos[pid] = o.read_typetree()
            elif o.type.name in ("Transform", "RectTransform"):
                self.trs[pid] = o.read_typetree()
        # transform -> gameobject / children
        self.tpid_of_g = {}
        for pid, t in self.trs.items():
            self.tpid_of_g[t["m_GameObject"]["m_PathID"]] = pid

    def resolve(self, ptr, owner=None):
        if owner is None or not hasattr(owner, "objs"):
            owner = self
        fid, pid = pref(ptr)
        if pid == 0:
            return None
        if fid == 0:
            return owner.objs.get(pid)
        sf = owner.sf
        name = os.path.basename(str(sf.externals[fid - 1]).split("(")[-1].rstrip(")>"))
        f = files.get(name)
        return None if f is None else f.objects.get(pid)

    def go_name(self, gpid):
        return self.gos.get(gpid, {}).get("m_Name", "?")


def q_to_mat(q):
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
    M[:3, :3] = q_to_mat((r["x"], r["y"], r["z"], r["w"])) @ np.diag([s["x"], s["y"], s["z"]])
    M[:3, 3] = [p["x"], p["y"], p["z"]]
    return M


def sign3(v):
    return float(v["x"]), float(v["y"]), float(v["z"])


MIRROR = np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, -1, 0], [0, 0, 0, 1]], np.float64)


def tex_name(t):
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in t.m_Name) or "tex"


def export_texture(ctx, texptr, outdir, cache):
    fid, pid = texptr["m_FileID"], texptr["m_PathID"]
    key = (fid, pid)
    if key in cache:
        return cache[key]
    r = ctx.resolve({"m_FileID": fid, "m_PathID": pid})
    if r is None:
        cache[key] = None
        return None
    t = r.read()
    fname = tex_name(t) + ".png"
    path = os.path.join(outdir, fname)
    if not os.path.exists(path):
        try:
            t.image.save(path)
        except Exception as e:
            print("TEX FAIL", t.m_Name, e)
            cache[key] = None
            return None
    cache[key] = fname
    return fname


def material_info(ctx, ptr, owner, outdir, texcache):
    r = ctx.resolve(ptr, owner)
    if r is None:
        return {"name": "default", "map": None, "color": [1, 1, 1, 1], "metallic": 0.0, "rough": 0.7, "alphaTest": 0.0}
    tt = r.read_typetree()
    props = tt["m_SavedProperties"]
    main = None
    tiling = [1, 1]
    offset = [0, 0]
    for entry, val in props.get("m_TexEnvs", []):
        if entry["name"] == "_MainTex":
            tp = val["m_Texture"]
            if tp["m_PathID"]:
                main = export_texture(ctx, tp, outdir, texcache)
                tiling = [val["m_Scale"]["x"], val["m_Scale"]["y"]]
                offset = [val["m_Offset"]["x"], val["m_Offset"]["y"]]
    colors = {}
    for entry, c in props.get("m_Colors", []):
        if "r" in c:
            colors[entry["name"]] = [c["r"], c["g"], c["b"], c.get("a", 1)]
        else:
            colors[entry["name"]] = [c["x"], c["y"], c["z"], c.get("w", 0)]
    floats = {entry["name"]: float(v) for entry, v in props.get("m_Floats", [])}
    col = colors.get("_Color", [1, 1, 1, 1])
    mode = floats.get("_Mode", 0)
    alpha_cut = 0.0
    if mode in (1, 3):
        alpha_cut = floats.get("_Cutoff", 0.5)
    return {
        "name": tt["m_Name"], "map": main, "color": col,
        "metallic": floats.get("_Metallic", 0.0),
        "rough": 1.0 - floats.get("_Glossiness", 0.5) * 0.75,
        "alphaTest": alpha_cut, "tiling": tiling, "offset": offset,
        "transparent": mode >= 2,
    }


def mesh_geometry(ctx, meshptr, bone_map):
    """返回顶点数组（含蒙皮信息）。bone_map: transform path_id -> 该渲染器骨骼索引。"""
    r = ctx.resolve(meshptr)
    if r is None:
        return None
    mesh = r.read()
    h = MeshHandler(mesh)
    h.process()
    v = np.array(h.m_Vertices, np.float64).reshape(-1, 3)
    n = np.zeros((len(v), 3)) if h.m_Normals is None else np.array(h.m_Normals, np.float64).reshape(-1, 3)
    uv = np.zeros((len(v), 2)) if h.m_UV0 is None else np.array(h.m_UV0, np.float64).reshape(-1, 2)
    idx = np.array(h.m_IndexBuffer, np.int64).reshape(-1)
    isz = 4 if len(v) > 65535 else 2
    subs = []
    for sm in mesh.m_SubMeshes:
        first = int(sm.firstByte) // isz
        subs.append((first, int(sm.indexCount), int(sm.topology or 0)))

    # 骨骼
    if h.m_BoneIndices is None or len(h.m_BoneIndices) != len(v):
        bi = np.zeros((len(v), 4), np.int64)
        bw = np.zeros((len(v), 4))
        bw[:, 0] = 1
    else:
        bi = np.array(h.m_BoneIndices, np.int64).reshape(-1, 4)
        bw = np.array(h.m_BoneWeights, np.float64).reshape(-1, 4)

    # 三角拆分
    tris = []
    groups = []
    for si, (first, count, topo) in enumerate(subs):
        part = idx[first:first + count]
        if topo == 0:
            t = part[: len(part) // 3 * 3].reshape(-1, 3)
        elif topo == 4:  # quads
            q = part[: len(part) // 4 * 4].reshape(-1, 4)
            t = np.concatenate([q[:, [0, 1, 2]], q[:, [0, 2, 3]]])
        else:
            continue
        groups.append((si, len(tris) * 3, len(t) * 3))
        tris.append(t)

    # Unity 顶点 -> Three（z 取反）
    v[:, 2] *= -1
    n[:, 2] *= -1
    uv[:, 1] = 1.0 - uv[:, 1]

    allt = np.concatenate(tris).reshape(-1, 3) if tris else np.zeros((0, 3), np.int64)
    # 镜像后绕序翻转
    allt = allt[:, ::-1]

    data = {
        "pos": v.astype(np.float32).round(5).reshape(-1).tolist(),
        "nrm": n.astype(np.float32).round(4).reshape(-1).tolist(),
        "uv": uv.astype(np.float32).round(5).reshape(-1).tolist(),
        "idx": allt.reshape(-1).tolist(),
        "bi": bi.astype(int).tolist(),
        "bw": bw.astype(np.float32).round(4).tolist(),
        "groups": groups,
        "subs": len(subs),
    }
    return data


def export_prefab(ctx, root_gpid, outdir, kind):
    root_tpid = ctx.tpid_of_g.get(root_gpid)
    if root_tpid is None:
        return None
    # 收集子树内所有 transform / gameobject
    order = []
    parent_of = {}

    def walk(tpid, parent):
        order.append(tpid)
        parent_of[tpid] = parent
        for c in ctx.trs[tpid].get("m_Children", []):
            cp = c["m_PathID"]
            if cp in ctx.trs:
                walk(cp, tpid)

    walk(root_tpid, -1)

    gid_of_t = {tpid: ctx.trs[tpid]["m_GameObject"]["m_PathID"] for tpid in order}
    # 保留全部 transform（骨骼层级完整）
    tindex = {tpid: i for i, tpid in enumerate(order)}
    world = {}

    def world_of(tpid):
        if tpid in world:
            return world[tpid]
        m = local_mat(ctx.trs[tpid])
        p = parent_of[tpid]
        world[tpid] = (world_of(p) @ m) if p >= 0 else m
        return world[tpid]

    # 骨骼：所有 transform 节点；缩放到模型根空间（根自身世界矩阵）
    root_world = world_of(root_tpid)
    try:
        root_inv = np.linalg.inv(root_world)
    except np.linalg.LinAlgError:
        root_inv = np.eye(4)

    bones = []
    for tpid in order:
        gpid = gid_of_t[tpid]
        name = ctx.go_name(gpid)
        loc = ctx.trs[tpid]
        r, p, s = loc["m_LocalRotation"], loc["m_LocalPosition"], loc["m_LocalScale"]
        # 相对父节点（根节点自身放到原点）
        if tpid == root_tpid:
            pos = [0.0, 0.0, 0.0]
            quat = [0.0, 0.0, 0.0, 1.0]
            scl = [float(s["x"]), float(s["y"]), float(s["z"])]
        else:
            pos = [float(p["x"]), float(p["y"]), -float(p["z"])]
            quat = [-float(r["x"]), -float(r["y"]), float(r["z"]), float(r["w"])]
            scl = [float(s["x"]), float(s["y"]), float(s["z"])]
        pi = tindex[parent_of[tpid]] if parent_of[tpid] >= 0 else -1
        bones.append({"name": name, "parent": pi, "pos": pos, "quat": quat, "scale": scl})

    bone_index = {tpid: i for i, tpid in enumerate(order)}

    # 绑定矩阵 = 逆(骨骼世界矩阵)，并做 M·B·M
    bind = []
    for tpid in order:
        W = root_inv @ world_of(tpid)
        try:
            B = np.linalg.inv(W)
        except np.linalg.LinAlgError:
            B = np.eye(4)
        B = MIRROR @ B @ MIRROR
        bind.append(B.astype(np.float32).round(5).T.reshape(-1).tolist())  # 列主序（three Matrix4.fromArray 需要列主序）

    # 渲染器
    parts = []
    texcache = {}
    matcache = {}
    for tpid in order:
        gpid = gid_of_t[tpid]
        go = ctx.gos[gpid]
        for comp in go.get("m_Component", []):
            cp = comp[1]
            cpid = cp.get("m_PathID", 0)
            o = ctx.objs.get(cpid)
            if o is None:
                continue
            if o.type.name not in ("SkinnedMeshRenderer", "MeshRenderer"):
                continue
            tt = o.read_typetree()
            if o.type.name == "SkinnedMeshRenderer":
                if not tt.get("m_Enabled", True):
                    continue
                meshptr = tt.get("m_Mesh", {})
                if not meshptr.get("m_PathID"):
                    continue
                kids = [pref(bp) for bp in tt.get("m_Bones", [])]
                remap = {}
                sub_bones = []
                for i, (fid, pid) in enumerate(kids):
                    remap[i] = i
                    sub_bones.append(pid)
                bi = {}
                for i, (fid, pid) in enumerate(kids):
                    bi[pid] = i
                geo = mesh_geometry(ctx, meshptr, bi)
                if geo is None:
                    continue
                # 真实绑定矩阵（mesh.m_BindPose），映射到全局骨骼索引
                mesh_r = ctx.resolve(meshptr).read()
                mbp = []
                for m4 in mesh_r.m_BindPose:
                    B = np.array([
                        [m4.e00, m4.e01, m4.e02, m4.e03],
                        [m4.e10, m4.e11, m4.e12, m4.e13],
                        [m4.e20, m4.e21, m4.e22, m4.e23],
                        [m4.e30, m4.e31, m4.e32, m4.e33],
                    ], np.float64)
                    mbp.append(MIRROR @ B @ MIRROR)
                part_bind = [np.eye(4) for _ in range(len(order))]
                for i, (fid, pid) in enumerate(kids):
                    gidx = bone_index.get(pid)
                    if gidx is not None and i < len(mbp):
                        part_bind[gidx] = mbp[i]
                # 重映射骨骼索引 -> 全局骨骼索引
                for row in geo["bi"]:
                    for k in range(4):
                        gp = sub_bones[row[k]] if row[k] < len(sub_bones) else None
                        row[k] = bone_index.get(gp, -1) if gp is not None else -1
                for k in range(len(geo["bi"])):
                    for q in range(min(4, len(geo["bw"][k]))):
                        if geo["bi"][k][q] < 0:
                            geo["bw"][k][q] = 0.0
                mats = []
                for mptr in tt.get("m_Materials", []):
                    key = pref(mptr)
                    if key not in matcache:
                        matcache[key] = material_info(ctx, mptr, o.assets_file, outdir, texcache)
                    mats.append(matcache[key])
                parts.append({
                    "node": ctx.go_name(gpid),
                    "geom": geo,
                    "materials": mats,
                    "skinned": True,
                    "bind": [M.astype(np.float32).round(5).T.reshape(-1).tolist() for M in part_bind],
                })
            else:
                # 静态 MeshRenderer（角色命中的可视化盒不导出，武器挂点保留）
                if kind == "char":
                    continue
                mptr = None
                for c2 in go.get("m_Component", []):
                    c2p = c2[1]["m_PathID"]
                    o2 = ctx.objs.get(c2p)
                    if o2 is not None and o2.type.name == "MeshFilter":
                        mptr = o2.read_typetree().get("m_Mesh", {})
                if not mptr or not mptr.get("m_PathID"):
                    continue
                geo = mesh_geometry(ctx, mptr, {})
                if geo is None:
                    continue
                W = root_inv @ world_of(tpid)
                vm = np.array(geo["pos"], np.float64).reshape(-1, 3)
                vm_h = np.concatenate([vm, np.ones((len(vm), 1))], axis=1)
                Wt = MIRROR @ W @ MIRROR
                out = (Wt @ vm_h.T).T[:, :3]
                geo["pos"] = out.astype(np.float32).round(5).reshape(-1).tolist()
                nm = np.array(geo["nrm"], np.float64).reshape(-1, 3)
                outn = (Wt[:3, :3] @ nm.T).T
                geo["nrm"] = outn.astype(np.float32).round(4).reshape(-1).tolist()
                mats = []
                for mptr2 in tt.get("m_Materials", []):
                    key = pref(mptr2)
                    if key not in matcache:
                        matcache[key] = material_info(ctx, mptr2, o.assets_file, outdir, texcache)
                    mats.append(matcache[key])
                parts.append({"node": ctx.go_name(gpid), "geom": geo, "materials": mats, "skinned": False})

    if not parts:
        return None

    # 包围盒（按静止姿态蒙皮后的位置）
    def qmat3(q):
        x, y, z, w = q
        return np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ])

    bw_world = []
    for b in bones:
        M = np.eye(4)
        M[:3, :3] = qmat3(b["quat"]) @ np.diag(b["scale"])
        M[:3, 3] = b["pos"]
        bw_world.append((bw_world[b["parent"]] @ M) if b["parent"] >= 0 else M)

    allv = []
    for p in parts:
        if not p["skinned"]:
            allv.append(np.array(p["geom"]["pos"], np.float64).reshape(-1, 3))
            continue
        geo = p["geom"]
        v = np.array(geo["pos"], np.float64).reshape(-1, 3)
        bi = np.array(geo["bi"], np.int64)
        bw = np.array(geo["bw"], np.float64)
        binds = [np.array(x, np.float64).reshape(4, 4).T for x in p["bind"]]
        S = [bw_world[j] @ binds[j] for j in range(len(binds))]
        out = np.zeros_like(v)
        for k in range(4):
            w = bw[:, k]
            idx = bi[:, k]
            for j in np.unique(idx):
                if j < 0:
                    continue
                mask = (idx == j) & (w > 1e-6)
                if mask.any():
                    vv = np.concatenate([v[mask], np.ones((mask.sum(), 1))], axis=1)
                    out[mask] += w[mask, None] * (S[j] @ vv.T).T[:, :3]
        allv.append(out)

    allv = np.concatenate(allv)
    bmin = allv.min(axis=0).tolist()
    bmax = allv.max(axis=0).tolist()

    # 材质去重
    seen = {}
    mats_list = []
    outparts = []
    for p in parts:
        geo = p["geom"]
        outmats = []
        for m in p["materials"]:
            key = json.dumps(m, sort_keys=True, ensure_ascii=False)
            if key not in seen:
                seen[key] = len(mats_list)
                mats_list.append(m)
            outmats.append(seen[key])
        outparts.append({"node": p["node"], "skinned": p["skinned"], "geom": geo, "mats": outmats,
                         "bind": p.get("bind")})

    return {
        "name": ctx.go_name(root_gpid),
        "bones": bones,
        "materials": mats_list,
        "parts": outparts,
        "bbox": {"min": bmin, "max": bmax},
    }


def qmat3(q):
    return q_to_mat(q)


def bone_worlds(bones):
    out = []
    for b in bones:
        M = np.eye(4)
        M[:3, :3] = qmat3(b["quat"]) @ np.diag(b["scale"])
        M[:3, 3] = b["pos"]
        out.append((out[b["parent"]] @ M) if b["parent"] >= 0 else M)
    return out


def skinned_world(model, part):
    """按静止姿态把分片顶点蒙皮到模型空间。"""
    bw_world = bone_worlds(model["bones"])
    geo = part["geom"]
    v = np.array(geo["pos"], np.float64).reshape(-1, 3)
    bi = np.array(geo["bi"], np.int64)
    bw = np.array(geo["bw"], np.float64)
    binds = [np.array(x, np.float64).reshape(4, 4).T for x in part["bind"]]
    S = [bw_world[j] @ binds[j] for j in range(len(binds))]
    out = np.zeros_like(v)
    for k in range(4):
        for j in np.unique(bi[:, k]):
            if j < 0:
                continue
            mask = (bi[:, k] == j) & (bw[:, k] > 1e-6)
            if mask.any():
                vv = np.concatenate([v[mask], np.ones((mask.sum(), 1))], axis=1)
                out[mask] += bw[mask, k][:, None] * (S[j] @ vv.T).T[:, :3]
    return out


def weapon_extras(model, key):
    """第三人称用：把枪身网格烘焙到右手骨骼局部空间，并给出枪口位置。"""
    bones = model["bones"]
    names = [b["name"] for b in bones]
    bw_world = bone_worlds(bones)
    hand_i = next((i for i, n in enumerate(names) if n.endswith("R Hand")), None)
    muzzle_i = next((i for i, n in enumerate(names) if n.startswith("Gun Fire")), None)
    gun_part = None
    for p in model["parts"]:
        mats = [model["materials"][mi]["name"] for mi in p["mats"]]
        if all(n not in ("Hand", "Arm") for n in mats):
            gun_part = p
            break
    if hand_i is None or gun_part is None:
        return
    world = skinned_world(model, gun_part)
    hand_inv = np.linalg.inv(bw_world[hand_i])
    local = np.concatenate([world, np.ones((len(world), 1))], axis=1) @ hand_inv.T
    local = local[:, :3]
    ext = local.max(axis=0) - local.min(axis=0)
    length = float(max(ext))
    target = {"rifle": 2.35, "sniper": 2.45, "pistol": 0.95}.get(key, 2.35)
    geo = gun_part["geom"]
    model["held"] = {
        "pos": local.astype(np.float32).round(5).reshape(-1).tolist(),
        "uv": geo["uv"],
        "idx": geo["idx"],
        "groups": geo["groups"],
        "mats": gun_part["mats"],
        "scale": round(target / max(length, 1e-6), 4),
    }
    if muzzle_i is not None:
        model["muzzle"] = bw_world[muzzle_i][:3, 3].astype(np.float32).round(5).tolist()


def find_root(ctx, name):
    cands = []
    for tpid, t in ctx.trs.items():
        if t["m_Father"]["m_PathID"] == 0:
            gpid = t["m_GameObject"]["m_PathID"]
            if ctx.go_name(gpid) == name:
                cands.append(gpid)
    return cands


def main():
    os.makedirs(CH_OUT, exist_ok=True)
    os.makedirs(WP_OUT, exist_ok=True)

    characters = {}
    for key, name in CHAR_PREFABS:
        ctx = Ctx(files["sharedassets1.assets"])
        roots = find_root(ctx, name)
        if not roots:
            print("NO ROOT", name)
            continue
        model = export_prefab(ctx, roots[0], CH_OUT, "char")
        if model:
            characters[key] = model
            print("CHAR", name, "parts", len(model["parts"]), "bones", len(model["bones"]),
                  "bbox", model["bbox"]["min"], model["bbox"]["max"])

    weapons = {}
    for key, name in WEAPON_PREFABS:
        ctx = Ctx(files["sharedassets4.assets"])
        roots = find_root(ctx, name)
        if not roots:
            print("NO ROOT", name)
            continue
        model = export_prefab(ctx, roots[0], WP_OUT, "weapon")
        if model:
            weapon_extras(model, key)
            weapons[key] = model
            print("WEAPON", name, "parts", len(model["parts"]), "bones", len(model["bones"]),
                  "bbox", model["bbox"]["min"], model["bbox"]["max"],
                  "held", model.get("held", {}).get("scale"), "muzzle", model.get("muzzle"))

    with open(os.path.join(CH_OUT, "actors.json"), "w", encoding="utf-8") as f:
        json.dump({"characters": characters}, f, ensure_ascii=False)
    with open(os.path.join(WP_OUT, "weapons.json"), "w", encoding="utf-8") as f:
        json.dump({"weapons": weapons}, f, ensure_ascii=False)
    print("DONE")


if __name__ == "__main__":
    main()
