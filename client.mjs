import { pathToFileURL } from 'node:url';

const ENDPOINT = 'https://agent-bounty-feed.dailydollar.workers.dev/mcp';
const TOOLS = new Set(['list_bounties', 'get_new_bounties', 'get_bounty', 'get_feed_stats']);

export function decodeRpc(text, type, id) {
  const messages = type.includes('text/event-stream')
    ? text.split(/\r?\n\r?\n/).flatMap(frame => {
      const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart()).join('\n');
      return data ? [JSON.parse(data)] : [];
    })
    : [JSON.parse(text)];
  const reply = messages.find(message => message?.id === id);
  if (!reply) throw new Error(`No JSON-RPC response for request ${id}`);
  if (reply.error) throw new Error(`MCP ${reply.error.code}: ${reply.error.message}`);
  if (!Object.hasOwn(reply, 'result')) throw new Error('MCP response has no result');
  return reply.result;
}

export async function connect(fetchImpl = fetch) {
  let nextId = 0;
  let session;
  let protocol = '2025-03-26';
  async function rpc(method, params, notification = false) {
    const id = notification ? undefined : ++nextId;
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: {
        'content-type': 'application/json', accept: 'application/json, text/event-stream',
        ...(method === 'initialize' ? {} : { 'mcp-protocol-version': protocol }),
        ...(session ? { 'mcp-session-id': session } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params }),
    });
    // Never pay a 402 or retry a request automatically.
    if (!response.ok) throw new Error(`HTTP ${response.status} from free MCP endpoint`);
    if (method === 'initialize') session = response.headers.get('mcp-session-id') || undefined;
    if (notification) { await response.text(); return; }
    return decodeRpc(await response.text(), response.headers.get('content-type') || '', id);
  }
  const server = await rpc('initialize', {
    protocolVersion: protocol, capabilities: {},
    clientInfo: { name: 'agent-bounty-feed-mcp-client', version: '1.0.0' },
  });
  if (server.protocolVersion !== protocol) throw new Error(`Unsupported MCP version: ${server.protocolVersion}`);
  await rpc('notifications/initialized', {}, true);
  return {
    server: server.serverInfo,
    tools: () => rpc('tools/list', {}),
    async call(name, args = {}) {
      if (!TOOLS.has(name)) throw new Error('Only the four free read-only feed tools are allowed');
      const result = await rpc('tools/call', { name, arguments: args });
      if (result.isError) throw new Error(`Tool failed: ${JSON.stringify(result.content)}`);
      if (result.structuredContent !== undefined) return result.structuredContent;
      const texts = result.content?.filter(block => block.type === 'text') || [];
      if (texts.length !== 1) throw new Error('Expected one JSON text result');
      return JSON.parse(texts[0].text);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command = 'list', ...extra] = process.argv.slice(2);
    if (extra.length || !['list', 'stats', 'tools'].includes(command)) {
      throw new Error('Usage: node client.mjs [list|stats|tools]');
    }
    const client = await connect();
    const result = command === 'tools' ? await client.tools()
      : await client.call(command === 'stats' ? 'get_feed_stats' : 'list_bounties',
        command === 'stats' ? {} : {
          min_usd: 1, exclude_requires: 'kyc,stake,bond,purchase,human_only',
          sort: 'first_seen', limit: 5,
        });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
