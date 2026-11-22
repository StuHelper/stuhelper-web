import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { env } from 'node:process';

export async function captureHomepage(target, filename, { dialog = false } = {}) {
  if (!env.TEACHERWEBUI_SHOTS) return;
  mkdirSync(env.TEACHERWEBUI_SHOTS, { recursive: true });
  const options = { path: join(env.TEACHERWEBUI_SHOTS, filename), animations: 'disabled' };
  if (dialog) return target.screenshot(options);

  // Capture the section at its document position. Scrolling the element to the
  // top of the viewport would put the sticky navigation over its heading.
  const page = target.page();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const clip = await target.boundingBox();
  if (!clip) throw new Error(`Cannot capture the hidden section ${filename}`);
  await page.screenshot({ ...options, fullPage: true, clip });
}
