"use client";

/**
 * Changing a password: two forms, because they are two different acts.
 *
 * **Your own** asks for the current one. It is the only proof the console has
 * that the person typing is the person who owns the account, and without it an
 * unlocked laptop left on a desk is a stolen account.
 *
 * **Somebody else's** asks for no current password, because whoever is doing
 * it does not know it — and that is exactly why the server keeps it behind its
 * own permission rather than folding it into "manage users". The form says so
 * out loud, so nobody presses it thinking it sends an email.
 *
 * Both check what they can before spending a request — `newPasswordError` is
 * the same rule the reset screen uses — and show the server's own sentence
 * when the server is the one that refuses.
 */

import { useState } from "react";
import { newPasswordError } from "@rh/shared";
import { api, client } from "@/lib/api";
import { Button, Card, Field, Input, useToast } from "@/components/ui";

/** Your own, from inside the console. */
export function ChangeMyPassword() {
  const { push } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const problem = next || confirm ? newPasswordError(next, confirm) : null;

  async function save() {
    const err = newPasswordError(next, confirm);
    if (err) {
      push(err, "err");
      return;
    }
    setBusy(true);
    try {
      await client.auth.changePassword(next, current);
      push("Your password has been changed");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Your password">
      <div className="max-w-sm space-y-3">
        <Field label="Current password">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" hint="at least 8 characters">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="New password again">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        {problem && <p className="text-xs font-medium text-red-600">{problem}</p>}
        <Button onClick={save} disabled={busy || !current || !!newPasswordError(next, confirm)}>
          {busy ? "Saving…" : "Change password"}
        </Button>
        {/*
          Said here rather than discovered later. Sessions are seven-day tokens
          trusted without a lookup, so a change locks the next sign-in, not one
          already open — including, if somebody else is in the account, theirs.
        */}
        <p className="text-[11px] leading-relaxed text-slate-500">
          You will keep working here without signing in again. A session already open elsewhere also
          keeps working — if you think somebody else is in your account, tell the resort owner so
          they can suspend it.
        </p>
      </div>
    </Card>
  );
}

/**
 * Somebody else's, from a team screen.
 *
 * `endpoint` is the caller's, because the two panels post to different routes
 * behind different permissions — the resort's staff and an agency's own — and
 * a component that worked out which was which from a prop would be a third
 * place for that rule to live.
 */
export function SetSomeonesPassword({
  name,
  endpoint,
  onDone,
}: {
  name: string;
  endpoint: string;
  onDone?: () => void;
}) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const problem = next || confirm ? newPasswordError(next, confirm) : null;

  function close() {
    setOpen(false);
    setNext("");
    setConfirm("");
  }

  async function save() {
    const err = newPasswordError(next, confirm);
    if (err) {
      push(err, "err");
      return;
    }
    setBusy(true);
    try {
      await api(endpoint, { method: "POST", body: { password: next } });
      push(`${name} can sign in with the new password`);
      close();
      onDone?.();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        Password
      </button>
    );
  }

  return (
    <div className="w-full max-w-xs space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-left">
      <p className="text-[11px] font-semibold text-slate-600">New password for {name}</p>
      <Input
        type="password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        placeholder="at least 8 characters"
        autoComplete="new-password"
        className="!py-1 text-xs"
      />
      <Input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="type it again"
        autoComplete="new-password"
        className="!py-1 text-xs"
      />
      {problem && <p className="text-[11px] font-medium text-red-600">{problem}</p>}
      {/* the thing people get wrong about this button: nobody is told but you */}
      <p className="text-[10px] leading-relaxed text-slate-500">
        Nothing is emailed. Tell {name} the new password yourself, and ask them to change it from
        Account.
      </p>
      <div className="flex gap-1.5">
        <button
          onClick={save}
          disabled={busy || !!newPasswordError(next, confirm)}
          className="rounded-lg border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Set it"}
        </button>
        <button
          onClick={close}
          disabled={busy}
          className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
