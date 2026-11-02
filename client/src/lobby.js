// 原版大厅 / 个人仓库 / 商城 UI
// 布局、精灵与文字全部来自 Unity 包内资源（tools/extract_ui.py 导出）
import LEVEL1 from '../assets/unity/ui/level1.json';
import LEVEL3 from '../assets/unity/ui/level3.json';

const DATA = { level1: LEVEL1, level3: LEVEL3 };
const SPR = 'assets/unity/ui/sprites/';

const W = 800;
const H = 600;

const rgba = (c) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;

function cssRect(r) {
  let [x, y, w, h] = r;
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { left: x + 400, top: H / 2 - (y + h), w, h };
}

// Unity Text 对齐：0..2 上，3..5 中，6..8 下
function textAlign(al) {
  const h = al % 3;
  const v = Math.floor(al / 3);
  return {
    textAlign: h === 0 ? 'left' : h === 1 ? 'center' : 'right',
    justifyContent: h === 0 ? 'flex-start' : h === 1 ? 'center' : 'flex-end',
    alignItems: v === 0 ? 'flex-start' : v === 1 ? 'center' : 'flex-end',
  };
}

// 每个场景需要忽略的子树（原版隐藏面板 / 由脚本动态生成的滚动内容 / 无效缩放节点）
const SKIP = {
  level1: [39, 45, 604, 697, 827, 837, 841, 931, 944],
  level3: [26, 280, 324, 334, 353, 357],
};

const SCROLL = {
  level1: { node: 45, weapon: 47, player: 606, tool: 699 },
  level3: { node: 26, weapon: 28, player: 282, tool: 326 },
};

// 首页（仓库）与商城按钮 → 行为，按节点索引映射，避免与原版同名按钮冲突
const BUTTONS = {
  level1: {
    7: 'bag',
    8: 'player-panel',
    26: 'tab-weapon',
    27: 'tab-player',
    28: 'tab-tool',
    29: 'shop',
    30: 'house',
    31: 'play',
    32: 'help',
  },
  level3: {
    13: 'tab-weapon',
    14: 'tab-player',
    15: 'tab-tool',
    16: 'shop',
    17: 'house',
    18: 'help',
  },
};

function mapWeapon(name) {
  if (/AWM|M82|破天狂龙|巴雷特|狙击/.test(name)) return 'sniper';
  if (/沙漠之鹰|沙鹰|Glock|手枪/.test(name)) return 'pistol';
  return 'rifle';
}

