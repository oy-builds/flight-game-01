// Keyboard + mouse input. The game reads a plain control object each frame:
// pitch (-1..1, +1 nose up), roll (-1..1, +1 bank right), throttleDelta
// (per-second throttle change), brake, flaps, and one-shot actions.
export function createInput(canvas) {
  const keys = new Set();
  const state = {
    pitch: 0,
    roll: 0,
    throttleDelta: 0,
    brake: false,
    flaps: false,
    mouseX: 0,
    mouseY: 0,
    mouseActive: false,
    actions: [], // one-shot actions consumed by main.js each frame
  };

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyG') state.actions.push('gear');
    if (e.code === 'KeyF') state.actions.push('flaps');
    if (e.code === 'KeyR') state.actions.push('restart');
    if (e.code === 'KeyP') state.actions.push('pause');
    if (e.code === 'KeyM') state.actions.push('mute');
    if (e.code === 'KeyH') state.actions.push('help');
    if (e.code === 'Digit1') state.actions.push('mission-rings');
    if (e.code === 'Digit2') state.actions.push('mission-hop');
    if (e.code === 'Digit3') state.actions.push('mission-free');
    if (e.code === 'Enter' || e.code === 'Space') state.actions.push('confirm');
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    state.mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    state.mouseActive = true;
  }

  function onMouseLeave() {
    state.mouseActive = false;
  }

  function onBlur() {
    keys.clear();
    state.mouseActive = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);
  window.addEventListener('blur', onBlur);

  /** Recompute the held controls from the current keys and mouse. */
  function poll() {
    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowUp')) pitch += 1;
    if (keys.has('ArrowDown')) pitch -= 1;
    if (keys.has('ArrowLeft')) roll -= 1;
    if (keys.has('ArrowRight')) roll += 1;
    // Mouse steers gently when no arrow key is held.
    if (state.mouseActive && pitch === 0 && roll === 0) {
      roll = Math.max(-1, Math.min(1, state.mouseX * 1.4));
      pitch = Math.max(-1, Math.min(1, -state.mouseY * 1.1));
    }
    let throttleDelta = 0;
    if (keys.has('KeyW') || keys.has('ShiftLeft') || keys.has('ShiftRight')) throttleDelta += 0.9;
    if (keys.has('KeyS') || keys.has('ControlLeft') || keys.has('ControlRight')) throttleDelta -= 0.9;
    state.pitch = pitch;
    state.roll = roll;
    state.throttleDelta = throttleDelta;
    state.brake = keys.has('Space') || keys.has('KeyB');
    return state;
  }

  function takeActions() {
    const taken = state.actions;
    state.actions = [];
    return taken;
  }

  return { state, poll, takeActions };
}
