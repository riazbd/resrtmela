/**
 * A file from the API, handed to the person holding the phone.
 *
 * The console downloads an export into the browser's downloads. A phone has
 * no downloads folder the app can write to without a native file module, so
 * the file is read as text and given to the share sheet — WhatsApp, Drive,
 * email, "save to files" — which is where somebody on a phone puts a file
 * anyway. In the browser lens it downloads, as the console does.
 */
import { Platform, Share } from "react-native";
import { ApiError } from "@rh/shared";
import { API_URL } from "./config";
import { TOKEN_KEY } from "./transport";
import { session } from "./wire";

export async function shareDownload(path: string, filename: string): Promise<void> {
  const token = session.getItem(TOKEN_KEY);
  const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      message = ((await res.json()) as { message?: string }).message ?? message;
    } catch {
      // the body was not JSON; the status says enough
    }
    throw new ApiError(res.status, message);
  }
  const text = await res.text();
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: filename, message: text });
}
