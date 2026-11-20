/* global window, document */
// The page itself is never zoomed: two fingers on a phone (both thumbs on the controls, say) must
// not pinch it bigger, and a double tap must not either. Nearer and further is the game's own
// + and - buttons. The viewport tag and the touch-action rules in page.html ask for this; Safari
// on the iPhone leaves pinching to the user whatever the tag says, so its pinch gesture is stopped
// here, as is any move with two fingers down. If the page has been zoomed anyway (a browser can let
// the user force it), the viewport tag is written again so the browser fits the page back to the
// screen.
export function lockZoom() {
  const doc = document;
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) doc.addEventListener(ev, stop, { passive: false });
  doc.addEventListener('touchmove', (e) => {
    if ((e.touches && e.touches.length > 1) || (typeof e.scale === 'number' && e.scale !== 1)) stop(e);
  }, { passive: false });
  const meta = doc.querySelector('meta[name="viewport"]');
  const base = meta ? meta.getAttribute('content') || '' : '';
  let flip = false;
  const unzoom = () => {
    const vv = window.visualViewport;
    if (!meta || !vv || !(vv.scale > 1.01)) return;
    flip = !flip;
    // the same limits, spelled a little differently, make the browser apply them again
    meta.setAttribute('content', flip ? base.replace('initial-scale=1', 'initial-scale=1.0') : base);
  };
  if (window.visualViewport) window.visualViewport.addEventListener('resize', unzoom);
  doc.addEventListener('touchend', () => setTimeout(unzoom, 80), { passive: true });
  // the on-screen keyboard can leave the page scrolled when it closes: put it back in place
  doc.addEventListener('focusout', () => {
    setTimeout(() => {
      const a = doc.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    }, 120);
  });
}
