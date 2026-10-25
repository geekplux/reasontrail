// The pre-v7 map is gone (phase 34b): the route view, task card, outline, old detail panel and their CSS, and nothing
// imports them. The pure modules the v7 list, tree, detail panel and share card still use (details, layout, outline,
// keyboard) stay.
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>(['../**/*.{ts,tsx,css}', '!../**/removed.test.ts'], { query: '?raw', import: 'default', eager: true });
const GONE = ['MapView', 'RouteView', 'LaneView', 'TaskCard', 'Outline', 'HonestyLabel', 'KeyHelp', 'MapLegend', 'TroubleMarker', 'DetailPanel', 'StepList', 'OutcomeCard', 'RawRecord', 'Glyph', 'SelectContext'];

describe('old map code removed', () => {
  it('has no files left', () => {
    const names = Object.keys(sources);
    // Keys are relative to this folder: `./HowToReadMap.tsx` here, `../ai/labels.ts` elsewhere.
    const left = names.filter((p) => new RegExp(`^\\./(${GONE.join('|')})(\\.test)?\\.tsx?$|^\\./(map|outline)\\.css$|^\\.\\./ai/(SupportLinks|LabelBadge)\\.tsx$`).test(p));
    expect(left).toEqual([]);
    expect(names).toEqual(expect.arrayContaining(['./HowToReadMap.tsx', './outline.ts', '../ai/labels.ts']));
  });

  it('is imported nowhere', () => {
    const imports = new RegExp(`from '[./]*(map/)?(${GONE.join('|')}|SupportLinks|LabelBadge)'|import '[./]*(map/)?(map|outline)\\.css'`);
    expect(Object.entries(sources).filter(([, text]) => imports.test(text)).map(([p]) => p)).toEqual([]);
  });
});
