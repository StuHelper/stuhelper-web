import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const source = JSON.parse(fs.readFileSync('contracts/storage.source.json', 'utf8'));
assert.equal(source.repository, 'StuHelper/stuhelper-storage');
assert.match(source.revision, /^[a-f0-9]{40}$/);
assert.equal(createHash('sha256').update(fs.readFileSync('src/api/custody.ts')).digest('hex'), source.custody_browser_sha256);
const contract = fs.readFileSync('contracts/storage.openapi.json');
assert.equal(createHash('sha256').update(contract).digest('hex'), source.sha256);
assert.equal(JSON.parse(contract).info.version, source.version);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stuhelper-web-storage-contract-'));
try {
  const output = path.join(temporary, 'storage.gen.ts');
  execFileSync('pnpm', ['exec', 'openapi-typescript', 'contracts/storage.openapi.json', '-o', output], { stdio: 'inherit' });
  assert.equal(fs.readFileSync(output, 'utf8'), fs.readFileSync('src/api/storage.gen.ts', 'utf8'));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log(`PASS: storage contract ${source.revision}`);
