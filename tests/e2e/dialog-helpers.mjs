// Records the open dialog's visible text on every animation frame until the dialog leaves
// the page. Start it before the action that closes the dialog; it catches content
// that changes only during the closing animation.
export function recordDialogUntilClosed(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const texts = [];
    const sample = () => {
      const node = document.querySelector('[role="dialog"]');
      if (!node) { resolve(texts); return; }
      texts.push(node instanceof HTMLElement ? node.innerText : '');
      requestAnimationFrame(sample);
    };
    sample();
  }));
}
