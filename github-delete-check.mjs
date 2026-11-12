import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from './dist/server/index.js';

const {repositories: [repo]} = JSON.parse(readFileSync('inventory.json', 'utf8'));
const origin = 'https://test.local';
const path = '/api/inventory/github-deletion';
const records = new Map();
const env = {BUCKET: {
  get: async key => records.get(key),
  put: async (key, value, options) => {
    if (options?.onlyIf?.get('If-None-Match') === '*' && records.has(key)) return null;
    records.set(key, {json: async () => JSON.parse(value), customMetadata: options?.customMetadata});
    return {};
  },
  delete: async key => records.delete(key),
  list: async ({prefix}) => ({objects: [...records].filter(([key]) => key.startsWith(prefix)).map(([, value]) => value)})
}};
const owner = {
  'oai-authenticated-user-id': 'test-owner',
  'oai-authenticated-user-email': 'growpalawan@gmail.com'
};
const payload = {
  repositoryId: repo.id,
  confirmation: repo.name,
  token: 'github_pat_' + 'a'.repeat(30)
};
const submit = (body = payload, headers = owner, from = origin) =>
  worker.fetch(new Request(origin + path, {
    method: 'POST',
    headers: {Origin: from, 'Content-Type': 'application/json', ...headers},
    body: JSON.stringify(body)
  }), env);

let deletionCalls = 0;
let responseStatus = 403;
let githubId = Number(repo.id) + 1;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.github.com/repos/' + repo.name);
  assert.equal(options.redirect, 'manual');
  if (options.method === 'GET') {
    return Response.json({id: githubId, full_name: repo.name, permissions: {admin: true}});
  }
  assert.equal(options.method, 'DELETE');
  deletionCalls++;
  return new Response(null, {status: responseStatus});
};

assert.equal((await submit(payload, {})).status, 403);
assert.equal((await submit(payload, owner, 'https://other.local')).status, 403);
assert.equal((await submit({...payload, confirmation: 'wrong/repo'})).status, 400);
assert.equal((await submit()).status, 409);
assert.equal(deletionCalls, 0);

githubId = Number(repo.id);
assert.equal((await submit()).status, 422);
assert.equal(records.size, 0);
responseStatus = 204;
const results = await Promise.all([submit(), submit()]);
assert.equal(deletionCalls, 2, 'Concurrent submissions must make only one new DELETE');
const deleted = results.find(result => result.ok);
assert.equal((await deleted.json()).status, 'deleted');
assert.equal((await (await submit()).json()).status, 'deleted');
assert.equal(deletionCalls, 2);

const state = await worker.fetch(new Request(origin + path, {headers: owner}), env);
const {receipts} = await state.json();
assert.equal(receipts[0].repositoryId, String(repo.id));
assert.ok(!JSON.stringify(receipts).includes(payload.token));
console.log('PASS: owner, origin, exact name and immutable ID guards; provider refusal; one DELETE on concurrent submission; receipt excludes token');
