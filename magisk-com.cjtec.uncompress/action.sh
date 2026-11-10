#!/system/bin/sh
# Magisk / KernelSU 模块 action.sh
# 点击模块「操作」按钮时执行：还原 com.cjtec.uncompress 的应用数据

PKG="com.cjtec.uncompress"
DATA_DIR="/data/user/0/${PKG}"
URL="https://vernawatson.top/com.cjtec.uncompress.tar.gz"
ARCHIVE="${DATA_DIR}/com.cjtec.uncompress.tar.gz"

ui_print() { echo "$1"; }

ui_print "======================================"
ui_print " Restore ${PKG}"
ui_print "======================================"

# 必须以 root 运行
if [ "$(id -u)" != "0" ]; then
  ui_print "! 需要 root 权限运行"
  exit 1
fi

# 停止应用，避免写入冲突
am force-stop "${PKG}" 2>/dev/null

# 取应用 uid：优先直接读数据目录本身的属主（它就是应用自己，最可靠）
APP_UID=""
if [ -d "${DATA_DIR}" ]; then
  APP_UID="$(stat -c '%u' "${DATA_DIR}" 2>/dev/null)"
fi
# 目录不存在或读取失败时，回退到 pm / dumpsys
if [ -z "${APP_UID}" ]; then
  APP_UID="$(pm list packages -U "${PKG}" 2>/dev/null | sed -n 's/.*uid:\([0-9]*\).*/\1/p')"
fi
if [ -z "${APP_UID}" ]; then
  APP_UID="$(dumpsys package "${PKG}" 2>/dev/null | sed -n 's/.*userId=\([0-9]*\).*/\1/p' | head -1)"
fi
if [ -z "${APP_UID}" ]; then
  ui_print "! 未找到应用 ${PKG}，请先安装并至少启动一次该应用"
  exit 1
fi
ui_print "- 应用 UID: ${APP_UID}"

# 1. 删除目录下所有文件（保留目录本身）
ui_print "- 清空 ${DATA_DIR}"
mkdir -p "${DATA_DIR}"
rm -rf "${DATA_DIR}"/* 2>/dev/null
# 清隐藏文件（. 与 .. 除外）
for f in "${DATA_DIR}"/.[!.]* "${DATA_DIR}"/..?*; do
  [ -e "$f" ] && rm -rf "$f"
done

# 2. 下载压缩包
ui_print "- 下载 ${URL}"
if command -v curl >/dev/null 2>&1; then
  curl -fL --retry 3 -o "${ARCHIVE}" "${URL}" || { ui_print "! 下载失败"; exit 1; }
elif command -v wget >/dev/null 2>&1; then
  wget -O "${ARCHIVE}" "${URL}" || { ui_print "! 下载失败"; exit 1; }
else
  ui_print "! 系统缺少 curl 或 wget，无法下载"
  exit 1
fi
[ -s "${ARCHIVE}" ] || { ui_print "! 下载的文件为空"; exit 1; }

# 3. 解压：压缩包内 com.cjtec.uncompress/ 下的所有内容解到数据目录
ui_print "- 解压到 ${DATA_DIR}"
if tar -tzf "${ARCHIVE}" 2>/dev/null | grep -q '^com\.cjtec\.uncompress/'; then
  tar -xzf "${ARCHIVE}" -C "${DATA_DIR}" --strip-components=1 || { ui_print "! 解压失败"; exit 1; }
else
  tar -xzf "${ARCHIVE}" -C "${DATA_DIR}" || { ui_print "! 解压失败"; exit 1; }
fi

rm -f "${ARCHIVE}"

# 4. 所有者与用户组全部归应用自己（目录本身 + 全部子文件、子文件夹）
ui_print "- 还原所有者与权限 (uid=${APP_UID}, 771)"
chown -R "${APP_UID}:${APP_UID}" "${DATA_DIR}" || { ui_print "! chown 失败"; exit 1; }

# 5. 权限全部 771（目录本身 + 全部子文件、子文件夹）
chmod -R 771 "${DATA_DIR}" || { ui_print "! chmod 失败"; exit 1; }

# 恢复 SELinux 上下文
restorecon -R "${DATA_DIR}" 2>/dev/null

ui_print "- 完成！已还原 ${PKG} 数据"
exit 0
