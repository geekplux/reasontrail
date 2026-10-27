import { describe, expect, it } from 'vitest';
import { MAKER, MORE_SITES, shownUrl } from './moreSites';

describe('moreSites', () => {
  it('lists geekplux.com first, then the four sites in order, with the exact copy and https URLs', () => {
    expect(MAKER).toEqual({ name: 'GeekPlux', line: 'Writing, projects and data visualization', url: 'https://geekplux.com' });
    expect(MORE_SITES.map((s) => [s.name, s.line, s.url])).toEqual([
      ['Vert', 'Turn a GPX track into a terrain poster', 'https://vert.geekplux.com'],
      ['Explorable', 'Turn a paper into an interactive essay', 'https://explorable.geekplux.com'],
      ['Pagelapse', 'Watch a web page change over the years', 'https://pagelapse.geekplux.com'],
      ['markvis', 'Charts written in Markdown', 'https://github.com/geekplux/markvis'],
    ]);
  });

  it('shows a URL without its scheme', () => {
    expect(MORE_SITES.map((s) => shownUrl(s.url))).toEqual(['vert.geekplux.com', 'explorable.geekplux.com', 'pagelapse.geekplux.com', 'github.com/geekplux/markvis']);
    expect(shownUrl('https://geekplux.com/')).toBe('geekplux.com');
  });
});
