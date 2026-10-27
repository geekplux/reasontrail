// The maintainer's other sites, the "Made by GeekPlux" block above the footer. One exported constant, so the other
// project sites can copy the same list.

export interface MoreSite {
  name: string;
  /** One line: what the site does for you. */
  line: string;
  url: string;
}

/** The maker's own site: the block's main link. */
export const MAKER = { name: 'GeekPlux', line: 'Writing, projects and data visualization', url: 'https://geekplux.com' } as const;

export const MORE_SITES: readonly MoreSite[] = [
  { name: 'Vert', line: 'Turn a GPX track into a terrain poster', url: 'https://vert.geekplux.com' },
  { name: 'Explorable', line: 'Turn a paper into an interactive essay', url: 'https://explorable.geekplux.com' },
  { name: 'Pagelapse', line: 'Watch a web page change over the years', url: 'https://pagelapse.geekplux.com' },
  { name: 'markvis', line: 'Charts written in Markdown', url: 'https://github.com/geekplux/markvis' },
];

/** A URL as shown under its name: no scheme, no trailing slash. */
export const shownUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');
