// Copies provider contracts and generated SDK types from local provider checkouts at
// their current HEAD commit, then rewrites contracts/<name>.source.json.
// Usage: node scripts/sync-contracts.mjs <workspace-dir> [module ...]
// <workspace-dir> contains one checkout per provider repository (catalog, backend, ...).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

// Each entry maps provider files to snapshot files. The first file is the contract whose
// info.version is recorded. Formats follow the existing check scripts for each module.
const modules = {
  catalog: { repo: 'catalog', files: { 'contracts/catalog.openapi.json': 'contracts/catalog.openapi.json', 'sdk/catalog.gen.ts': 'src/api/catalog.gen.ts' } },
  reviews: { repo: 'reviews', files: { 'contracts/reviews.openapi.json': 'contracts/reviews.openapi.json', 'sdk/reviews.gen.ts': 'src/api/reviews.gen.ts' } },
  moderation: { repo: 'moderation', files: { 'contracts/moderation.openapi.json': 'contracts/moderation.openapi.json', 'sdk/moderation.gen.ts': 'src/api/moderation.gen.ts' } },
  resources: { repo: 'resources', files: { 'contracts/resources.openapi.json': 'contracts/resources.openapi.json', 'sdk/resources.gen.ts': 'src/api/resources.gen.ts' } },
  media: { repo: 'media', files: { 'contracts/media.openapi.json': 'contracts/media.openapi.json', 'sdk/media.gen.ts': 'src/api/media.gen.ts' } },
  favorites: { repo: 'favorites', files: { 'contracts/favorites.openapi.json': 'contracts/favorites.openapi.json', 'sdk/favorites.gen.ts': 'src/api/favorites.gen.ts' } },
  profiles: { repo: 'profiles', files: { 'contracts/profiles.openapi.json': 'contracts/profiles.openapi.json', 'sdk/profiles.gen.ts': 'src/api/profiles.gen.ts' } },
  'open-platform': { repo: 'open-platform', files: { 'contracts/open-platform.openapi.json': 'contracts/open-platform.openapi.json', 'sdk/open-platform.gen.ts': 'src/api/open-platform.gen.ts' } },
  'qq-binding': { repo: 'qq-binding', files: { 'contracts/qq-binding.openapi.json': 'contracts/qq-binding.openapi.json', 'sdk/qq-binding.gen.ts': 'src/api/qq-binding.gen.ts' } },
  billing: { repo: 'billing', files: { 'contracts/billing.openapi.json': 'contracts/billing.openapi.json', 'sdk/billing.gen.ts': 'src/api/billing.gen.ts' } },
  search: { repo: 'search', files: { 'contracts/search.openapi.json': 'contracts/search.openapi.json', 'sdk/search.gen.ts': 'src/api/search.gen.ts' } },
  groups: { repo: 'groups', files: { 'contracts/groups.openapi.json': 'contracts/groups.openapi.json', 'sdk/groups.gen.ts': 'src/api/groups.gen.ts' } },
  notifications: { repo: 'notifications', files: { 'contracts/notifications.openapi.json': 'contracts/notifications.openapi.json', 'sdk/notifications.gen.ts': 'src/api/notifications.gen.ts' } },
  session: { repo: 'backend', single: true, files: { 'contracts/session.openapi.json': 'contracts/session.openapi.json' }, extra: { generator: 'openapi-typescript@7.13.0' } },
  verification: { repo: 'verification', single: true, files: { 'contracts/verification.openapi.yaml': 'contracts/verification.openapi.yaml', 'sdk/verification.gen.ts': 'src/api/verification.gen.ts', 'contracts/verification-cases.json': 'contracts/verification-cases.json' } },
  platform: { repo: 'platform', single: true, files: { 'contracts/platform.openapi.yaml': 'contracts/platform.openapi.yaml', 'sdk/platform.gen.ts': 'src/api/platform.gen.ts', 'contracts/client-cases.json': 'contracts/client-cases.json' } },
};

const [workspace, ...selected] = process.argv.slice(2);
if (!workspace) throw new Error('Usage: node scripts/sync-contracts.mjs <workspace-dir> [module ...]');
const digest = content => crypto.createHash('sha256').update(content).digest('hex');
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });

for (const name of selected.length ? selected : Object.keys(modules)) {
  const spec = modules[name];
  if (!spec) throw new Error(`Unknown module: ${name}`);
  const checkout = path.resolve(workspace, spec.repo);
  // Files are read from the committed HEAD; uncommitted edits to them would make the record misleading.
  if (git(checkout, 'status', '--porcelain', '--', ...Object.keys(spec.files)).trim()) throw new Error(`Provider files have uncommitted changes: ${checkout}`);
  const revision = git(checkout, 'rev-parse', 'HEAD').trim();
  const sha256 = {};
  for (const [providerFile, clientFile] of Object.entries(spec.files)) {
    const content = git(checkout, 'show', `${revision}:${providerFile}`);
    fs.mkdirSync(path.dirname(clientFile), { recursive: true });
    fs.writeFileSync(clientFile, content);
    sha256[clientFile] = digest(content);
  }
  const contract = Object.values(spec.files)[0];
  const text = fs.readFileSync(contract, 'utf8');
  const version = contract.endsWith('.json') ? JSON.parse(text).info.version : /\n {2}version:\s*['"]?([^'"\n]+)/.exec(text)?.[1];
  if (!version) throw new Error(`Contract has no info.version: ${contract}`);
  const record = {
    repository: `StuHelper/stuhelper-${spec.repo}`,
    revision,
    version,
    ...(spec.single ? { sha256: sha256[contract], files: spec.files } : { files: spec.files, sha256 }),
    ...spec.extra,
  };
  fs.writeFileSync(`contracts/${name}.source.json`, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`${name}: ${revision} ${version}`);
}
