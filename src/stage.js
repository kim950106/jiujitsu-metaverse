/* global window */
// The stage is the box everything is drawn in (#stage). On an upright phone it is turned on its
// side while playing, so the game is landscape whatever the phone's rotation lock says. Pointer
// positions then have to be read in the stage's own frame, not the screen's.
export const stage = { turn: 0 }; // 0 upright, 1 a quarter clockwise, -1 a quarter the other way

// Where a pointer event is, in stage pixels.
export function point(e) {
  if (stage.turn === 1) return { x: e.clientY, y: window.innerWidth - e.clientX };
  if (stage.turn === -1) return { x: window.innerHeight - e.clientY, y: e.clientX };
  return { x: e.clientX, y: e.clientY };
}

// An element's box in stage pixels.
export function box(el) {
  const r = el.getBoundingClientRect();
  if (stage.turn === 1) return { left: r.top, top: window.innerWidth - r.right, width: r.height, height: r.width };
  if (stage.turn === -1) return { left: window.innerHeight - r.bottom, top: r.left, width: r.height, height: r.width };
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
