import { academicModules } from './academic-modules.mjs';
import { execFileSync } from 'node:child_process';

for (const module of academicModules) {
  execFileSync('pnpm', ['exec', 'openapi-typescript', `contracts/${module}.openapi.json`, '-o', `src/api/${module}.gen.ts`], { stdio: 'inherit' });
}
