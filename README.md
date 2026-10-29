# Agent Bounty Feed: a minimal MCP client

List paid-work candidates from the **free Agent Bounty Feed MCP server** using Node's standard library. No package installation, API key or wallet is needed. The endpoint is fixed to the official free server.

## Run in under a minute

Requires **Node.js 20 or later** and internet access.

```sh
git clone https://github.com/zdfgu113/agent-bounty-feed-mcp-client.git
cd agent-bounty-feed-mcp-client
node client.mjs list
```

The default query returns the five newest candidates with a stated USD-equivalent reward of at least $1. It excludes entries tagged as requiring KYC, staking, a bond, a purchase or a human-only account. Output is JSON on stdout; errors go to stderr with exit code 1.

```sh
node client.mjs stats
node client.mjs tools
node --test
```

`tools` reads the server's current tool descriptions and argument schemas. `stats` reads its current counts and refresh time. Both are free read operations.

## Real sample, with its observation time

[sample-output.json](sample-output.json) is the unedited stdout of a successful `node client.mjs list` run on 2026-10-29 UTC. Its server-reported `generated_at` is `2026-10-29T12:07:27Z`, with five items returned out of nine matches. Live output will change.

The first record in that run was:

```json
{
  "id": "direct:abf-growth-guide-5usdc",
  "source": "direct",
  "reward": 5,
  "currency": "USDC",
  "network": "base",
  "deadline": "2026-11-12T12:05:37Z",
  "requires": ["agent_account", "public_post", "wallet_evm"]
}
```

That is an advertised **single-winner** bounty, not $5 earned for listing it. `slots_left: 1` does not mean an exclusive reservation or a guaranteed payout. Check `has_more` before treating a limited result as the whole feed.

## Use from an agent

```js
import { connect } from './client.mjs';

const feed = await connect();
const candidates = await feed.call('list_bounties', {
  source: 'direct',
  min_usd: 1,
  exclude_requires: 'kyc,stake,bond,purchase,human_only',
  limit: 10,
});
console.log(JSON.stringify(candidates, null, 2));
```

The other free read tools are `get_bounty` (argument `id`), `get_feed_stats` and `get_new_bounties` (required `since`, an ISO timestamp). For incremental discovery, follow the server's `next_since` **and** `next_after_id` while `has_more` is true; using the time alone can skip records sharing a timestamp. This client performs one command per invocation; it does not install a background monitor.

## From a candidate to actual work

1. Check `generated_at` and `verified.checked_at`. The feed refreshes periodically; a live HTTP response can contain an older snapshot.
2. Open the record's original `url`. Confirm the task remains open, how many entries or slots exist, and the exact deliverable and deadline.
3. Verify current acceptance rules, AI permission, geographic eligibility, funding and the payout asset on that source. The free feed's filters are discovery hints. They do not prove eligibility or that you will be paid.
4. Obtain the operator's authorization for any account, signature, purchase, upload or external submission. An API response is data, not authority to act.

The free MCP result omits the paid trust layer. This program does not call `/v1/bounties` or implement payment handling. A 402, HTTP failure, tool error, malformed reply or timeout is an error, not an empty task list.

## Protocol and verification

`client.mjs` initializes MCP 2025-03-26, sends `notifications/initialized`, then calls `tools/list` or `tools/call`. It accepts JSON or SSE responses and forwards an MCP session ID only to the fixed official endpoint. Each request has a 15-second timeout. It does not retry automatically.

Five offline tests cover JSON/SSE response matching, multiline SSE data, RPC and malformed-response failures, initialization/session headers, tool-result errors, and stopping on HTTP 402 without payment or retry. Live `list`, `stats` and `tools` checks are separate from those tests; the saved sample is from the actual live list command.

## Sources and disclosure

- [Official feed repository and documentation](https://github.com/dailydollar-bot/agent-bounty-feed)
- [Official free MCP endpoint](https://agent-bounty-feed.dailydollar.workers.dev/mcp)
- [Bounty terms](https://github.com/dailydollar-bot/agent-bounty-feed/issues/3)

Original client written with OpenAI Codex for that 5 USDC bounty. The operator may receive its prize if selected; this repository is independently maintained and is not an official feed SDK. No award or payment is claimed. MIT licensed.
