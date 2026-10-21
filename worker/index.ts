// Worker entry: serves /api/* (run_worker_first) and hands everything else to the static assets.
import type { Env } from './env';
import { handle } from './handler';

export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
} satisfies ExportedHandler<Env>;
