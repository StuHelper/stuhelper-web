import { execFileSync } from 'node:child_process';

for (const module of ['catalog', 'reviews', 'moderation']) {
  execFileSync('pnpm', ['exec', 'openapi-typescript', `contracts/${module}.openapi.json`, '-o', `src/api/${module}.gen.ts`], { stdio: 'inherit' });
}
