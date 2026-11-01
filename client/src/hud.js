// HUD 界面：血量、弹药、比分、击杀提示、计分板
import { WEAPONS } from '../../shared/constants.js';

export class HUD {
  constructor() {
    this.el = {
      health: document.getElementById('hp-bar'),
      healthVal: document.getElementById('hp-val'),
      ammo: document.getElementById('ammo'),
      weapon: document.getElementById('weapon-name'),
      scores: document.getElementById('scores'),
      time: document.getElementById('time'),
      stats: document.getElementById('stats'),
      killfeed: document.getElementById('killfeed'),
      toast: document.getElementById('toast'),
      scope: document.getElementById('scope'),
      scoreboard: document.getElementById('scoreboard'),
      scoreboardBody: document.getElementById('scoreboard-body'),
      death: document.getElementById('death'),
      deathCount: document.getElementById('death-count'),
      pause: document.getElementById('pause'),
      crosshair: document.getElementById('crosshair'),
      touch: document.getElementById('touch-controls'),
      hitmarker: document.getElementById('hitmarker'),
      damage: document.getElementById('damage-overlay'),
    };
    this._toastTimer = 0;
    this._killItems = [];
  }

  show() {
    document.getElementById('hud')?.classList.remove('hidden');
    document.getElementById('menu')?.classList.add('hidden');
  }

  setHealth(hp) {
    hp = Math.max(0, Math.round(hp));
    this.el.health.style.width = hp + '%';
    this.el.healthVal.textContent = hp;
    this.el.health.style.background = hp > 50 ? '#4caf50' : hp > 25 ? '#ff9800' : '#f44336';
  }

  setWeapon(w, mag, reserve, reloading) {
    this.el.weapon.textContent = WEAPONS[w]?.name || w;
    this.el.ammo.textContent = reloading ? '换弹中…' : `${mag} / ${reserve}`;
  }

  setScores(a, b) {
    this.el.scores.textContent = `${a} : ${b}`;
  }

  setTime(t) {
    const m = Math.floor(t / 60), s = t % 60;
    this.el.time.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  setStats(fps, ping) {
    this.el.stats.textContent = `${fps} FPS · ${ping} ms`;
  }

  hitmarker(head) {
    const h = this.el.hitmarker;
    h.style.display = 'block';
    h.style.borderColor = head ? '#ff5b5b' : '#fff';
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => { h.style.display = 'none'; }, 120);
  }

  damage() {
    const d = this.el.damage;
    d.style.opacity = '0.6';
    clearTimeout(this._dmgT);
    this._dmgT = setTimeout(() => { d.style.opacity = '0'; }, 200);
  }

  addKill(killer, victim, weapon, head, isMe, amIdead) {
    const div = document.createElement('div');
    div.className = 'kill-item';
    div.innerHTML = `<span class="killer">${killer}</span> <span class="wep">${weapon}</span> <span class="victim">${victim}</span>${head ? ' <span class="head">爆头</span>' : ''}`;
    this.el.killfeed.appendChild(div);
    this._killItems.push(div);
    if (this._killItems.length > 5) {
      const old = this._killItems.shift();
      old.remove();
    }
    setTimeout(() => {
      div.style.opacity = '0';
      setTimeout(() => div.remove(), 300);
    }, 4000);
  }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), 2000);
  }

  setScope(on) {
    this.el.scope.style.display = on ? 'block' : 'none';
    this.el.crosshair.style.display = on ? 'none' : 'block';
  }

  setScoreboardVisible(v) {
    this.el.scoreboard.style.display = v ? 'block' : 'none';
  }

  showScoreboard(players, myId) {
    const rows = players.map((p) => {
      const me = p.i === myId ? 'me' : '';
      return `<tr class="${me}"><td>${p.n}</td><td>${p.k}</td><td>${p.d}</td><td>${p.hp}</td></tr>`;
    }).join('');
    this.el.scoreboardBody.innerHTML = rows;
  }

  showDeath(killer, seconds) {
    this.el.death.classList.remove('hidden');
    this.el.deathCount.textContent = killer ? `被 ${killer} 击杀` : '你已阵亡';
    this._deathSec = seconds;
    this._deathT = setInterval(() => {
      this._deathSec--;
      this.el.deathCount.textContent = (killer ? `被 ${killer} 击杀` : '你已阵亡') + ` · ${this._deathSec}s 后复活`;
      if (this._deathSec <= 0) clearInterval(this._deathT);
    }, 1000);
  }

  updateDeathCount(sec) {
    this._deathSec = Math.ceil(sec);
  }

  hideDeath() {
    this.el.death.classList.add('hidden');
    clearInterval(this._deathT);
  }

  setPause(v) {
    this.el.pause.style.display = v ? 'flex' : 'none';
  }

  enableTouch() {
    this.el.touch.classList.remove('hidden');
  }
}
