import process from 'node:process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const platform = process.argv[2] === 'platform';
const name = platform ? 'platform' : 'session';
const root = fs.existsSync('apps/web-antd') ? 'apps/web-antd/' : '';
const generated = `${root}src/api/${name}.gen.ts`;
const contractPath = `contracts/${name}.openapi.${platform ? 'yaml' : 'json'}`;
const source = JSON.parse(fs.readFileSync(`contracts/${name}.source.json`, 'utf8'));
const contract = fs.readFileSync(contractPath);
assert.equal(source.repository, platform ? 'StuHelper/stuhelper-platform' : 'StuHelper/stuhelper-backend');
assert.match(source.revision, /^[0-9a-f]{40}$/);
const version = platform ? /^ {2}version: (.+)$/m.exec(contract.toString())?.[1] : JSON.parse(contract).info.version;
assert.equal(source.version, version);
assert.equal(crypto.createHash('sha256').update(contract).digest('hex'), source.sha256);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stuhelper-session-contract-'));
try {
  const target = path.join(temporary, 'session.gen.ts');
  execFileSync('pnpm', ['exec', 'openapi-typescript', contractPath, '-o', target], { stdio: 'inherit' });
  assert.equal(fs.readFileSync(generated, 'utf8'), fs.readFileSync(target, 'utf8'));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log(`PASS: ${name} contract provenance and generated types`);
