import test from 'node:test';
import assert from 'node:assert/strict';
import { connect, decodeRpc } from './client.mjs';

const response = (body, headers = {}) => new Response(JSON.stringify(body), {
  headers: { 'content-type': 'application/json', ...headers },
});

test('JSON and SSE replies select the matching id, including multiline data', () => {
  assert.deepEqual(decodeRpc('{"id":3,"result":{"ok":true}}', 'application/json', 3), { ok: true });
  const sse = ': keepalive\r\n\r\ndata: {"method":"notifications/progress"}\r\n\r\n'
    + 'event: message\r\ndata: {"id":3,\r\ndata: "result":{"ok":true}}\r\n\r\n';
  assert.deepEqual(decodeRpc(sse, 'text/event-stream', 3), { ok: true });
});

test('RPC errors, missing ids and malformed JSON fail visibly', () => {
  assert.throws(() => decodeRpc('{"id":1,"error":{"code":-32602,"message":"bad argument"}}', '', 1), /bad argument/);
  assert.throws(() => decodeRpc('{"id":2,"result":{}}', '', 1), /No JSON-RPC response/);
  assert.throws(() => decodeRpc('not JSON', '', 1), SyntaxError);
});

test('initialization, session propagation, discovery and tool result parsing', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, options, body });
    if (body.method === 'initialize') return response({ id: body.id, result: {
      protocolVersion: '2025-03-26', serverInfo: { name: 'fixture' },
    } }, { 'mcp-session-id': 'test-session' });
    assert.equal(options.headers['mcp-session-id'], 'test-session');
    assert.equal(options.headers['mcp-protocol-version'], '2025-03-26');
    if (body.method === 'notifications/initialized') {
      assert.equal(Object.hasOwn(body, 'id'), false);
      return new Response(null, { status: 202 });
    }
    return response({ id: body.id, result: body.method === 'tools/list'
      ? { tools: [{ name: 'list_bounties' }] }
      : { content: [{ type: 'text', text: '{"items":[{"id":"example"}]}' }] } });
  };
  const client = await connect(fakeFetch);
  assert.equal((await client.tools()).tools[0].name, 'list_bounties');
  assert.deepEqual(await client.call('list_bounties', { limit: 1 }), { items: [{ id: 'example' }] });
  assert.deepEqual(calls.at(-1).body.params, { name: 'list_bounties', arguments: { limit: 1 } });
  const before = calls.length;
  await assert.rejects(client.call('pay_for_service'), /read-only/);
  assert.equal(calls.length, before);
});

test('a 402 stops after one request without payment or retry', async () => {
  let count = 0;
  await assert.rejects(connect(async () => { count++; return new Response('payment required', { status: 402 }); }), /HTTP 402/);
  assert.equal(count, 1);
});

test('network errors and tool errors do not become empty task lists', async () => {
  await assert.rejects(connect(async () => { throw new Error('offline'); }), /offline/);
  const client = await connect(async (_, options) => {
    const body = JSON.parse(options.body);
    if (body.method === 'initialize') return response({ id: body.id, result: { protocolVersion: '2025-03-26' } });
    if (!body.id) return new Response(null, { status: 202 });
    return response({ id: body.id, result: { isError: true, content: [{ type: 'text', text: 'feed unavailable' }] } });
  });
  await assert.rejects(client.call('list_bounties'), /feed unavailable/);
});
