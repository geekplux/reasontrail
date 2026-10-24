import { describe, expect, it } from 'vitest';
import { RUNTIME_ALLOWLIST, VIEWER_MAX, checkBudgets, checkCli, checkLazy, checkDependencies, checkWorkerImports, initialAssets } from './check-size.mjs';

const allowed = Object.fromEntries(RUNTIME_ALLOWLIST.map((n) => [n, '*']));

describe('check-size', () => {
  it('accepts exactly the allowlist and rejects extra or missing runtime dependencies', () => {
    expect(checkDependencies(allowed)).toEqual([]);
    expect(checkDependencies({ ...allowed, lodash: '^4' })).toEqual(['runtime dependency not in the allowlist: lodash']);
    const { react: _react, ...withoutReact } = allowed;
    expect(checkDependencies(withoutReact)).toEqual(['allowlisted runtime dependency missing: react']);
  });

  it('reads the entry script, modulepreloads and stylesheets from the built index.html', () => {
    const html = `<script type="module" crossorigin src="/assets/index-a.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/vendor-b.js"><link rel="stylesheet" crossorigin href="/assets/index-c.css">`;
    expect(initialAssets(html)).toEqual({ js: ['assets/index-a.js', 'assets/vendor-b.js'], css: ['assets/index-c.css'] });
  });

  it('flags every budget it exceeds', () => {
    expect(checkBudgets({ jsGzip: 1000, cssGzip: 1000, fontBytes: 1000, fontFiles: 2 })).toEqual([]);
    expect(checkBudgets({ jsGzip: 200_000, cssGzip: 20_000, fontBytes: 60_000, fontFiles: 3 })).toHaveLength(4);
  });

  it('allows only relative and type-only imports in the Worker', () => {
    const ok = `import type { Env } from './env';\nimport { handle } from '../shared/llm/types';\nexport { x } from './x';`;
    expect(checkWorkerImports({ 'worker/a.ts': ok })).toEqual([]);
    const bad = `import { z } from 'zod';\nexport * from "hono";\nconst m = await import('itty-router');`;
    expect(checkWorkerImports({ 'worker/b.ts': bad })).toEqual([
      'Worker runtime dependency in worker/b.ts: zod',
      'Worker runtime dependency in worker/b.ts: hono',
      'Worker runtime dependency in worker/b.ts: itty-router',
    ]);
  });

  it('keeps the CLI at zero runtime dependencies and the viewer template within 300 KB', () => {
    expect(checkCli({ name: 'reasontrail' }, VIEWER_MAX)).toEqual([]);
    expect(checkCli({ dependencies: { chalk: '*' } }, VIEWER_MAX + 1)).toEqual(['CLI runtime dependency (must be zero): chalk', 'viewer template 300.0 KB > 300 KB']);
  });
});

describe('checkLazy (G2, phase 19)', () => {
  const assets = ['index-a.js', 'implementer-checks.graph-abcdefgh.js', 'planner-pivot.graph-abcdefgh.js', 'DropZone-abcdefgh.js', 'parse.worker-abcdefgh.js'];
  const small = Object.fromEntries(assets.map((f) => [f, 1024]));
  it('passes when every lazy chunk exists, is not initial and is within budget', () => {
    expect(checkLazy(assets, ['assets/index-a.js'], small)).toEqual([]);
  });
  it('flags missing, eager and oversized chunks', () => {
    const problems = checkLazy(assets.slice(0, 4), ['assets/index-a.js', 'assets/DropZone-abcdefgh.js'], { ...small, 'planner-pivot.graph-abcdefgh.js': 90 * 1024 });
    expect(problems).toEqual([
      'sample planner-pivot 90.0 KB gzip > 80 KB',
      'drop zone loads with the first view (should be lazy)',
      'lazy chunk not found: parse worker',
    ]);
  });
});
