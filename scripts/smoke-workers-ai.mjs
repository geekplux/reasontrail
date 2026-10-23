#!/usr/bin/env node
// One real Workers AI call to check that @cf/zai-org/glm-4.7-flash returns top_logprobs (docs/llm-provider.md §1.2).
// Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN; without a valid token it prints SKIPPED and exits 0.
// The token is never printed. The request body mirrors worker/upstream/workersAi.ts (keep them in sync).
const MODEL = '@cf/zai-org/glm-4.7-flash';
const SYSTEM_PROMPT =
  "You continue text. Reply with only the next words that continue the user's text exactly where it stops, with no preamble or quotes.";
const PREFIX = 'The old lighthouse keeper opened the door and';

const skip = (why) => {
  console.log(`SKIPPED: no valid Cloudflare token (${why})`);
  process.exit(0);
};

const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
if (!/^[A-Za-z0-9_-]{30,}$/.test(token)) skip(token ? 'CLOUDFLARE_API_TOKEN is not a single API-token string' : 'CLOUDFLARE_API_TOKEN is not set');
if (!/^[0-9a-f]{32}$/.test(account)) skip('CLOUDFLARE_ACCOUNT_ID is missing or malformed');

const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: PREFIX },
    ],
    max_tokens: 1,
    logprobs: true,
    top_logprobs: 8,
    temperature: 0,
    chat_template_kwargs: { enable_thinking: false },
  }),
  signal: AbortSignal.timeout(30_000),
});
const body = await res.json().catch(() => ({}));
if (res.status === 401 || res.status === 403) skip(`HTTP ${res.status} from Cloudflare`);
if (!res.ok || body.success === false) {
  console.error(`FAILED: HTTP ${res.status}`, JSON.stringify(body.errors ?? body).slice(0, 500));
  process.exit(1);
}
const first = body.result?.choices?.[0]?.logprobs?.content?.[0];
const top = first?.top_logprobs ?? [];
console.log(`model: ${MODEL}`);
console.log(`chosen token: ${JSON.stringify(first?.token)}`);
console.log(`top_logprobs length: ${top.length} (expected 8)`);
console.log(`first top token: ${JSON.stringify(top[0]?.token)} logprob ${top[0]?.logprob}`);
if (top.length === 0 || /^<\/?think>$/.test(String(first?.token).trim())) {
  console.error('FAILED: no top_logprobs, or a thinking token came first');
  process.exit(1);
}
console.log('OK');
