/**
 * A spreadsheet from the phone, read as text — the console's file box, with
 * the phone's own file chooser in its place.
 *
 * The chooser is native code, so an install from before it was added has
 * none; asking for it there says to update the app rather than crashing,
 * the same way the picture picker does (`upload.ts`).
 */
import { PickerMissing } from "./upload";

type Picker = typeof import("expo-document-picker");

/** One CSV chosen and read; null when the person backed out. */
export async function pickCsv(): Promise<{ name: string; text: string } | null> {
  let p: Picker;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    p = require("expo-document-picker") as Picker;
  } catch {
    throw new PickerMissing();
  }
  const r = await p.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "text/plain", "*/*"], copyToCacheDirectory: true });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  const text = await (await fetch(a.uri)).text();
  return { name: a.name, text };
}
