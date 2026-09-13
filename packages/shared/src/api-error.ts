/**
 * What a refused request throws.
 *
 * It lived in `apps/web/src/lib/api.ts` — a `"use client"` module that reaches
 * for `localStorage` and `window.location` — which meant that anything wanting
 * to ask "was this a 5xx or a 403?" had to import the browser to find out. The
 * offline queue asks exactly that, on every failed write, and it runs on a
 * phone.
 *
 * The class carries `status` because the distinction it draws is the one every
 * caller needs: a 5xx or a lost connection is worth retrying, and a 4xx is the
 * server saying no and meaning it.
 */
export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}
