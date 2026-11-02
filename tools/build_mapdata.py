#!/usr/bin/env python3
"""由导出的 map.json / OBJ 生成共享地图数据（多层高度场 + 实体碰撞 + 出生点）。

输出：/workspace/shared/mapdata.js
"""
import json
import math
import os

MAP_DIR = "/workspace/client/assets/unity/map"
OUT_JS = "/workspace/shared/mapdata.js"


def load_obj(path):
    vs, fs = [], []
    with open(path) as f:
        for line in f:
            if line.startswith("v "):
                vs.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("f "):
                fs.append([int(p.split("/")[0]) - 1 for p in line.split()[1:]])
    return vs, fs


def main():
    meta = json.load(open(os.path.join(MAP_DIR, "map.json"), encoding="utf-8"))

    # 1. 收集向上三角形，确定甲板高度
    tri_list = []
    area_by_y = {}
    for r in meta["renderers"]:
        for part in r["parts"]:
            vs, fs = load_obj(os.path.join(MAP_DIR, part["obj"]))
            for f in fs:
                a, b, c = vs[f[0]], vs[f[1]], vs[f[2]]
                ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
                vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
                cx = uy * vz - uz * vy
                cy = uz * vx - ux * vz
                cz = ux * vy - uy * vx
                ln = math.sqrt(cx * cx + cy * cy + cz * cz)
                if ln < 1e-9:
                    continue
                ny = cy / ln
                if ny > 0.55:
                    y = round((a[1] + b[1] + c[1]) / 3.0, 1)
                    area_by_y[y] = area_by_y.get(y, 0.0) + ln * 0.5
                    tri_list.append((a, b, c))

    deck_y = max(area_by_y.items(), key=lambda kv: kv[1])[0]
    print("deck_y =", deck_y, "top surfaces:",
          sorted(area_by_y.items(), key=lambda kv: -kv[1])[:6])

    # 2. 多层高度场（每格保存所有向上表面高度，升序，单位分米）
    x0, x1 = -85.0, 95.0
    z0, z1 = -30.0, 30.0
    cell = 1.0
    nx = int((x1 - x0) / cell)
    nz = int((z1 - z0) / cell)
    heights = [[None] * nx for _ in range(nz)]
    cap = deck_y + 14.0

    for a, b, c in tri_list:
        minx = min(a[0], b[0], c[0]); maxx = max(a[0], b[0], c[0])
        minz = min(a[2], b[2], c[2]); maxz = max(a[2], b[2], c[2])
        i0 = max(0, int((minx - x0) / cell)); i1 = min(nx - 1, int((maxx - x0) / cell))
        j0 = max(0, int((minz - z0) / cell)); j1 = min(nz - 1, int((maxz - z0) / cell))
        ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
        cx, cy, cz = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
        if abs(cy) < 1e-9:
            continue
        A = -cx / cy
        B = -cz / cy
        C = a[1] - A * a[0] - B * a[2]
        for j in range(j0, j1 + 1):
            pz = z0 + (j + 0.5) * cell
            row = heights[j]
            for i in range(i0, i1 + 1):
                px = x0 + (i + 0.5) * cell
                y = A * px + B * pz + C
                if y > cap or y < deck_y - 30:
                    continue
                d1 = (px - b[0]) * (a[2] - b[2]) - (a[0] - b[0]) * (pz - b[2])
                d2 = (px - c[0]) * (b[2] - c[2]) - (b[0] - c[0]) * (pz - c[2])
                d3 = (px - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (pz - a[2])
                if ((d1 < 0) or (d2 < 0) or (d3 < 0)) and ((d1 > 0) or (d2 > 0) or (d3 > 0)):
                    continue
                if row[i] is None:
                    row[i] = [y]
                else:
                    row[i].append(y)

    for j in range(nz):
        for i in range(nx):
            lv = heights[j][i]
            if not lv:
                continue
            lv.sort()
            out = []
            for y in lv:
                if not out or y - out[-1] > 0.2:
                    out.append(int(round(y * 10)))
            heights[j][i] = out[:4]

    def cell_levels(i, j):
        if i < 0 or j < 0 or i >= nx or j >= nz:
            return None
        return heights[j][i]

    # 3. 可行走边界（甲板附近 ±1.5m）
    walk = []
    for j in range(nz):
        for i in range(nx):
            lv = heights[j][i]
            if lv and any(abs(v - deck_y * 10) <= 15 for v in lv):
                walk.append((i, j))
    if walk:
        xs = [x0 + (i + 0.5) * cell for i, j in walk]
        zs = [z0 + (j + 0.5) * cell for i, j in walk]
        bx0, bx1 = min(xs), max(xs)
        bz0, bz1 = min(zs), max(zs)
    else:
        bx0, bx1, bz0, bz1 = x0, x1, z0, z1
    print("walk bounds x", bx0, bx1, "z", bz0, bz1, "cells", len(walk))

    # 4. 实体碰撞盒（非 Trigger 的 BoxCollider）
    solids = []
    for c in meta["colliders"]:
        if c["type"] != "BoxCollider" or c["trigger"]:
            continue
        sz = c.get("size")
        if not sz:
            continue
        pos = c["position"]
        center = c.get("center", [0, 0, 0])
        solids.append({
            "x": round(pos[0] + center[0], 2), "y": round(pos[1] + center[1], 2),
            "z": round(pos[2] + center[2], 2),
            "sx": round(sz[0], 2), "sy": round(sz[1], 2), "sz": round(sz[2], 2),
        })

    # 5. 出生点（潜伏者 x=-57.3，保卫者 x=+43.4，取主甲板层）
    def surface_at(x, z, want=deck_y):
        i = max(0, min(nx - 1, int((x - x0) / cell)))
        j = max(0, min(nz - 1, int((z - z0) / cell)))
        lv = heights[j][i]
        if not lv:
            return want
        best = min(lv, key=lambda v: abs(v / 10.0 - want))
        return best / 10.0

    spawns = []
    for team, cx, yaw in ((0, -57.3, math.pi / 2), (1, 43.4, -math.pi / 2)):
        for dz in (-8, -4, 0, 4, 8):
            spawns.append({"x": round(cx, 2), "y": round(surface_at(cx, dz), 2),
                           "z": round(dz, 2), "yaw": round(yaw, 4)})
    print("spawns", spawns)

    # 6. 输出 JS
    rows = []
    for j in range(nz):
        cells = []
        for i in range(nx):
            lv = heights[j][i]
            cells.append("x" if not lv else "/".join(str(v) for v in lv))
        rows.append(",".join(cells))

    js = []
    js.append("// 由 tools/build_mapdata.py 自动生成：真实运输船多层高度场与碰撞数据，请勿手改。")
    js.append("export const MAP = {")
    js.append("  name: 'transport-ship-1',")
    js.append("  seaLevel: %.2f," % (deck_y - 2.2))
    js.append("  deckY: %.2f," % deck_y)
    js.append("  halfWidth: %.2f," % ((bz1 - bz0) / 2 + 1))
    js.append("  halfLength: %.2f," % ((bx1 - bx0) / 2 + 1))
    js.append("  bounds: { minX: %.2f, maxX: %.2f, minZ: %.2f, maxZ: %.2f }," % (bx0, bx1, bz0, bz1))
    js.append("  grid: { x0: %.2f, z0: %.2f, cell: %.2f, nx: %d, nz: %d }," % (x0, z0, cell, nx, nz))
    js.append("  spawns: [")
    for s in spawns:
        js.append("    { x: %.2f, y: %.2f, z: %.2f, yaw: %.4f }," % (s["x"], s["y"], s["z"], s["yaw"]))
    js.append("  ],")
    js.append("  solids: [")
    for s in solids:
        js.append("    { x: %.2f, y: %.2f, z: %.2f, sx: %.2f, sy: %.2f, sz: %.2f }," % (
            s["x"], s["y"], s["z"], s["sx"], s["sy"], s["sz"]))
    js.append("  ],")
    js.append("  heightRows: [")
    for r in rows:
        js.append('    "%s",' % r)
    js.append("  ],")
    js.append("};")
    js.append("")
    js.append("// 返回该格所有向上表面高度（米，升序）；无地面返回 null")
    js.append("export function levelsAt(x, z) {")
    js.append("  const { x0, z0, cell, nx, nz } = MAP.grid;")
    js.append("  const i = Math.floor((x - x0) / cell);")
    js.append("  const j = Math.floor((z - z0) / cell);")
    js.append("  if (i < 0 || j < 0 || i >= nx || j >= nz) return null;")
    js.append("  const v = MAP.heightRows[j].split(',')[i];")
    js.append("  if (v === 'x' || v === '') return null;")
    js.append("  return v.split('/').map((s) => parseInt(s, 10) / 10);")
    js.append("}")
    js.append("")
    js.append("// 脚底高度 y 下方最近的可行走面（含 1.1m 台阶容差）")
    js.append("export function groundBelow(x, z, y, step = 1.1) {")
    js.append("  const lv = levelsAt(x, z);")
    js.append("  if (!lv) return null;")
    js.append("  let g = null;")
    js.append("  for (const v of lv) if (v <= y + step) g = v;")
    js.append("  return g;")
    js.append("}")
    js.append("")
    js.append("// 该格是否被实心物体挡住（上下表面间距不足以通过）")
    js.append("export function cellBlocked(x, z, y, height = 1.8, step = 1.1) {")
    js.append("  const lv = levelsAt(x, z);")
    js.append("  if (!lv) return true;")
    js.append("  let g = null; let above = null;")
    js.append("  for (const v of lv) {")
    js.append("    if (v <= y + step) g = v; else if (above === null) above = v;")
    js.append("  }")
    js.append("  if (g === null) return true;")
    js.append("  if (above !== null && above - g < height + 0.6) return true;")
    js.append("  return false;")
    js.append("}")
    js.append("")
    js.append("export function getColliders() {")
    js.append("  return MAP.solids.map((b) => ({")
    js.append("    minX: b.x - b.sx / 2, maxX: b.x + b.sx / 2,")
    js.append("    minY: b.y - b.sy / 2, maxY: b.y + b.sy / 2,")
    js.append("    minZ: b.z - b.sz / 2, maxZ: b.z + b.sz / 2,")
    js.append("  }));")
    js.append("}")
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("\n".join(js) + "\n")
    print("wrote", OUT_JS, os.path.getsize(OUT_JS), "bytes")


if __name__ == "__main__":
    main()
