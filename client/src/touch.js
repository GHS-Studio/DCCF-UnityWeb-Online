// 移动端触屏控制：虚拟摇杆 + 视角滑动 + 射击/跳跃/换弹/切枪/开镜按钮
export class TouchControls {
  constructor(opts) {
    this.opts = opts;
    this.touch = document.getElementById('touch-controls');
    this.joystick = document.getElementById('joystick');
    this.joyKnob = document.getElementById('joy-knob');
    this.lookArea = document.getElementById('look-area');
    this.btnFire = document.getElementById('btn-fire');
    this.btnJump = document.getElementById('btn-jump');
    this.btnReload = document.getElementById('btn-reload');
    this.btnSwitch = document.getElementById('btn-switch');
    this.btnScope = document.getElementById('btn-scope');

    this.joyActive = false;
    this.joyId = null;
    this.joyCenter = { x: 0, y: 0 };
    this.lookId = null;
    this.lookLast = { x: 0, y: 0 };

    this._bind();
  }

  _bind() {
    // 摇杆
    this.joystick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joyActive = true;
      this.joyId = t.identifier;
      const rect = this.joystick.getBoundingClientRect();
      this.joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this._updateJoy(t.clientX, t.clientY);
    }, { passive: false });

    const joyMove = (e) => {
      if (!this.joyActive) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) {
          e.preventDefault();
          this._updateJoy(t.clientX, t.clientY);
        }
      }
    };
    this.joystick.addEventListener('touchmove', joyMove, { passive: false });

    const joyEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) {
          this.joyActive = false;
          this.joyId = null;
          this.joyKnob.style.transform = 'translate(0,0)';
          this.opts.onMove?.(0, 0);
        }
      }
    };
    this.joystick.addEventListener('touchend', joyEnd);
    this.joystick.addEventListener('touchcancel', joyEnd);

    // 视角滑动
    this.lookArea.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.lookId = t.identifier;
      this.lookLast = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    this.lookArea.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.lookId) {
          e.preventDefault();
          const dx = t.clientX - this.lookLast.x;
          const dy = t.clientY - this.lookLast.y;
          this.lookLast = { x: t.clientX, y: t.clientY };
          this.opts.onLook?.(dx, dy);
        }
      }
    }, { passive: false });

    this.lookArea.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.lookId) this.lookId = null;
      }
    });

    // 按钮
    this.btnFire.addEventListener('touchstart', (e) => { e.preventDefault(); this.opts.onFire?.(true); }, { passive: false });
    this.btnFire.addEventListener('touchend', (e) => { e.preventDefault(); this.opts.onFire?.(false); }, { passive: false });
    this.btnJump.addEventListener('touchstart', (e) => { e.preventDefault(); this.opts.onJump?.(); }, { passive: false });
    this.btnReload.addEventListener('touchstart', (e) => { e.preventDefault(); this.opts.onReload?.(); }, { passive: false });
    this.btnSwitch.addEventListener('touchstart', (e) => { e.preventDefault(); this.opts.onSwitch?.(); }, { passive: false });
    this.btnScope.addEventListener('touchstart', (e) => { e.preventDefault(); this.opts.onScope?.(); }, { passive: false });
  }

  _updateJoy(x, y) {
    const dx = x - this.joyCenter.x;
    const dy = y - this.joyCenter.y;
    const max = 45;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, max);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;
    this.joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;
    const fwd = -ky / max;
    const strafe = kx / max;
    this.opts.onMove?.(fwd, strafe);
  }

  dispose() {
    // 事件监听器随 DOM 移除自动清理
  }
}
