import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const source = JSON.parse(fs.readFileSync('contracts/contribution.source.json', 'utf8'));
assert.equal(source.repository, 'StuHelper/stuhelper-storage-contribution');
assert.match(source.revision, /^[a-f0-9]{40}$/);
assert.equal(createHash('sha256').update(fs.readFileSync('src/api/contribution.ts')).digest('hex'), source.browser_sha256);
const contract = fs.readFileSync('contracts/contribution.openapi.json');
assert.equal(createHash('sha256').update(contract).digest('hex'), source.sha256);
assert.equal(JSON.parse(contract).info.version, source.version);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stuhelper-web-contribution-contract-'));
try {
  const output = path.join(temporary, 'contribution.gen.ts');
  execFileSync('pnpm', ['exec', 'openapi-typescript', 'contracts/contribution.openapi.json', '-o', output], { stdio: 'inherit' });
  assert.equal(fs.readFileSync(output, 'utf8'), fs.readFileSync('src/api/contribution.gen.ts', 'utf8'));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log(`PASS: contribution contract ${source.revision}`);
