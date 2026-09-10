"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, getToken, setToken, money, type GuestResort, type GuestAvailability } from "@/lib/api";
import { Button, Card, Empty, Field, Input, Spinner, useToast } from "@/components/ui";

function iso(d: Date) { return d.toISOString().slice(0, 10); }

export default function ResortBookingPage() {
  const { id } = useParams<{ id: string }>();
  const resortId = Number(id);
  const router = useRouter();
  const { push } = useToast();

  const [resort, setResort] = useState<GuestResort | null>(null);
  const [checkIn, setCheckIn] = useState(iso(new Date(Date.now() + 86400000)));
  const [checkOut, setCheckOut] = useState(iso(new Date(Date.now() + 3 * 86400000)));
  const [avail, setAvail] = useState<GuestAvailability[] | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // checkout fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [verifyMode, setVerifyMode] = useState<"email" | "phone">("email");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const load = useCallback(async () => {
    setResort(null);
    setResort(await api<GuestResort>(`/guest/resorts/${resortId}`));
  }, [resortId]);

  useEffect(() => { void load(); }, [load]);

  // if already logged in as guest, prefill
  useEffect(() => {
    if (!getToken()) return;
    api<{ fullName: string; phone: string; role: string }>("/auth/me")
      .then((me) => {
        if (me.role === "GUEST") {
          setFullName(me.fullName || "");
          setPhone(me.phone || "");
          setVerified(true);
        }
      })
      .catch(() => {});
  }, []);

  const nights = Math.max(0, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));

  async function search() {
    setErr(null); setSearching(true); setAvail(null);
    try {
      const a = await api<GuestAvailability[]>(`/guest/resorts/${resortId}/availability?from=${checkIn}&to=${checkOut}`);
      setAvail(a);
      const init: Record<number, number> = {};
      for (const t of a) if (t.available > 0) init[t.roomTypeId] = 0;
      setQty(init);
    } catch (e) { setErr((e as Error).message); } finally { setSearching(false); }
  }

  const total = (avail ?? []).reduce((s, t) => s + (qty[t.roomTypeId] ?? 0) * t.pricePerNight * nights, 0);
  const pickedCount = Object.values(qty).reduce((s, q) => s + q, 0);

  async function sendOtp() {
    setErr(null); setBusy(true);
    try {
      const body = verifyMode === "email" ? { email } : { phone };
      const res = await api<{ devCode?: string; sent?: boolean }>("/auth/otp/request", { method: "POST", body });
      setOtpSent(true);
      if (verifyMode === "email") {
        setOtpHint(res.sent === false ? "Email could not be sent — check the address" : "Verification code sent — check your email");
      } else {
        setOtpHint(res.devCode ? `Dev code: ${res.devCode}` : "Code sent via SMS");
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function verifyOtp() {
    setErr(null); setBusy(true);
    try {
      const body = verifyMode === "email" ? { email, code: otpCode } : { phone, code: otpCode };
      const res = await api<{ accessToken: string }>("/auth/otp/verify", { method: "POST", body });
      setToken(res.accessToken);
      setVerified(true);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/book" className="text-sm text-brand-600 hover:underline">← All resorts</Link>
      {!resort ? <Spinner /> : (
        <>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">{resort.name}</h1>
          {resort.location && <p className="text-slate-500">{resort.location}</p>}

          {/* dates */}
          <Card className="mt-6">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Check-in"><Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></Field>
              <Field label="Check-out"><Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></Field>
            </div>
            {nights > 0 && <p className="mt-1 text-xs text-slate-400">{nights} night(s)</p>}
            <Button className="mt-3" onClick={search} loading={searching} disabled={nights <= 0}>Check availability</Button>
          </Card>

          {err && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{err}</div>}

          {avail !== null && avail.length > 0 && (
            <Card className="mt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Available rooms</h3>
              {avail.map((t) => {
                const q = qty[t.roomTypeId] ?? 0;
                return (
                  <div key={t.roomTypeId} className="flex items-center justify-between border-b border-slate-100 py-2">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{t.name}</div>
                      <div className="text-[11px] text-slate-400">{money(t.pricePerNight)}/night · sleeps {t.maxAdults}+{t.maxChildren} · {t.available} left</div>
                    </div>
                    {t.available === 0 ? <Badge value="CANCELLED" /> : (
                      <div className="flex items-center gap-3">
                        <button onClick={() => setQty((s) => ({ ...s, [t.roomTypeId]: Math.max(0, q - 1) }))} className="text-xl text-brand-600 px-2">−</button>
                        <span className="w-5 text-center font-bold">{q}</span>
                        <button onClick={() => setQty((s) => ({ ...s, [t.roomTypeId]: Math.min(t.available, q + 1) }))} className="text-xl text-brand-600 px-2">+</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {pickedCount > 0 && (
                <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-slate-600">{pickedCount} room(s) × {nights} night(s)</span>
                    <span className="text-lg font-bold text-slate-900">{money(total)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    An estimate at today&apos;s rates. The resort confirms the price when it takes the booking.
                  </p>
                  <ContactToBook resort={resort} />
                </div>
              )}
            </Card>
          )}
          {avail !== null && avail.length === 0 && <Empty msg="No rooms available for those dates" />}

          <Card title="Your trips" className="mt-4">
            {verified ? (
              <p className="text-sm text-slate-600">
                Verified.{" "}
                <Link href="/book/trips" className="font-semibold text-brand-600 hover:underline">
                  See your trips →
                </Link>
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Booked through the resort or an agent? Verify your email or mobile to see the stay,
                  its bill and what is still due.
                </p>
                <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-semibold w-fit">
                  {(["email", "phone"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => { setVerifyMode(m); setOtpSent(false); setOtpHint(null); }}
                      className={`rounded-md px-2.5 py-1 ${verifyMode === m ? "bg-brand-600 text-white" : "text-slate-500"}`}
                    >
                      {m === "email" ? "Email" : "Mobile"}
                    </button>
                  ))}
                </div>
                {verifyMode === "email" ? (
                  <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
                ) : (
                  <Field label="Mobile"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" /></Field>
                )}
                {!otpSent ? (
                  <Button size="sm" onClick={sendOtp} loading={busy} disabled={verifyMode === "email" ? !email.includes("@") : phone.length < 10}>
                    Send verification code
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Field label="Verification code"><Input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} maxLength={6} placeholder="6-digit code" /></Field>
                    {otpHint && <p className="text-xs text-brand-600 font-medium">{otpHint}</p>}
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={verifyOtp} loading={busy} disabled={otpCode.length !== 6}>Verify</Button>
                      <button onClick={() => setOtpSent(false)} className="text-xs text-slate-400 hover:text-slate-600">Change {verifyMode === "email" ? "email" : "number"}</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {(resort.activities ?? []).length > 0 && (
            <Card title="Activities (book on arrival)" className="mt-4">
              <div className="flex flex-wrap gap-2">
                {(resort.activities ?? []).map((a) => (
                  <span key={a.id} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs">
                    {a.name} · {a.durationMin}m · {money(a.price)}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Badge({ value }: { value: string }) {
  return <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">Sold out</span>;
}

/**
 * How a guest books, now that they cannot do it here.
 *
 * The page used to end in "Book — pay at resort", which held real rooms the
 * moment it was pressed: a stranger could take a resort's inventory off the
 * market without anybody at the resort being asked. A stay is sold by the
 * resort or by an agent, so this is the handoff — and a handoff without a
 * number on it is just a closed door, which is why `resortDetail` now carries
 * one.
 */
function ContactToBook({ resort }: { resort: GuestResort }) {
  const phone = resort.contactPhone?.trim();
  return (
    <div className="mt-3 border-t border-brand-200 pt-3">
      <div className="text-sm font-semibold text-slate-900">To book, contact the resort</div>
      {phone ? (
        <a href={`tel:${phone}`} className="mt-0.5 inline-block text-lg font-bold text-brand-700 hover:underline">
          {phone}
        </a>
      ) : (
        <p className="mt-0.5 text-sm text-slate-500">
          This resort has not published a number yet — try its website, or ask a travel agent.
        </p>
      )}
      {resort.address && <p className="mt-1 text-xs text-slate-500">{resort.address}</p>}
      {resort.website && (
        <a href={resort.website} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-brand-600 hover:underline">
          {resort.website}
        </a>
      )}
    </div>
  );
}