export function createLobby(options) {
  const { settings, isFileApp, isTouch, onJoin, onSettings } = options;

  const root = document.getElementById('lobby');
  if (!root) throw new Error('缺少 #lobby 容器');
  root.innerHTML = '';

  const stage = document.createElement('div');
  stage.className = 'lobby-stage';
  root.appendChild(stage);

  const tabState = { level1: 'weapon', level3: 'weapon' };
  const lists = {};
  const textNodes = { level1: {}, level3: {} };
  const layers = {};
  const cardIcon = new Map();
  const itemMeta = new Map();
  let currentScene = 'level1';
  let selection = { name: 'M4A1', icon: 's_level1_698.png' };
  let joining = false;

  function fitStage() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transform = `scale(${s})`;
  }
  window.addEventListener('resize', fitStage);
  fitStage();

  // ---------------- 通用节点渲染 ----------------
  function buildSkip(data) {
    const kids = [];
    for (let i = 0; i < data.nodes.length; i++) kids.push([]);
    data.nodes.forEach((n, i) => { if (n.p >= 0 && n.p < kids.length) kids[n.p].push(i); });
    return kids;
  }

  function markSkips(data) {
    const kids = buildSkip(data);
    const skip = new Set();
    const stack = [...(SKIP[data.scene] || [])];
    while (stack.length) {
      const i = stack.pop();
      if (skip.has(i)) continue;
      skip.add(i);
      for (const c of kids[i] || []) stack.push(c);
    }
    return { skip, kids };
  }

  function renderScene(key) {
    const data = DATA[key];
    const { skip } = markSkips(data);
    const layer = document.createElement('div');
    layer.className = 'lobby-layer';
    layer.dataset.scene = key;
    layer.style.zIndex = key === 'level1' ? String(10) : String(20);
    layers[key] = layer;
    stage.appendChild(layer);

    const valid = [];
    data.nodes.forEach((n, i) => {
      if (skip.has(i)) return;
      if (!n.a) return;
      const hasImg = n.img && n.img.c[3] > 0.02 && n.img.w > 0 && n.img.h > 0;
      const hasTxt = n.txt && n.txt.s && n.txt.s.trim().length > 0;
      const isBtn = !!n.btn;
      if (!hasImg && !hasTxt && !isBtn) return;
      const { w, h } = { w: n.r[2], h: n.r[3] };
      if (!(w > 0 && h > 0)) return;
      // 跳过明显错误的缩放节点
      if (w > 900 || h > 700) return;
      valid.push(i);
    });

    for (const i of valid) {
      const n = data.nodes[i];
      const r = cssRect(n.r);
      const el = document.createElement('div');
      el.className = 'ui-node';
      let left = r.left;
      let top = r.top;
      let width = r.w;
      let height = r.h;
      if (i === 1) { left = 0; top = 0; width = W; height = H; }
      el.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;z-index:${i}`;

      if (n.img && n.img.c[3] > 0.02 && n.img.w > 0 && n.img.h > 0) {
        el.style.backgroundImage = `url("${SPR}${n.img.f}")`;
        el.style.backgroundSize = '100% 100%';
        el.style.backgroundRepeat = 'no-repeat';
      }
      if (n.txt && n.txt.s) {
        const fd = n.txt;
        const a = textAlign(fd.al);
        el.classList.add('ui-text');
        el.style.display = 'flex';
        el.style.fontSize = `${(fd.sz * (n.sc || 1)).toFixed(2)}px`;
        el.style.lineHeight = '1.18';
        el.style.color = rgba(fd.c);
        el.style.textAlign = a.textAlign;
        el.style.justifyContent = a.justifyContent;
        el.style.alignItems = a.alignItems;
        el.style.fontWeight = fd.st > 0 ? '600' : '400';
        el.style.whiteSpace = 'pre-wrap';
        el.textContent = n.txt.s.replace(/<color=[^>]+>/gi, '').replace(/<\/color>/gi, '');
        if (n.ol) {
          el.style.textShadow = `${n.ol.d[0]}px ${-n.ol.d[1]}px 0 ${rgba(n.ol.c)}`;
        }
        textNodes[key][i] = el;
      }
      if (n.btn) {
        el.classList.add('ui-btn');
        el.dataset.node = String(i);
        const action = BUTTONS[key][i];
        if (action) {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            handleAction(action, key, i);
          });
        }
      }
      layer.appendChild(el);
    }

    buildLists(key, layer);
    updateUserInfo(key);
  }

  function updateUserInfo(key) {
    const data = DATA[key];
    const setText = (idx, value) => {
      const el = textNodes[key][idx];
      if (el) el.textContent = value;
    };
    if (key === 'level1') {
      setText(34, settings.name || '玩家');
      setText(35, '0/0');
      setText(36, '0/0');
      setText(37, '0 GP');
      setText(38, '0 DC点');
    } else {
      setText(20, settings.name || '玩家');
      setText(21, '0/0');
      setText(22, '0/0');
      setText(23, '0 GP');
      setText(24, '0 DC点');
    }
  }

  // ---------------- 滚动列表 ----------------
  function findChildren(data, parent) {
    const out = [];
    data.nodes.forEach((n, i) => { if (n.p === parent) out.push(i); });
    return out;
  }

  function findIcon(data, parent, depth = 0) {
    for (const i of findChildren(data, parent)) {
      const n = data.nodes[i];
      if (n.img && n.img.c[3] > 0.02 && n.img.w >= 40 && n.img.h >= 20) return n.img.f;
      if (depth < 2) {
        const sub = findIcon(data, i, depth + 1);
        if (sub) return sub;
      }
    }
    return null;
  }

  function findPrice(data, parent, depth = 0) {
    for (const i of findChildren(data, parent)) {
      const n = data.nodes[i];
      const s = n.txt && n.txt.s;
      if (s && /DC|GP|点|次|天|月/i.test(s) && !/等级/.test(s)) return s;
      if (depth < 2) {
        const sub = findPrice(data, i, depth + 1);
        if (sub) return sub;
      }
    }
    return '';
  }

  function buildLists(key, layer) {
    const data = DATA[key];
    const cfg = SCROLL[key];
    const frame = cssRect(data.nodes[cfg.node].r);
    const box = document.createElement('div');
    box.className = 'lobby-list';
    box.style.cssText = `left:${frame.left}px;top:${frame.top}px;width:${frame.w}px;height:${frame.h}px`;
    layer.appendChild(box);

    const tabs = {};
    lists[key] = tabs;

    for (const tab of ['weapon', 'player', 'tool']) {
      const scroller = document.createElement('div');
      scroller.className = 'lobby-scroller';
      scroller.dataset.tab = tab;
      box.appendChild(scroller);

      const parent = cfg[tab];
      const items = parent >= 0 ? findChildren(data, parent) : [];
      const usable = items.filter((i) => {
        const n = data.nodes[i];
        return n.n !== 'Content' && (n.img || n.btn || findIcon(data, i));
      });

      if (tab === 'tool') {
        const empty = document.createElement('div');
        empty.className = 'lobby-empty';
        empty.textContent = key === 'level1' ? '敬请期待  :)' : '敬请期待 ：）';
        scroller.appendChild(empty);
      } else {
        const content = document.createElement('div');
        content.className = 'lobby-content';
        const cols = 2;
        const CW = 243;
        const CH = 77;
        content.style.width = `${cols * CW}px`;
        content.style.height = `${Math.ceil(usable.length / cols) * CH}px`;
        usable.forEach((idx, k) => {
          const n = data.nodes[idx];
          const icon = findIcon(data, idx) || 's_level1_698.png';
          const price = key === 'level3' ? findPrice(data, idx) : '';
          const frameSprite = n.img && n.img.c[3] > 0.02 ? n.img.f : 's_level1_523.png';
          const card = document.createElement('div');
          card.className = 'item-card';
          card.style.left = `${(k % cols) * CW}px`;
          card.style.top = `${Math.floor(k / cols) * CH}px`;
          card.style.width = `${CW}px`;
          card.style.height = `${CH}px`;
          card.style.backgroundImage = `url("${SPR}${frameSprite}")`;
          card.dataset.name = n.n;
          card.dataset.icon = icon;

          const pic = document.createElement('img');
          pic.className = 'item-icon';
          pic.src = SPR + icon;
          pic.draggable = false;
          card.appendChild(pic);

          const name = document.createElement('div');
          name.className = 'item-name';
          name.textContent = n.n;
          card.appendChild(name);

          if (price) {
            const p = document.createElement('div');
            p.className = 'item-price';
            p.textContent = price;
            card.appendChild(p);
          }

          card.addEventListener('click', () => selectCard(card, n.n, icon, tab));
          content.appendChild(card);
          cardIcon.set(`${key}:${idx}`, icon);
          itemMeta.set(`${key}:${idx}`, { name: n.n, tab });
        });
        scroller.appendChild(content);
      }
      tabs[tab] = scroller;
    }
    setTab(key, tabState[key]);
  }

  function selectCard(card, name, icon, tab) {
    const box = card.parentElement;
    for (const el of box.querySelectorAll('.item-card.sel')) el.classList.remove('sel');
    card.classList.add('sel');
    if (tab === 'weapon') {
      selection = { name, icon, weapon: mapWeapon(name) };
      const bagImg = textNodes.level1[9];
      const bagName = textNodes.level1[10];
      if (bagImg && currentScene === 'level1') {
        bagImg.style.backgroundImage = `url("${SPR}${icon}")`;
      }
      if (bagName) bagName.textContent = name;
    }
  }

  function setTab(key, tab) {
    tabState[key] = tab;
    const tabs = lists[key];
    if (!tabs) return;
    for (const t of Object.keys(tabs)) {
      tabs[t].style.display = t === tab ? 'block' : 'none';
      tabs[t].scrollTop = 0;
    }
    const layer = layers[key];
    if (!layer) return;
    for (const btn of layer.querySelectorAll('.ui-btn')) {
      const idx = Number(btn.dataset.node);
      const action = BUTTONS[key][idx];
      btn.classList.toggle('tab-active', action === `tab-${tab}`);
    }
  }

  // ---------------- 角色面板（仓库左侧） ----------------
  let charPanel = null;
  function ensureCharPanel() {
    if (charPanel) return charPanel;
    const data = DATA.level1;
    const kids = buildSkip(data);
    const wrap = document.createElement('div');
    wrap.className = 'lobby-char';
    wrap.style.display = 'none';
    const recurse = (i) => {
      const n = data.nodes[i];
      const r = cssRect(n.r);
      if (r.w > 0 && r.h > 0) {
        const el = document.createElement('div');
        el.className = 'ui-node';
        el.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.w}px;height:${r.h}px`;
        if (n.img && n.img.c[3] > 0.02) {
          el.style.backgroundImage = `url("${SPR}${n.img.f}")`;
          el.style.backgroundSize = '100% 100%';
        }
        if (n.txt && n.txt.s) {
          const a = textAlign(n.txt.al);
          el.classList.add('ui-text');
          el.style.display = 'flex';
          el.style.fontSize = `${(n.txt.sz * (n.sc || 1)).toFixed(2)}px`;
          el.style.color = rgba(n.txt.c);
          el.style.textAlign = a.textAlign;
          el.style.justifyContent = a.justifyContent;
          el.style.alignItems = a.alignItems;
          el.textContent = n.txt.s;
        }
        wrap.appendChild(el);
      }
      for (const c of kids[i] || []) recurse(c);
    };
    recurse(16);
    stage.appendChild(wrap);
    charPanel = wrap;
    return wrap;
  }

  function showCharPanel(show) {
    const p = ensureCharPanel();
    p.style.display = show ? 'block' : 'none';
    for (const btn of stage.querySelectorAll('.ui-btn')) {
      const idx = Number(btn.dataset.node);
      if (idx === 7 || idx === 8) {
        btn.classList.toggle('tab-active', show ? idx === 8 : idx === 7);
      }
    }
  }

  // ---------------- 场景切换 ----------------
  function showScene(key, keepOverlay = false) {
    for (const k of Object.keys(layers)) layers[k].style.display = k === key ? 'block' : 'none';
    currentScene = key;
    if (!keepOverlay) {
      closeJoin();
      closeHelp();
    }
    showCharPanel(false);
  }

  function handleAction(action, key, idx) {
    switch (action) {
      case 'tab-weapon': setTab(key, 'weapon'); break;
      case 'tab-player': setTab(key, 'player'); break;
      case 'tab-tool': setTab(key, 'tool'); break;
      case 'shop': showScene('level3'); break;
      case 'house': showScene('level1'); break;
      case 'play': openJoin(); break;
      case 'help': openHelp(key); break;
      case 'bag': showCharPanel(false); break;
      case 'player-panel': showCharPanel(true); break;
      default: break;
    }
  }

  // ---------------- 加入战场对话框 ----------------
  const joinLayer = document.createElement('div');
  joinLayer.className = 'lobby-overlay join-overlay';
  joinLayer.style.display = 'none';
  stage.appendChild(joinLayer);

  const backdrop = document.createElement('div');
  backdrop.className = 'join-backdrop';
  backdrop.style.backgroundImage = `url("${SPR}s_level1_487.png")`;
  joinLayer.appendChild(backdrop);

  const DIALOG = { left: 190.5, top: 156, w: 441, h: 306 };
  const dialog = document.createElement('div');
  dialog.className = 'join-dialog';
  dialog.style.cssText = `left:${DIALOG.left}px;top:${DIALOG.top}px;width:${DIALOG.w}px;height:${DIALOG.h}px`;
  dialog.style.backgroundImage = `url("${SPR}s_level1_675.png")`;
  joinLayer.appendChild(dialog);

  function addLabel(text, left, top) {
    const el = document.createElement('div');
    el.className = 'join-label';
    el.textContent = text;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    dialog.appendChild(el);
    return el;
  }

  const nameInput = document.createElement('input');
  nameInput.className = 'join-name';
  nameInput.type = 'text';
  nameInput.maxLength = 14;
  nameInput.autocomplete = 'off';
  nameInput.placeholder = '请输入昵称';
  nameInput.value = settings.name || '';
  nameInput.style.left = '147px';
  nameInput.style.top = '154px';
  nameInput.style.width = '232px';
  nameInput.style.height = '30px';
  dialog.appendChild(nameInput);

  const serverWrap = document.createElement('div');
  serverWrap.className = 'join-row';
  serverWrap.style.top = '184px';
  serverWrap.style.left = '40px';
  const serverLabel = document.createElement('span');
  serverLabel.textContent = '服务器';
  const serverInput = document.createElement('input');
  serverInput.type = 'text';
  serverInput.className = 'join-input';
  serverInput.placeholder = isFileApp ? '服务器局域网地址，如 192.168.1.100:8080' : '留空自动连接当前服务端';
  serverInput.value = settings.server || '';
  serverInput.autocomplete = 'off';
  if (isTouch) {
    serverInput.setAttribute('inputmode', 'url');
    serverInput.setAttribute('autocapitalize', 'off');
    serverInput.setAttribute('autocorrect', 'off');
  }
  serverWrap.appendChild(serverLabel);
  serverWrap.appendChild(serverInput);
  dialog.appendChild(serverWrap);

  const sensRow = document.createElement('div');
  sensRow.className = 'join-row';
  sensRow.style.top = '206px';
  sensRow.style.left = '40px';
  const sensLabel = document.createElement('span');
  sensLabel.textContent = '灵敏度';
  const sensInput = document.createElement('input');
  sensInput.type = 'range';
  sensInput.min = '0.2';
  sensInput.max = '3';
  sensInput.step = '0.05';
  sensInput.value = String(settings.sens || 1);
  const sensVal = document.createElement('b');
  sensVal.textContent = Number(sensInput.value).toFixed(2);
  sensRow.appendChild(sensLabel);
  sensRow.appendChild(sensInput);
  sensRow.appendChild(sensVal);
  dialog.appendChild(sensRow);

  const qualityRow = document.createElement('div');
  qualityRow.className = 'join-row';
  qualityRow.style.top = '228px';
  qualityRow.style.left = '40px';
  const qualityLabel = document.createElement('span');
  qualityLabel.textContent = '画质';
  const highBtn = document.createElement('button');
  highBtn.className = 'join-seg';
  highBtn.textContent = '高';
  highBtn.dataset.q = 'high';
  const lowBtn = document.createElement('button');
  lowBtn.className = 'join-seg';
  lowBtn.textContent = '低';
  lowBtn.dataset.q = 'low';
  qualityRow.appendChild(qualityLabel);
  qualityRow.appendChild(highBtn);
  qualityRow.appendChild(lowBtn);
  dialog.appendChild(qualityRow);

  const hint = document.createElement('div');
  hint.className = 'join-hint';
  hint.style.left = '40px';
  hint.style.top = '252px';
  hint.textContent = isFileApp ? '填写服务端地址后点击「确定」加入战场' : '点击「确定」加入战场';
  dialog.appendChild(hint);

  const confirmBtn = document.createElement('div');
  confirmBtn.className = 'join-btn-sprite ui-btn';
  confirmBtn.style.cssText = `left:330px;top:268px;width:84px;height:33px;background-image:url("${SPR}s_level1_498.png")`;
  confirmBtn.title = '确定';
  dialog.appendChild(confirmBtn);

  const backBtn = document.createElement('div');
  backBtn.className = 'join-btn-sprite ui-btn';
  backBtn.style.cssText = `left:40px;top:268px;width:84px;height:33px;background-image:url("${SPR}s_level1_684.png")`;
  backBtn.title = '取消';
  dialog.appendChild(backBtn);

  function setQuality(q) {
    settings.quality = q === 'low' ? 'low' : 'high';
    highBtn.classList.toggle('on', settings.quality === 'high');
    lowBtn.classList.toggle('on', settings.quality === 'low');
    onSettings?.({ quality: settings.quality });
  }
  setQuality(settings.quality);

  if (settings.sens) sensInput.value = String(settings.sens);
  sensVal.textContent = Number(sensInput.value).toFixed(2);

  sensInput.addEventListener('input', () => {
    settings.sens = Number(sensInput.value) || 1;
    sensVal.textContent = settings.sens.toFixed(2);
    onSettings?.({ sens: settings.sens });
  });
  highBtn.addEventListener('click', () => setQuality('high'));
  lowBtn.addEventListener('click', () => setQuality('low'));

  nameInput.addEventListener('input', () => {
    settings.name = nameInput.value.trim().slice(0, 14);
    onSettings?.({ name: settings.name });
    updateUserInfo('level1');
    updateUserInfo('level3');
  });
  serverInput.addEventListener('input', () => {
    settings.server = serverInput.value.trim();
    onSettings?.({ server: settings.server });
  });

  function openJoin() {
    if (joining) return;
    closeHelp();
    joinLayer.style.display = 'block';
    nameInput.value = settings.name || '';
    serverInput.value = settings.server || '';
    hint.textContent = isFileApp ? '填写服务端地址后点击「确定」加入战场' : '点击「确定」加入战场';
    setTimeout(() => {
      if (!isTouch) nameInput.focus();
    }, 30);
  }

  function closeJoin() {
    if (joining) return;
    joinLayer.style.display = 'none';
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  backBtn.addEventListener('click', (e) => { e.stopPropagation(); closeJoin(); });
  backdrop.addEventListener('click', () => closeJoin());
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); startJoin(); }
  });
  serverInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); startJoin(); }
  });

  function startJoin() {
    if (joining) return;
    const name = nameInput.value.trim().slice(0, 14);
    const server = serverInput.value.trim();
    if (!name) {
      hint.textContent = '请输入昵称';
      hint.classList.add('bad');
      nameInput.focus();
      return;
    }
    if (isFileApp && !server) {
      hint.textContent = '请填写服务端地址，例如 192.168.1.100:8080';
      hint.classList.add('bad');
      serverInput.focus();
      return;
    }
    hint.classList.remove('bad');
    settings.name = name;
    settings.server = server;
    settings.sens = Number(sensInput.value) || 1;
    onSettings?.({ name, server, sens: settings.sens, quality: settings.quality });
    joining = true;
    startLoading();
    onJoin?.({ name, server, sens: settings.sens, quality: settings.quality });
  }
  confirmBtn.addEventListener('click', (e) => { e.stopPropagation(); startJoin(); });

  // ---------------- 帮助面板 ----------------
  const helpLayer = document.createElement('div');
  helpLayer.className = 'lobby-overlay help-overlay';
  helpLayer.style.display = 'none';
  stage.appendChild(helpLayer);

  const helpBack = document.createElement('div');
  helpBack.className = 'help-backdrop';
  helpBack.style.backgroundImage = `url("${SPR}s_level1_487.png")`;
  helpLayer.appendChild(helpBack);

  const helpDialog = document.createElement('div');
  helpDialog.className = 'help-dialog';
  helpDialog.style.cssText = 'left:76px;top:77px;width:669px;height:465px;background-image:url("' + SPR + 's_level1_609.png")';
  helpLayer.appendChild(helpDialog);

  const helpText = document.createElement('div');
  helpText.className = 'help-text';
  const HELP_SRC = LEVEL1.nodes[936].txt.s;
  helpText.textContent = HELP_SRC.replace(/<color=[^>]+>/gi, '').replace(/<\/color>/gi, '');
  helpDialog.appendChild(helpText);

  const helpOk = document.createElement('div');
  helpOk.className = 'join-btn-sprite ui-btn';
  helpOk.style.cssText = `left:371px;top:489px;width:84px;height:33px;background-image:url("${SPR}s_level1_498.png")`;
  helpLayer.appendChild(helpOk);

  function openHelp() {
    closeJoin();
    helpLayer.style.display = 'block';
  }
  function closeHelp() {
    helpLayer.style.display = 'none';
  }
  helpOk.addEventListener('click', (e) => { e.stopPropagation(); closeHelp(); });
  helpBack.addEventListener('click', () => closeHelp());

  // ---------------- 加载 / 连接画面 ----------------
  const loadLayer = document.createElement('div');
  loadLayer.className = 'lobby-overlay loading-overlay';
  loadLayer.style.display = 'none';
  stage.appendChild(loadLayer);

  const loadBg = document.createElement('div');
  loadBg.className = 'loading-bg';
  loadBg.style.backgroundImage = `url("${SPR}s_level1_708.png")`;
  loadLayer.appendChild(loadBg);

  const loadLogo = document.createElement('div');
  loadLogo.className = 'loading-logo';
  loadLogo.style.backgroundImage = `url("${SPR}s_level1_550.png")`;
  loadLayer.appendChild(loadLogo);

  const loadText = document.createElement('div');
  loadText.className = 'loading-text';
  loadText.textContent = '正在连接服务器…';
  loadLayer.appendChild(loadText);

  const loadBar = document.createElement('div');
  loadBar.className = 'loading-bar';
  loadBar.style.backgroundImage = `url("${SPR}s_level1_508.png")`;
  const loadFill = document.createElement('div');
  loadFill.className = 'loading-fill';
  loadBar.appendChild(loadFill);
  loadLayer.appendChild(loadBar);

  function startLoading() {
    loadLayer.style.display = 'block';
    loadFill.style.width = '6%';
    setTimeout(() => { loadFill.style.width = '82%'; }, 120);
  }
  function stopLoading() {
    loadLayer.style.display = 'none';
    joining = false;
    loadFill.style.width = '0%';
  }

  // ---------------- 提示条 ----------------
  const toast = document.createElement('div');
  toast.className = 'lobby-toast';
  stage.appendChild(toast);
  let toastTimer = 0;
  function setStatus(msg, kind = '') {
    toast.textContent = msg || '';
    toast.className = 'lobby-toast' + (kind ? ' ' + kind : '');
    toast.style.display = msg ? 'block' : 'none';
    clearTimeout(toastTimer);
    if (msg) toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 4200);
  }

  // ---------------- 初始化 ----------------
  renderScene('level1');
  renderScene('level3');
  showScene('level1', true);
  setTab('level1', 'weapon');
  setTab('level3', 'weapon');

  // 默认展示第一件武器（与原版仓库一致）
  const first = layers.level1.querySelector('.lobby-scroller[data-tab="weapon"] .item-card');
  if (first) selectCard(first, first.dataset.name, first.dataset.icon, 'weapon');

  document.addEventListener('pointerdown', () => {
    // 仅用于解锁浏览器音频，真正的 BGM 由 main.js 控制
  }, { once: true });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (joinLayer.style.display === 'block' && !joining) closeJoin();
      else if (helpLayer.style.display === 'block') closeHelp();
    }
  });

  if (isTouch) document.body.classList.add('is-touch');

  return {
    root,
    stage,
    selection: () => selection,
    show() { root.classList.remove('hidden'); fitStage(); },
    hide() { root.classList.add('hidden'); stopLoading(); },
    openJoin,
    startLoading,
    stopLoading,
    setStatus,
    get scene() { return currentScene; },
    destroy() {
      window.removeEventListener('resize', fitStage);
      root.innerHTML = '';
    },
  };
}
