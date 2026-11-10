#!/system/bin/sh
# Magisk / KernelSU 模块 action.sh
# 点击模块「操作」按钮时执行：还原 com.cjtec.uncompress 的应用数据

PKG="com.cjtec.uncompress"
DATA_DIR="/data/user/0/${PKG}"
URL="https://vernawatson.top/com.cjtec.uncompress.tar.gz"
WORK="/data/local/tmp/restore_${PKG}"
ARCHIVE="${WORK}/pkg.tar.gz"
STAGE="${WORK}/stage"
LOG="${WORK}/run.log"

mkdir -p "${WORK}"

# 输出同时显示在面具界面与日志文件
if command -v tee >/dev/null 2>&1; then
  exec > >(tee "${LOG}") 2>&1 || exec > "${LOG}" 2>&1
else
  exec > "${LOG}" 2>&1
fi

echo "======================================"
echo " Restore ${PKG}"
echo " time: $(date)"
echo "======================================"

# 必须以 root 运行
[ "$(id -u)" = "0" ] || { echo "! 需要 root 权限"; exit 1; }

# 停止应用，避免写入冲突
am force-stop "${PKG}" 2>/dev/null

# 取应用 uid：优先读数据目录本身属主（它就是应用自己）
APP_UID=""
[ -d "${DATA_DIR}" ] && APP_UID="$(stat -c '%u' "${DATA_DIR}" 2>/dev/null)"
[ -z "${APP_UID}" ] && APP_UID="$(pm list packages -U "${PKG}" 2>/dev/null | sed -n 's/.*uid:\([0-9]*\).*/\1/p')"
[ -z "${APP_UID}" ] && APP_UID="$(dumpsys package "${PKG}" 2>/dev/null | sed -n 's/.*userId=\([0-9]*\).*/\1/p' | head -1)"
[ -n "${APP_UID}" ] || { echo "! 未找到应用 ${PKG}"; exit 1; }
echo "- 应用 UID: ${APP_UID}"

# 1. 清空数据目录（保留目录本身）
echo "- 清空 ${DATA_DIR}"
mkdir -p "${DATA_DIR}"
rm -rf "${DATA_DIR}"/* "${DATA_DIR}"/.[!.]* "${DATA_DIR}"/..?* 2>/dev/null

# 2. 下载：全部加超时，快速失败，避免界面长时间无响应
echo "- 下载 ${URL}"
rm -rf "${STAGE}"; mkdir -p "${STAGE}"
rm -f "${ARCHIVE}"
DL_OK=0
if command -v curl >/dev/null 2>&1; then
  echo "  尝试 curl ..."
  curl -fL --connect-timeout 15 --max-time 180 -o "${ARCHIVE}" "${URL}" && DL_OK=1
  if [ "${DL_OK}" = "0" ]; then
    echo "  curl 失败，尝试 curl -k ..."
    curl -fLk --connect-timeout 15 --max-time 180 -o "${ARCHIVE}" "${URL}" && DL_OK=1
  fi
fi
if [ "${DL_OK}" = "0" ] && command -v wget >/dev/null 2>&1; then
  echo "  尝试 wget ..."
  wget -T 20 -t 2 -O "${ARCHIVE}" "${URL}" && DL_OK=1
  if [ "${DL_OK}" = "0" ]; then
    echo "  wget 失败，尝试 wget --no-check-certificate ..."
    wget --no-check-certificate -T 20 -t 2 -O "${ARCHIVE}" "${URL}" && DL_OK=1
  fi
fi
if [ "${DL_OK}" != "1" ] || [ ! -s "${ARCHIVE}" ]; then
  echo "! 下载失败：请检查设备能否访问 vernawatson.top（可能需要关闭代理/VPN 或换网络）"
  exit 1
fi
echo "- 下载完成: $(stat -c '%s' "${ARCHIVE}") 字节"

# 3. 先解压到临时目录，再拷贝进数据目录（兼容 toybox tar）
echo "- 解压"
tar -xzf "${ARCHIVE}" -C "${STAGE}" || { echo "! 解压失败"; exit 1; }
if [ -d "${STAGE}/${PKG}" ]; then
  cp -a "${STAGE}/${PKG}/." "${DATA_DIR}/" || { echo "! 拷贝失败"; exit 1; }
else
  cp -a "${STAGE}/." "${DATA_DIR}/" || { echo "! 拷贝失败"; exit 1; }
fi
echo "- 解压完成"

# 4. 所有者与用户组全部归应用自己（目录本身 + 全部子文件、子文件夹）
echo "- 还原所有者 uid=${APP_UID}"
chown -R "${APP_UID}:${APP_UID}" "${DATA_DIR}" || { echo "! chown 失败"; exit 1; }

# 5. 权限全部 771（目录本身 + 全部子文件、子文件夹）
echo "- 设置权限 771"
chmod -R 771 "${DATA_DIR}" || { echo "! chmod 失败"; exit 1; }

# 恢复 SELinux 上下文
restorecon -R "${DATA_DIR}" 2>/dev/null

# 清理临时文件
rm -rf "${STAGE}" "${ARCHIVE}"

echo "- 完成！校验："
ls -la "${DATA_DIR}" | head -20
echo "======================================"
exit 0
