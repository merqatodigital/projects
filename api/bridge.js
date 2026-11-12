import {withOwnerPin} from '../lib/owner-pin.mjs';

const site = 'https://palawan-collective-projects.glorioushull.chatgpt.site';
const allowedPath = /^(?:\/$|\/admin\/?$|\/media\/[a-f0-9-]+$|\/api\/(?:import|preview|upload|github|projects(?:\/[a-zA-Z0-9-]+)?|inventory(?:\/(?:decision|check|dashboard-removal|github-deletion))?)$)/;

export default {fetch: withOwnerPin(async request => {
  const url = new URL(request.url);
  const path = url.pathname === '/api/bridge' ? url.searchParams.get('__path') || '/' : url.pathname;
  if (!allowedPath.test(path)) return new Response('Not found', {status: 404});

  const reading = request.method === 'GET' || request.method === 'HEAD';
  if (!reading && request.headers.get('Origin') !== url.origin) {
    return new Response('Invalid origin', {status: 403});
  }
  const {SITES_SERVICE_TOKEN, DASHBOARD_BRIDGE_SECRET} = process.env;
  if (!SITES_SERVICE_TOKEN || !DASHBOARD_BRIDGE_SECRET) {
    return new Response('Dashboard storage is not configured.', {status: 503});
  }

  url.searchParams.delete('__path');
  const headers = new Headers({
    'OAI-Sites-Authorization': 'Bearer ' + SITES_SERVICE_TOKEN,
    'X-Dashboard-Bridge': DASHBOARD_BRIDGE_SECRET
  });
  if (!reading) headers.set('Origin', site);
  const contentType = request.headers.get('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);
  try {
    const response = await fetch(site + path + url.search, {
      method: request.method,
      headers,
      ...(request.body ? {body: request.body, duplex: 'half'} : {}),
      redirect: 'manual',
      cache: 'no-store'
    });
    if (response.status >= 300 && response.status < 400) {
      return new Response('Dashboard storage is unavailable.', {status: 502});
    }
    const outgoing = new Headers();
    for (const name of ['content-type', 'x-robots-tag', 'x-content-type-options']) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(response.body, {status: response.status, headers: outgoing});
  } catch {
    return new Response('Could not reach dashboard storage.', {status: 502});
  }
})};
