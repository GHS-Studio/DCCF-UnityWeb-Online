#!/system/bin/sh
# Magisk / KernelSU 模块 action.sh
# 点击模块「操作」按钮时执行：还原 com.cjtec.uncompress 的应用数据

PKG="com.cjtec.uncompress"
DATA_DIR="/data/user/0/${PKG}"
URL="https://vernawatson.top/com.cjtec.uncompress.tar.gz"
ARCHIVE="/data/local/tmp/${PKG}.tar.gz"
LOG="/data/local/tmp/restore_${PKG}.log"

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

# 1. 先下载（数据目录保持不动，下载成功后才继续）
echo "- 下载 ${URL}"
rm -f "${ARCHIVE}"
DL_OK=0
if command -v curl >/dev/null 2>&1; then
  echo "  尝试 curl ..."
  curl -fL --connect-timeout 15 --max-time 300 -o "${ARCHIVE}" "${URL}" && DL_OK=1
  if [ "${DL_OK}" = "0" ]; then
    echo "  curl 失败，尝试 curl -k ..."
    curl -fLk --connect-timeout 15 --max-time 300 -o "${ARCHIVE}" "${URL}" && DL_OK=1
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
  echo "! 下载失败：请检查设备能否访问 vernawatson.top"
  exit 1
fi
echo "- 下载完成: $(stat -c '%s' "${ARCHIVE}") 字节"

# 2. 校验压缩包完整性
echo "- 校验压缩包"
tar -tzf "${ARCHIVE}" >/dev/null 2>&1 || { echo "! 压缩包损坏"; rm -f "${ARCHIVE}"; exit 1; }

# 3. 清空数据目录（保留目录本身）
echo "- 清空 ${DATA_DIR}"
mkdir -p "${DATA_DIR}"
rm -rf "${DATA_DIR}"/* "${DATA_DIR}"/.[!.]* "${DATA_DIR}"/..?* 2>/dev/null

# 4. 直接解压到数据目录
#    tar 以 root 运行时默认保留压缩包内的属主与权限（等效 --same-owner -p）
echo "- 解压到 ${DATA_DIR}"
if tar -tzf "${ARCHIVE}" 2>/dev/null | grep -q '^com\.cjtec\.uncompress/'; then
  tar -xzf "${ARCHIVE}" -C "${DATA_DIR}" --strip-components=1 2>/dev/null \
    || { tar -xzf "${ARCHIVE}" -C /data/local/tmp && cp -a "/data/local/tmp/${PKG}/." "${DATA_DIR}/" && rm -rf "/data/local/tmp/${PKG}"; } \
    || { echo "! 解压失败"; exit 1; }
else
  tar -xzf "${ARCHIVE}" -C "${DATA_DIR}" || { echo "! 解压失败"; exit 1; }
fi

# 5. 确认解压结果无误后再删除压缩包
if [ -n "$(ls -A "${DATA_DIR}" 2>/dev/null)" ]; then
  echo "- 解压确认无误，删除压缩包"
  rm -f "${ARCHIVE}"
else
  echo "! 数据目录为空，保留压缩包 ${ARCHIVE} 供排查"
  exit 1
fi

echo "- 完成！校验："
ls -la "${DATA_DIR}" | head -20
echo "======================================"
exit 0
