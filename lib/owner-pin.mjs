import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value) {
  return createHash('sha256').update(value).digest();
}

export function withOwnerPin(handler, {pin = process.env.DASHBOARD_PIN} = {}) {
  const expected = pin && digest('owner:' + pin);
  return async request => {
    const headers = {'Cache-Control': 'private, no-store'};
    if (!expected) {
      return new Response('Dashboard access is not configured.', {status: 503, headers});
    }

    const credentials = request.headers.get('Authorization')?.match(/^Basic ([A-Za-z0-9+/=]+)$/i);
    const supplied = credentials && Buffer.from(credentials[1], 'base64');
    if (!supplied || !timingSafeEqual(digest(supplied), expected)) {
      headers['WWW-Authenticate'] = 'Basic realm="Projects Dashboard", charset="UTF-8"';
      return new Response('Sign in as owner with your dashboard PIN.', {status: 401, headers});
    }

    const trustedHeaders = new Headers(request.headers);
    trustedHeaders.delete('Authorization');
    const result = await handler(new Request(request, {headers: trustedHeaders}));
    const privateHeaders = new Headers(result.headers);
    privateHeaders.set('Cache-Control', headers['Cache-Control']);
    return new Response(result.body, {status: result.status, headers: privateHeaders});
  };
}
