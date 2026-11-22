import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { env } from 'node:process';

export async function captureHomepage(target, filename) {
  if (!env.TEACHERWEBUI_SHOTS) return;
  mkdirSync(env.TEACHERWEBUI_SHOTS, { recursive: true });
  // These are component crops. Keep the surrounding sticky app chrome out of
  // the crop without changing the target's size or position during capture.
  await target.screenshot({
    path: join(env.TEACHERWEBUI_SHOTS, filename),
    animations: 'disabled',
    style: '.skip-link, .shell > header.nav, .shell > nav.tabbar, .switcher { visibility: hidden !important; }',
  });
}
