import { afterEach, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { webcrypto } from 'node:crypto';
import {
  attribute,
  Client,
  Mutation,
  ResourceError,
  shown,
  snapshot,
  Upload,
  type Field,
  type MediaVersion,
} from './api';
const resource = {
  id: 'resource',
  revision: 1,
  state: 'draft',
  download_allowed: false,
  access_reason: 'not_published',
  owned: true,
};
const media: MediaVersion = {
  id: 'version',
  file_id: 'file',
  number: 1,
  revision: 1,
  upload_id: 'upload',
  filename: 'lecture.txt',
  content_type: 'text/plain',
  size: 5,
  sha256: 'a'.repeat(64),
  state: 'created',
  approved: false,
  upload_expires_at: '2030-01-01T00:00:00Z',
  retain_until: '2030-01-02T00:00:00Z',
  cleanup_complete: false,
  error_code: '',
};
afterEach(() => vi.unstubAllGlobals());
it('retries unknown writes with the frozen nested payload and original key', async () => {
  const calls: RequestInit[] = [];
  const client = new Client(async (_url, init) => {
    calls.push(init ?? {});
    if (calls.length === 1) throw new TypeError('lost response');
    return Response.json(resource);
  });
  const mutation = new Mutation(client);
  const input = reactive({
    metadata: { attributes: { year: { number: 2025 } } },
  });
  await expect(mutation.run('', 'Resource', input)).rejects.toMatchObject({
    uncertain: true,
  });
  input.metadata.attributes.year.number = 2026;
  await expect(mutation.run('/other', 'Resource', input)).rejects.toMatchObject(
    { code: 'retry_required' },
  );
  await mutation.run('', 'Resource', input);
  expect(calls[0]?.body).toBe(calls[1]?.body);
  expect(calls[0]?.headers).toEqual(calls[1]?.headers);
  expect(mutation.uncertain).toBe(false);
});
it('releases a known rejected mutation and clears private state even for non-JSON denial', async () => {
  const clear = vi.fn();
  const client = new Client(
    async () => new Response('login expired', { status: 401 }),
    clear,
  );
  const mutation = new Mutation(client);
  await expect(mutation.run('', 'Resource', {})).rejects.toMatchObject({
    code: 'authentication_required',
    uncertain: false,
  });
  expect(clear).toHaveBeenCalledOnce();
  expect(mutation.uncertain).toBe(false);
});
it('rejects incompatible response shapes and retains unknown write outcomes', async () => {
  const client = new Client(async () =>
    Response.json({ ...resource, revision: 'wrong' }),
  );
  const mutation = new Mutation(client);
  await expect(mutation.run('', 'Resource', {})).rejects.toMatchObject({
    code: 'incompatible',
    uncertain: true,
  });
  expect(mutation.uncertain).toBe(true);
});
it('passes current host credentials and cancellation on every request', async () => {
  let credential = 'first';
  const seen: string[] = [];
  const signals: AbortSignal[] = [];
  const host: typeof fetch = async (_input, init) => {
    seen.push(credential);
    if (init?.signal) signals.push(init.signal);
    return Response.json(resource);
  };
  const client = new Client(host),
    controller = new AbortController();
  await client.json('/items/resource', 'Resource', {
    signal: controller.signal,
  });
  credential = 'second';
  await client.json('/items/resource', 'Resource', {
    signal: controller.signal,
  });
  expect(seen).toEqual(['first', 'second']);
  controller.abort();
  expect(signals.every((s) => s.aborted)).toBe(true);
});
it('resolves a lost upload response by querying state without sending bytes again', async () => {
  vi.stubGlobal('crypto', webcrypto);
  let sent = 0,
    state = 'created';
  const keys: string[] = [];
  const client = new Client(async (_input, init) => {
    const method = init?.method;
    if (method === 'POST') return Response.json(media);
    if (method === 'PUT') {
      sent++;
      keys.push(new Headers(init?.headers).get('Idempotency-Key') ?? '');
      state = 'awaiting_approval';
      throw new TypeError('lost completion');
    }
    return Response.json({
      ...media,
      state,
      healthy: 1,
      desired: 3,
      storage_state: 'pending',
    });
  });
  const upload = new Upload(
    client,
    new File(['hello'], 'lecture.txt', { type: 'text/plain' }),
    'custom-purpose',
  );
  await expect(upload.run()).rejects.toBeInstanceOf(ResourceError);
  expect((await upload.run()).state).toBe('awaiting_approval');
  expect(sent).toBe(1);
  expect(keys[0]).toBeTruthy();
});
it('keeps cancellation pending until the server confirms it', async () => {
  let deletes = 0;
  const client = new Client(async (_input, init) => {
    if (init?.method === 'DELETE') {
      deletes++;
      if (deletes === 1) throw new TypeError('lost cancel');
      return Response.json({ ...media, state: 'cancelled' });
    }
    return Response.json(media);
  });
  const upload = new Upload(
    client,
    new File(['hello'], 'lecture.txt'),
    'purpose',
  );
  upload.version = media;
  await expect(upload.cancel()).rejects.toMatchObject({ uncertain: true });
  expect(upload.version.state).toBe('created');
  expect((await upload.cancel()).state).toBe('cancelled');
});
it('preserves a completed upload when cancellation is rejected', async () => {
  const client = new Client(async (_input, init) =>
    init?.method === 'DELETE'
      ? Response.json({}, { status: 409 })
      : Response.json({
          ...media,
          state: 'awaiting_approval',
          healthy: 1,
          desired: 3,
          storage_state: 'pending',
        }),
  );
  const upload = new Upload(
    client,
    new File(['hello'], 'lecture.txt'),
    'purpose',
  );
  upload.version = media;
  expect((await upload.cancel()).state).toBe('awaiting_approval');
  expect(upload.canceled).toBe(false);
});
it('uses configured fields without category-name branches and preserves missing values', () => {
  const field: Field = {
    key: 'edition',
    names: { 'zh-CN': '版次' },
    kind: 'integer',
    required: false,
    filterable: true,
    groupable: true,
    min: 1900,
    max: 2100,
  };
  expect(attribute(field, '')).toBeUndefined();
  expect(attribute(field, '2025')).toEqual({ number: 2025 });
  expect(() => attribute(field, '2025.5')).toThrow();
  expect(shown(field, { number: 2025 }, 'en-US')).toBe('2025');
  expect(snapshot(reactive({ x: { value: 3 }, optional: undefined }))).toEqual({
    x: { value: 3 },
  });
});

it('requests safe reuse and never sends bytes for reused or still pending content', async () => {
 vi.stubGlobal('crypto',webcrypto);const methods:string[]=[];let done=false;let payload:unknown;
 const client=new Client(async(_input,init)=>{
  methods.push(init?.method??'GET');if(init?.method==='POST')payload=JSON.parse(String(init.body));
  const version={...media,reused:true,state:done?'awaiting_approval':'verifying'};
  return Response.json(init?.method==='POST'?version:{...version,healthy:done?1:0,desired:3,storage_state:'pending'});
 });
 const upload=new Upload(client,new File(['hello'],'lecture.txt',{type:'text/plain'}),'purpose');
 await expect(upload.run()).rejects.toMatchObject({code:'reuse_pending',uncertain:false});
 expect(payload).toMatchObject({reuse_existing:true});done=true;const result=await upload.run();expect(result.reused).toBe(true);expect(methods).toEqual(['POST','GET','GET']);
});
