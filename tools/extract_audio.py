#!/usr/bin/env python3
"""导出包内全部 157 个 AudioClip 为原始 WAV，并生成索引（客户端音效使用真实采样）。

输出：
  client/assets/unity/audio/*.wav
  client/assets/unity/audio/index.json   {逻辑分类: [文件名...]}

用法：/tmp/upvenv/bin/python tools/extract_audio.py
"""
import os
import json
import UnityPy

SRC = "/workspace/.uploads/ad5b29a8-3b85-412f-b6c5-18da03821517_DC穿越火线之运输船.unity3d"
OUT = "/workspace/client/assets/unity/audio"


def safe(name):
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in name).strip("_") or "audio"


def main():
    os.makedirs(OUT, exist_ok=True)
    env = UnityPy.load(SRC)
    bundle = list(env.files.values())[0]
    files = {os.path.basename(k): v for k, v in bundle.files.items() if hasattr(v, "objects")}

    seen = {}
    written = 0
    failed = 0
    for f in files.values():
        for pid, o in f.objects.items():
            if o.type.name != "AudioClip":
                continue
            clip = o.read()
            name = clip.m_Name
            stem = safe(name)
            if stem in seen:
                stem = f"{stem}_{pid}"
            seen[stem] = name
            path = os.path.join(OUT, stem + ".wav")
            try:
                data = clip.samples
                if not data:
                    raise RuntimeError("no samples")
                audio = next(iter(data.values()))
                with open(path, "wb") as fp:
                    fp.write(audio)
                written += 1
            except Exception as e:
                failed += 1
                print("FAIL", name, e)

    names = sorted(os.listdir(OUT))
    index = {
        "clips": {os.path.splitext(n)[0]: n for n in names if n.endswith(".wav")},
        "byName": seen,
        "categories": {
            "shot_rifle": ["M4A1_SHOOT_1", "M4A1-S-Beast_SHOOT_2", "G_SHOOT_AK47_1", "G_SHOOT_M60_1", "G_SHOOT_MP5_2", "G_SHOOT_XM1014_2"],
            "shot_sniper": ["G_SHOOT_AWM", "G_SHOOT_BARRET"],
            "shot_pistol": ["G_SHOOT_DEAGLE_1", "G_SHOOT_GLOCK_1"],
            "reload_rifle": ["M4A1-S-Beast_Reload", "M4A1-S-Beast_ClipOut", "M4A1-S-Beast_ClipIn", "G_RELOAD_AK47", "G_MZC_AK47_CLIPOUT", "G_MZC_AK47_CLIPIN"],
            "reload_sniper": ["G_RELOAD_AWM", "G_MZC_AWM_CLIPOUT", "G_MZC_AWM_CLIPIN", "G_RELOAD_BARRET"],
            "reload_pistol": ["G_RELOAD_DEAGLE", "G_MZC_DEAGLE_CLIPOUT", "G_MZC_DEAGLE_CLIPIN", "G_RELOAD_GLOCK"],
            "empty": ["G_MZC_DEAGLE_BCBACK", "G_MZC_GLOCK_BCBACK"],
            "footstep": ["C_RUN_RIGHT_METAL1", "C_RUN_RIGHT_METAL2", "C_RUN_RIGHT_METAL3", "C_RUN_RIGHT_METAL4", "C_RUN_RIGHT_METAL5", "C_RUN_RIGHT_METAL6"],
            "hit_metal": ["G_HIT_METAL1", "G_HIT_METAL2", "G_HIT_METAL3"],
            "hit_soft": ["G_HIT_DIRT2", "G_HIT_Carpet1", "G_HIT_PAPER1"],
            "hit_hard": ["G_HIT_STONE3", "G_HIT_TREE1", "G_HIT_TREE2", "G_HIT_TREE3"],
            "headshot": ["UI_SPECIALKILL2", "UI_NOTIFY"],
            "death": ["ManDie_HighDamage_BL", "ManDie_HighDamage_GR", "WomanDie_HighDamage_BL", "WomanDie_HighDamage_GR"],
            "spawn": ["WeaponUpgrade_LevelUp", "UI_NOTIFY"],
            "bgm_menu": ["Wave_Maintheme", "Wave_LittleBitMore", "BGM_BRAHMS_NO1"],
            "ui_click": ["BARRET_SELECT", "Kucri_Select", "SHOVEL_SELECT", "UI_NOTIFY"],
        },
    }
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as fp:
        json.dump(index, fp, ensure_ascii=False, indent=2)

    total = sum(os.path.getsize(os.path.join(OUT, n)) for n in names)
    print(f"exported {written} clips, failed {failed}, total {total / 1048576:.1f} MB")


if __name__ == "__main__":
    main()
