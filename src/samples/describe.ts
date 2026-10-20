import type { SampleModel } from './types';

/** Short, human model name for the specimen label: "onnx-community/SmolLM2-135M-ONNX" + q8 -> "SmolLM2-135M (q8)". */
export function modelLabel(model: SampleModel): string {
  const short = (model.name.split('/').pop() ?? model.name).replace(/-ONNX$/i, '');
  return model.dtype ? `${short} (${model.dtype})` : short;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-10-19" -> "19 October 2026", independent of the browser locale and time zone; other input is returned as is. */
export function formatRecordedAt(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}
