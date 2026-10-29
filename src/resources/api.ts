import contract from '../../contracts/resources.openapi.json';
import mediaContract from '../../contracts/media.openapi.json';
import type { components as Resources } from '../api/resources.gen';
import type { components as Media } from '../api/media.gen';
import { validates } from '../academic/api';
export type Schema = Resources['schemas'];
export type Category = Schema['Category'];
export type Resource = Schema['Resource'];
export type Metadata = Schema['Metadata'];
export type Field = Schema['Field'];
export type Value = Schema['Value'];
export type MediaVersion = Media['schemas']['Version'];
export class ResourceError extends Error {
  constructor(
    public readonly code: string,
    public readonly uncertain = false,
  ) {
    super(code);
  }
}
export function errorCode(e: unknown) {
  return e instanceof ResourceError ? e.code : 'unavailable';
}
export function query(values: Record<string, string | undefined>) {
  return (
    '?' +
    new URLSearchParams(
      Object.entries(values).filter((x): x is [string, string] => !!x[1]),
    ).toString()
  );
}
export const segment = (value: string) => encodeURIComponent(value);
export function name(names: Record<string, string>, locale: string) {
  return names[locale] ?? names['zh-CN'] ?? Object.values(names)[0] ?? '';
}
export function attribute(field: Field, raw: string): Value | undefined {
  if (raw === '') return undefined;
  if (field.kind === 'integer') {
    const number = Number(raw);
    if (!Number.isSafeInteger(number)) throw new ResourceError('invalid_input');
    return { number };
  }
  return field.kind === 'choice' ? { option: raw } : { text: raw };
}
export function shown(
  field: Field | undefined,
  value: Value | undefined,
  locale: string,
) {
  if (!value) return '';
  if (value.number !== undefined)
    return new Intl.NumberFormat(locale, { useGrouping: false }).format(
      value.number,
    );
  if (value.option !== undefined)
    return (
      name(
        field?.options?.find((x) => x.id === value.option)?.names ?? {},
        locale,
      ) || value.option
    );
  return value.text ?? '';
}
const schemaSets = {
  resources: contract.components.schemas,
  media: mediaContract.components.schemas,
};
async function limited(
  response: Response,
  maximum: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) throw new ResourceError('incompatible');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximum) {
        await reader.cancel();
        throw new ResourceError('capacity_exceeded');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export class Client {
  constructor(
    public readonly fetcher: typeof fetch,
    private readonly rejected: () => void = () => {},
  ) {}
  async json<K extends keyof Schema>(
    path: string,
    schema: K,
    options: {
      method?: string;
      body?: unknown;
      key?: string;
      signal?: AbortSignal;
    } = {},
  ): Promise<Schema[K]> {
    return this.request('resources', path, schema, options) as Promise<
      Schema[K]
    >;
  }
  async media(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      bytes?: File;
      key?: string;
      signal?: AbortSignal;
    } = {},
  ): Promise<MediaVersion> {
    return this.request(
      'media',
      path,
      options.method ? 'Version' : 'VersionView',
      options,
    ) as Promise<MediaVersion>;
  }
  private async request(
    module: keyof typeof schemaSets,
    path: string,
    schema: string,
    options: {
      method?: string;
      body?: unknown;
      bytes?: File;
      key?: string;
      signal?: AbortSignal;
    },
  ): Promise<unknown> {
    const mutation = !!options.method && options.method !== 'GET';
    const controller = new AbortController();
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;
    const timer = setTimeout(
      () => controller.abort(),
      options.bytes ? 120000 : 20000,
    );
    try {
      const fetcher = this.fetcher;
      const response = await fetcher(`/api/v1/${module}${path}`, {
        method: options.method ?? 'GET',
        credentials: 'same-origin',
        signal,
        headers: {
          Accept: 'application/json',
          ...(options.key ? { 'Idempotency-Key': options.key } : {}),
          ...(options.bytes
            ? { 'Content-Type': 'application/octet-stream' }
            : options.body === undefined
              ? {}
              : { 'Content-Type': 'application/json' }),
        },
        body:
          options.bytes ??
          (options.body === undefined
            ? undefined
            : JSON.stringify(options.body)),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) this.rejected();
        await response.body?.cancel();
        const codes: Record<number, string> = {
          400: 'invalid_input',
          401: 'authentication_required',
          403: 'permission_denied',
          404: 'not_found',
          409: 'conflict',
          413: 'capacity_exceeded',
        };
        throw new ResourceError(
          codes[response.status] ?? 'unavailable',
          mutation && response.status >= 500,
        );
      }
      let value: unknown;
      try {
        value = JSON.parse(
          new TextDecoder().decode(await limited(response, 4 * 1024 * 1024)),
        );
      } catch {
        throw new ResourceError('incompatible', mutation);
      }
      const schemas: Record<string, unknown> = schemaSets[module];
      if (!validates(value, schemas[schema], schemas))
        throw new ResourceError('incompatible', mutation);
      return value;
    } catch (error) {
      if (error instanceof ResourceError) throw error;
      throw new ResourceError(
        options.signal?.aborted ? 'cancel_pending' : 'network',
        mutation,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  async download(
    path: string,
    filename: string,
    maximum: number,
    signal?: AbortSignal,
  ) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const fetcher = this.fetcher;
      const response = await fetcher('/api/v1/resources' + path, {
        credentials: 'same-origin',
        signal: signal
          ? AbortSignal.any([signal, controller.signal])
          : controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) this.rejected();
        throw new ResourceError(
          response.status === 401
            ? 'authentication_required'
            : response.status === 403
              ? 'permission_denied'
              : 'unavailable',
        );
      }
      const bytes = await limited(response, maximum + 4 * 1024 * 1024);
      const url = URL.createObjectURL(
        new Blob([bytes], { type: 'application/octet-stream' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      if (error instanceof ResourceError) throw error;
      throw new ResourceError('network');
    } finally {
      clearTimeout(timer);
    }
  }
}
// Retain an immutable request until its outcome is known. Retrying never sends
// edited fields with the old idempotency key.
export class Mutation {
  private pending?: {
    path: string;
    schema: keyof Schema;
    method: string;
    body: unknown;
    key: string;
  };
  constructor(private readonly client: Client) {}
  get uncertain() {
    return !!this.pending;
  }
  async run<K extends keyof Schema>(
    path: string,
    schema: K,
    body: unknown,
    method = 'POST',
  ): Promise<Schema[K]> {
    if (!this.pending)
      this.pending = {
        path,
        schema,
        body: snapshot(body),
        method,
        key: crypto.randomUUID(),
      };
    const p = this.pending;
    if (p.path !== path || p.schema !== schema || p.method !== method)
      throw new ResourceError('retry_required');
    try {
      const result = await this.client.json(p.path, schema, p);
      this.pending = undefined;
      return result;
    } catch (error) {
      if (!(error instanceof ResourceError) || !error.uncertain)
        this.pending = undefined;
      throw error;
    }
  }
}
export class Upload {
  version?: MediaVersion;
  private createKey = crypto.randomUUID();
  private contentKey = crypto.randomUUID();
  private cancelKey = crypto.randomUUID();
  private request?: Media['schemas']['UploadRequest'];
  private stop?: AbortController;
  canceled = false;
  constructor(
    private readonly client: Client,
    readonly file: File,
    readonly purpose: string,
  ) {}
  async run() {
    this.stop = new AbortController();
    if (!this.request) {
      const digest = await crypto.subtle.digest(
        'SHA-256',
        await this.file.arrayBuffer(),
      );
      this.request = {
        reuse_existing: true,
        purpose: this.purpose,
        filename: this.file.name,
        content_type: this.file.type || 'application/octet-stream',
        size: this.file.size,
        sha256: [...new Uint8Array(digest)]
          .map((x) => x.toString(16).padStart(2, '0'))
          .join(''),
      };
    }
    if (!this.version)
      this.version = await this.client.media('/uploads', {
        method: 'POST',
        body: this.request,
        key: this.createKey,
      });
    if (this.canceled) return this.cancel();
    this.version = await this.client.media(
      '/uploads/' + segment(this.version.upload_id),
    );
    if (['awaiting_approval', 'approved', 'ready'].includes(this.version.state))
      return this.version;
    if (
      ['cancelled', 'expired', 'rejected', 'deleting'].includes(
        this.version.state,
      )
    )
      throw new ResourceError('invalid_input');
    if (this.version.reused) throw new ResourceError('reuse_pending');
    this.version = await this.client.media(
      '/uploads/' + segment(this.version.upload_id) + '/content',
      {
        method: 'PUT',
        bytes: this.file,
        key: this.contentKey,
        signal: this.stop.signal,
      },
    );
    return this.version;
  }
  async cancel() {
    this.canceled = true;
    this.stop?.abort();
    if (!this.version) throw new ResourceError('cancel_pending');
    try {
      this.version = await this.client.media(
        '/uploads/' + segment(this.version.upload_id),
        { method: 'DELETE', key: this.cancelKey },
      );
    } catch (e) {
      if (e instanceof ResourceError && e.code === 'conflict') {
        this.version = await this.client.media(
          '/uploads/' + segment(this.version.upload_id),
        );
        this.canceled = false;
        return this.version;
      }
      throw e;
    }
    return this.version;
  }
}

// Vue can proxy nested form objects. Copy only JSON-compatible values so retry
// payloads remain immutable without passing proxies to structuredClone.
export function snapshot<T>(value: T): T {
  const copy = (input: unknown, depth: number): unknown => {
    if (depth > 24) throw new ResourceError('invalid_input');
    if (
      input === null ||
      typeof input === 'string' ||
      typeof input === 'boolean'
    )
      return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (Array.isArray(input)) return input.map((item) => copy(item, depth + 1));
    if (typeof input === 'object' && input !== null)
      return Object.fromEntries(
        Object.entries(input)
          .filter(([, v]) => v !== undefined)
          .map(([key, v]) => [key, copy(v, depth + 1)]),
      );
    throw new ResourceError('invalid_input');
  };
  // The recursive copy preserves every supported value and its field shape.
  return copy(value, 0) as T;
}
