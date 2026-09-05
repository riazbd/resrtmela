"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, getToken, setToken, bdt, type GuestResort, type GuestAvailability, type GuestTrip } from "@/lib/api";
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
  const [booking, setBooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  // checkout fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
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
      const res = await api<{ devCode?: string }>("/auth/otp/request", { method: "POST", body: { phone } });
      setOtpSent(true);
      setOtpHint(res.devCode ? `Dev code: ${res.devCode}` : "Code sent via SMS");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function verifyOtp() {
    setErr(null); setBusy(true);
    try {
      const res = await api<{ accessToken: string }>("/auth/otp/verify", { method: "POST", body: { phone, code: otpCode } });
      setToken(res.accessToken);
      setVerified(true);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function book() {
    const items = Object.entries(qty).map(([rt, q]) => ({ roomTypeId: Number(rt), qty: q })).filter((i) => i.qty > 0);
    if (!items.length) return;
    setErr(null); setBooking(true);
    try {
      const trip = await api<GuestTrip>("/guest/bookings", {
        method: "POST",
        body: {
          resortId, items, checkIn, checkOut, adults: 2, children: 0,
          fullName: fullName || undefined, remarks: "booked via web — pay at resort",
        },
      });
      setConfirmed(`${trip.code} · due ৳${trip.due.toLocaleString("en-IN")}`);
      setAvail(null); setQty({});
    } catch (e) { setErr((e as Error).message); } finally { setBooking(false); }
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

          {confirmed && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="font-semibold text-green-800">Booked! {confirmed}</div>
              <p className="mt-1 text-xs text-green-600">Find it under My trips — pay at the resort.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setConfirmed(null)}>OK</Button>
            </div>
          )}

          {avail !== null && avail.length > 0 && (
            <Card className="mt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Available rooms</h3>
              {avail.map((t) => {
                const q = qty[t.roomTypeId] ?? 0;
                return (
                  <div key={t.roomTypeId} className="flex items-center justify-between border-b border-slate-100 py-2">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{t.name}</div>
                      <div className="text-[11px] text-slate-400">৳{t.pricePerNight.toLocaleString("en-IN")}/night · sleeps {t.maxAdults}+{t.maxChildren} · {t.available} left</div>
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
                <div className="mt-3 space-y-3">
                  {!verified && (
                    <div className="rounded-lg bg-slate-50 p-3 space-y-3">
                      <p className="text-xs font-medium text-slate-500">Verify your phone to confirm</p>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Your name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" /></Field>
                        <Field label="Mobile"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" /></Field>
                      </div>
                      {!otpSent ? (
                        <Button size="sm" onClick={sendOtp} loading={busy} disabled={phone.length < 10}>Send OTP</Button>
                      ) : (
                        <div className="space-y-2">
                          <Field label="OTP code"><Input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} maxLength={6} placeholder="6-digit code" /></Field>
                          {otpHint && <p className="text-xs text-brand-600 font-medium">{otpHint}</p>}
                          <Button size="sm" onClick={verifyOtp} loading={busy} disabled={otpCode.length !== 6}>Verify</Button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">
                      {pickedCount} room(s) × {nights}n = <b>৳{total.toLocaleString("en-IN")}</b>
                    </span>
                    <Button onClick={book} loading={booking} disabled={!verified}>Book — pay at resort</Button>
                  </div>
                </div>
              )}
            </Card>
          )}
          {avail !== null && avail.length === 0 && <Empty msg="No rooms available for those dates" />}

          {(resort.activities ?? []).length > 0 && (
            <Card title="Activities (book on arrival)" className="mt-4">
              <div className="flex flex-wrap gap-2">
                {(resort.activities ?? []).map((a) => (
                  <span key={a.id} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs">
                    {a.name} · {a.durationMin}m · ৳{a.price.toLocaleString("en-IN")}
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
