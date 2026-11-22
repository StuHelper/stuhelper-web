import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const contractPath = 'contracts/legal.openapi.json';
const sdkPath = 'src/api/legal.gen.ts';
const source = JSON.parse(fs.readFileSync('contracts/legal.source.json', 'utf8'));
const contract = fs.readFileSync(contractPath);
const sdk = fs.readFileSync(sdkPath);
const sha256 = content => createHash('sha256').update(content).digest('hex');

assert.equal(source.repository, 'StuHelper/stuhelper-backend');
assert.match(source.revision, /^[0-9a-f]{40}$/);
assert.equal(source.version, JSON.parse(contract).info.version);
assert.deepEqual(source.files, {
  [contractPath]: contractPath,
  'sdk/legal/legal.gen.ts': sdkPath,
});
assert.deepEqual(source.sha256, {
  [contractPath]: sha256(contract),
  [sdkPath]: sha256(sdk),
});

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stuhelper-legal-contract-'));
try {
  const output = path.join(temporary, 'legal.gen.ts');
  execFileSync('pnpm', ['exec', 'openapi-typescript', contractPath, '-o', output], { stdio: 'inherit' });
  assert(fs.readFileSync(output).equals(sdk), 'Legal SDK differs from the generated contract types');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log('PASS: legal snapshot source record, digests and generated types');
