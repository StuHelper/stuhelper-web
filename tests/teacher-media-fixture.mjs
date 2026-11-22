import { Buffer } from 'node:buffer';

export const animation = Buffer.from('R0lGODlhCAAIAIEAAAAA/wAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAGQAAACwAAAAACAAIAAAIDwABCBxIsKDBgwgTKkwYEAAh+QQBGQABACwAAAAACAAIAIH/AAAAAAAAAAAAAAAIDwABCBxIsKDBgwgTKkwYEAA7', 'base64');
export const cdn = 'https://media.stuhelper.com';

// Chromium follows redirects outside Playwright's page.route handler. Fulfil the CDN
// hop in Chromium itself, so the browser checks CORS without contacting a public host.
export async function interceptMedia(page, appOrigin, reply) {
  const session = await page.context().newCDPSession(page);
  const requests = [];
  session.on('Fetch.requestPaused', async ({ requestId, request }) => {
    const { status = 200, type = 'image/gif', body = animation } = reply(new URL(request.url));
    requests.push(request);
    await session.send('Fetch.fulfillRequest', {
      requestId, responseCode: status,
      responseHeaders: [
        { name: 'Access-Control-Allow-Origin', value: appOrigin },
        { name: 'Content-Type', value: type },
        { name: 'Cache-Control', value: 'no-store' },
      ],
      body: body.toString('base64'),
    });
  });
  await session.send('Fetch.enable', { patterns: [{ urlPattern: cdn + '/*' }] });
  return requests;
}
