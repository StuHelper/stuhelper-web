import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const admin = fs.existsSync('apps/web-antd');
const generated = admin ? 'apps/web-antd/src/api/verification.gen.ts' : 'src/api/verification.gen.ts';
const source = JSON.parse(fs.readFileSync('contracts/verification.source.json', 'utf8'));
assert.equal(source.repository, 'StuHelper/stuhelper-verification');
assert.match(source.revision, /^[a-f0-9]{40}$/);
assert.equal(source.version, '0.2.0');
assert.deepEqual(source.files, {
  'contracts/verification.openapi.yaml': 'contracts/verification.openapi.yaml',
  'sdk/verification.gen.ts': generated,
  'contracts/verification-cases.json': 'contracts/verification-cases.json',
});
assert.equal(crypto.createHash('sha256').update(fs.readFileSync('contracts/verification.openapi.yaml')).digest('hex'), source.sha256);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stuhelper-verification-snapshot-'));
try {
  const output = path.join(temporary, 'verification.gen.ts');
  execFileSync('pnpm', ['exec', 'openapi-typescript', path.resolve('contracts/verification.openapi.yaml'), '-o', output], { cwd: admin ? 'scripts/openapi' : '.', stdio: 'inherit' });
  assert.equal(fs.readFileSync(generated, 'utf8'), fs.readFileSync(output, 'utf8'));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log('PASS: verification snapshot digest, schema generation and declared source metadata; private-source byte comparison runs in the private integration check');
