import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const generated = fs.existsSync('apps/web-antd') ? 'apps/web-antd/src/api/session.gen.ts' : 'src/api/session.gen.ts';
const source = JSON.parse(fs.readFileSync('contracts/session.source.json', 'utf8'));
const contract = fs.readFileSync('contracts/session.openapi.json');
assert.equal(source.repository, 'StuHelper/stuhelper-backend');
assert.match(source.revision, /^[0-9a-f]{40}$/);
assert.equal(source.version, JSON.parse(contract).info.version);
assert.equal(crypto.createHash('sha256').update(contract).digest('hex'), source.sha256);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stuhelper-session-contract-'));
try {
  const target = path.join(temporary, 'session.gen.ts');
  execFileSync('pnpm', ['exec', 'openapi-typescript', 'contracts/session.openapi.json', '-o', target], { stdio: 'inherit' });
  assert.equal(fs.readFileSync(generated, 'utf8'), fs.readFileSync(target, 'utf8'));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log('PASS: session contract provenance and generated types');
