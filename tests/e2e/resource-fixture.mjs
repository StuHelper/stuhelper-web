export function fixture() {
  const category = {
    id: 'custom-category',
    revision: 1,
    names: { 'zh-CN': '自定义试卷', 'en-US': 'Custom papers' },
    enabled: true,
    order: 1,
    group_by: 'edition',
    fields: [
      {
        key: 'edition',
        names: { 'zh-CN': '自定义年份', 'en-US': 'Custom year' },
        kind: 'integer',
        required: false,
        filterable: true,
        groupable: true,
        min: 1900,
        max: 2100,
      },
    ],
  };
  const file = {
    version_id: 'media-version',
    filename: 'original-notes.txt',
    content_type: 'text/plain',
    size: 5,
    sha256: 'a'.repeat(64),
  };
  const metadata = {
    title: 'Fixture notes',
    description: 'Persistent course resource',
    tags: [],
    category_id: category.id,
    category_revision: 1,
    attributes: { edition: { number: 2025 } },
    associations: { school_id: 'school', course_id: 'course' },
    access: 'public',
    origin: { kind: 'unknown' },
  };
  const version = {
    id: 'version',
    number: 1,
    metadata,
    category,
    file,
    state: 'published',
    created_at: '2029-01-01T00:00:00Z',
  };
  const resource = {
    id: 'resource',
    revision: 2,
    state: 'published',
    current: version,
    download_allowed: true,
    access_reason: 'allowed',
    owned: true,
  };
  const media = {
    id: 'media-version',
    file_id: 'file',
    number: 1,
    revision: 1,
    upload_id: 'upload',
    filename: file.filename,
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
  const capabilities = {
    terms: {
      version: 'v1',
      digest: 'a'.repeat(64),
      url: 'https://example.invalid/terms',
    },
    allowed_types: ['text/plain'],
    max_file_size: 1000000,
    max_package_bytes: 1000000,
    max_package_files: 100,
    purchase_available: false,
    upload_profiles: [
      { school_id: 'school', access: 'public', purpose: 'custom-profile' },
    ],
  };
  const receipt = {
    id: 'receipt',
    resource_id: 'resource',
    kind: 'withdrawal',
    state: 'submitted',
    can_appeal: false,
    created_at: '2029-01-01T00:00:00Z',
  };
  const task = {
    id: 'task',
    school_id: 'school',
    content_kind: 'resource',
    submission: {
      object_id: 'resource:version',
      kind: 'review',
      reason: 'content_review',
      evidence: [],
    },
    object_revision: 2,
    revision: 1,
    state: 'waiting',
    created_at: '2029-01-01T00:00:00Z',
    updated_at: '2029-01-01T00:00:00Z',
  };
  return {
    category,
    file,
    metadata,
    version,
    resource,
    media,
    capabilities,
    receipt,
    task,
    calls: [],
    lose: false,
    reject: false,
    grants: [],
    directory: {
      id: 'folder',
      revision: 1,
      school_id: 'school',
      course_id: 'course',
      parent_id: '',
      names: { 'zh-CN': '资料目录', 'en-US': 'Resource folder' },
      enabled: true,
    },
  };
}
export async function routes(page, s) {
  await page.route('**/api/v1/catalog/**', async (route) => {
    const url = new URL(route.request().url());
    const kind = url.searchParams.get('kind');
    const id =
      kind === 'school'
        ? 'school'
        : kind === 'course'
          ? 'course'
          : kind === 'term'
            ? 'term'
            : kind === 'term_course'
              ? 'offering'
              : 'teacher';
    return route.fulfill({
      json: {
        items: [
          {
            id,
            kind,
            school_id: 'school',
            name: kind === 'school' ? 'Fixture School' : 'Fixture ' + kind,
            aliases: [],
            credits: 0,
            revision: 1,
            updated_at: '2029-01-01T00:00:00Z',
          },
        ],
        next: '',
      },
    });
  });
  await page.route('**/api/v1/media/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    s.calls.push({
      path: url.pathname,
      method: req.method(),
      key: req.headers()['idempotency-key'],
      body: req.method() === 'POST' ? req.postDataJSON() : null,
    });
    if (req.method() === 'POST') return route.fulfill({ json: s.media });
    if (req.method() === 'DELETE') {
      s.media.state = 'cancelled';
      return route.fulfill({ json: s.media });
    }
    if (req.method() === 'PUT') {
      s.media.state = 'awaiting_approval';
      return route.fulfill({ json: s.media });
    }
    return route.fulfill({
      json: { ...s.media, healthy: 1, desired: 3, storage_state: 'pending' },
    });
  });
  await page.route('**/api/v1/resources**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace('/api/v1/resources', '');
    const mutation = ['POST', 'PUT'].includes(req.method());
    const body = mutation ? req.postDataJSON() : undefined;
    s.calls.push({
      path,
      method: req.method(),
      body,
      key: req.headers()['idempotency-key'],
      query: Object.fromEntries(url.searchParams),
    });
    if (s.reject)
      return route.fulfill({
        status: 403,
        json: { code: 'resources_permission_denied' },
      });
    if (mutation && s.lose) {
      s.lose = false;
      return route.abort();
    }
    if (path === '/capabilities')
      return route.fulfill({ json: s.capabilities });
    if (path === '/categories')
      return route.fulfill({ json: { items: [s.category], next_cursor: '' } });
    if (path.startsWith('/categories/')) {
      s.category = {
        id: path.split('/').at(-1),
        ...body,
        revision: body.revision + 1,
      };
      return route.fulfill({ json: s.category });
    }
    if (path === '/directories')
      return route.fulfill({
        json: {
          items: url.searchParams.get('parent_id') ? [] : [s.directory],
          next_cursor: '',
        },
      });
    if (path.startsWith('/directories/')) {
      s.directory = {
        id: path.split('/').at(-1),
        ...body,
        revision: body.revision + 1,
      };
      return route.fulfill({ json: s.directory });
    }
    if (path === '/requests')
      return route.fulfill({ json: { items: [s.receipt], next_cursor: '' } });
    if (path.startsWith('/requests/'))
      return route.fulfill({
        json: {
          ...s.receipt,
          state: 'applied',
          task_id: 'previous-task',
          can_appeal: true,
          decision_reason: 'Processed decision',
        },
      });
    if (path.endsWith('/requests'))
      return route.fulfill({
        json: {
          ...s.receipt,
          id: 'new-receipt',
          state: 'pending',
          kind: body.kind,
        },
      });
    if (path.endsWith('/grants'))
      return route.fulfill({ json: { items: s.grants, next_cursor: '' } });
    if (path.includes('/grants/')) {
      const id = path.split('/').at(-1);
      const grant = {
        id,
        revision: body.revision + 1,
        subject_key: body.subject_key,
        revoked: body.revoked,
      };
      s.grants = [grant];
      return route.fulfill({ json: grant });
    }
    if (path.endsWith('/state')) {
      s.resource = {
        ...s.resource,
        state: body.state,
        revision: body.revision + 1,
      };
      return route.fulfill({ json: s.resource });
    }
    if (path === '/packages')
      return route.fulfill({
        json: {
          id: 'package',
          parts: [
            { number: 1, bytes: 5, files: [s.file] },
            {
              number: 2,
              bytes: 5,
              files: [
                { ...s.file, version_id: 'part-two', filename: 'second.txt' },
              ],
            },
          ],
          expires_at: '2030-01-01T00:00:00Z',
        },
      });
    if (
      path.includes('/parts/') ||
      path.endsWith('/download') ||
      (path.startsWith('/review/') && path.endsWith('/file'))
    )
      return route.fulfill({
        body: 'hello',
        headers: {
          'content-type': 'application/octet-stream',
          'content-disposition': 'attachment; filename="original-notes.txt"',
        },
      });
    if (path.startsWith('/review/'))
      return route.fulfill({
        json: {
          ...s.resource,
          current: undefined,
          proposal: { ...s.version, state: 'pending' },
          download_allowed: false,
        },
      });
    if (path === '' && req.method() === 'POST') {
      s.resource = {
        id: 'new-resource',
        revision: 1,
        state: 'draft',
        proposal: {
          ...s.version,
          id: 'draft-version',
          metadata: body.metadata,
          state: 'draft',
          file: undefined,
        },
        download_allowed: false,
        access_reason: 'not_published',
        owned: true,
      };
      return route.fulfill({ json: s.resource });
    }
    if (path.endsWith('/file')) {
      s.resource = {
        ...s.resource,
        revision: s.resource.revision + 1,
        proposal: { ...s.resource.proposal, file: s.file },
      };
      return route.fulfill({ json: s.resource });
    }
    if (path.endsWith('/submit')) {
      s.resource = {
        ...s.resource,
        revision: s.resource.revision + 1,
        proposal: { ...s.resource.proposal, state: 'pending' },
      };
      return route.fulfill({ status: 202, json: s.resource });
    }
    if (path.startsWith('/items/')) {
      if (req.method() === 'PUT')
        s.resource = {
          ...s.resource,
          revision: s.resource.revision + 1,
          proposal: { ...s.version, metadata: body.metadata, state: 'draft' },
        };
      return route.fulfill({ json: s.resource });
    }
    if (['', '/me', '/manage'].includes(path))
      return route.fulfill({ json: { items: [s.resource], next_cursor: '' } });
    return route.fulfill({
      status: 404,
      json: { code: 'resources_not_found' },
    });
  });
  await page.route('**/api/v1/moderation/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      s.calls.push({
        path: url.pathname,
        method: 'POST',
        body,
        key: req.headers()['idempotency-key'],
      });
      if (s.lose) {
        s.lose = false;
        return route.abort();
      }
      s.task = {
        ...s.task,
        revision: s.task.revision + 1,
        state: 'decided',
        decision: body.decision,
      };
      return route.fulfill({ json: s.task });
    }
    if (url.pathname === '/api/v1/moderation/tasks')
      return route.fulfill({ json: [s.task] });
    return route.fulfill({
      json:
        s.task.state === 'decided' ? { ...s.task, state: 'applied' } : s.task,
    });
  });
}
