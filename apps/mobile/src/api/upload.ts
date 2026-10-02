/**
 * A picture from the phone's gallery, sent to the API as raw bytes — the
 * console's `upload` (`apps/web/src/lib/api.ts`), with the gallery in place of
 * a file box.
 *
 * The picker is native code, so it only exists in an app build that includes
 * it. An older install that took this screen by update has no picker; asking
 * for it then throws, and this says to update the app rather than crashing.
 */
import { ApiError } from "@rh/shared";
import { API_URL } from "./config";
import { TOKEN_KEY } from "./transport";
import { session } from "./wire";

export class PickerMissing extends Error {
  constructor() {
    super("This version of the app cannot add pictures yet. Update it from the download page, then try again.");
  }
}

type Picker = typeof import("expo-image-picker");

function picker(): Picker {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-image-picker") as Picker;
  } catch {
    throw new PickerMissing();
  }
}

/** Asks for one picture; null when the person backed out. */
export async function pickPicture(): Promise<{ uri: string; type: string } | null> {
  let p: Picker;
  try {
    p = picker();
  } catch (e) {
    throw e instanceof PickerMissing ? e : new PickerMissing();
  }
  const chosen = await p.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
  if (chosen.canceled || !chosen.assets[0]) return null;
  const a = chosen.assets[0];
  return { uri: a.uri, type: a.mimeType ?? "image/jpeg" };
}

/** Sends a picture already chosen to `path`, with any extra headers the API wants. */
export async function uploadPicture<T = unknown>(path: string, picture: { uri: string; type: string }, extra: Record<string, string> = {}): Promise<T> {
  const body = await (await fetch(picture.uri)).blob();
  const token = session.getItem(TOKEN_KEY);
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": picture.type, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body,
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // an empty body
  }
  if (!res.ok) {
    throw new ApiError(res.status, String((payload as { message?: string })?.message ?? `Upload failed (${res.status})`), payload);
  }
  return payload as T;
}

/**
 * A picture chosen and read as a data URL — the platform's icon and logo are
 * stored that way, as the console stores them.
 */
export async function pickPictureAsDataUrl(): Promise<string | null> {
  let p: Picker;
  try {
    p = picker();
  } catch (e) {
    throw e instanceof PickerMissing ? e : new PickerMissing();
  }
  const chosen = await p.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, base64: true });
  const a = chosen.canceled ? null : chosen.assets[0];
  if (!a?.base64) return null;
  return `data:${a.mimeType ?? "image/png"};base64,${a.base64}`;
}
