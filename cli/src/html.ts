// Writes the graph into the self-contained viewer template (D26, D32). The JSON is embedded so that no transcript
// text can close the script element or inject markup: every "<" becomes < (AC3).
import type { ViewerPayload } from '../../src/map/loadGraph';

export const DATA_SLOT = '__REASONTRAIL_DATA__';
export const TITLE_SLOT = '__REASONTRAIL_TITLE__';

/** JSON that is safe inside a `<script>` element: no `<`, `>` or `&`, and no U+2028/U+2029. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Fill the template's two slots. Uses split/join so `$` in session text is never a replacement pattern. */
export function renderHtml(template: string, payload: ViewerPayload): string {
  return renderHtmlParts(template, payload).join('');
}

/** {@link renderHtml} as the pieces to write one after another, so a large map is not copied into one more string. */
export function renderHtmlParts(template: string, payload: ViewerPayload): string[] {
  if (!template.includes(DATA_SLOT) || !template.includes(TITLE_SLOT)) throw new Error('viewer template is missing its data or title slot');
  const title = escapeHtml(`${payload.graph.title} – Reasontrail`);
  const json = jsonForScript(payload);
  return template.split(TITLE_SLOT).join(title).split(DATA_SLOT).flatMap((part, i) => (i ? [json, part] : [part]));
}
