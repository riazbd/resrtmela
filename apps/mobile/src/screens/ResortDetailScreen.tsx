import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, ScrollView, Text, View } from "react-native";
import {
  guestAvailability, guestBook, guestResort, guestTrips, guestActivitySlots,
  guestAddActivity, bdt, dmy,
  type GuestAvailability, type GuestResort, type GuestTrip,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { Badge, Button, Card, Empty, Input, S, Spinner, COLORS } from "../components/Ui";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ResortDetailScreen({ resortId, onBack }: { resortId: number; onBack: () => void }) {
  const { me } = useAuth();
  const [resort, setResort] = useState<GuestResort | null>(null);
  const [checkIn, setCheckIn] = useState(() => iso(new Date(Date.now() + 86400000)));
  const [checkOut, setCheckOut] = useState(() => iso(new Date(Date.now() + 3 * 86400000)));
  const [avail, setAvail] = useState<GuestAvailability[] | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [fullName, setFullName] = useState("");
  const [searching, setSearching] = useState(false);
  const [booking, setBooking] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openSlots, setOpenSlots] = useState<number | null>(null);
  const [slots, setSlots] = useState<{ id: number; startsAt: string; remaining: number }[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [pickedSlot, setPickedSlot] = useState<{ id: number; name: string } | null>(null);
  const [trips, setTrips] = useState<GuestTrip[] | null>(null);
  const [seatQty, setSeatQty] = useState(1);

  const load = useCallback(async () => {
    setResort(null);
    setResort(await guestResort(resortId));
  }, [resortId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (pickedSlot) void openTripPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedSlot]);

  const nights = Math.max(
    0,
    Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000),
  );

  async function search() {
    setErr(null);
    setSearching(true);
    setAvail(null);
    try {
      const a = await guestAvailability(resortId, checkIn, checkOut);
      setAvail(a);
      const init: Record<number, number> = {};
      for (const t of a) if (t.available > 0) init[t.roomTypeId] = 0;
      setQty(init);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function book() {
    const items = Object.entries(qty)
      .map(([roomTypeId, q]) => ({ roomTypeId: Number(roomTypeId), qty: q }))
      .filter((i) => i.qty > 0);
    if (items.length === 0) return;
    setErr(null);
    setBooking(true);
    try {
      const trip = await guestBook({
        resortId,
        items,
        checkIn,
        checkOut,
        adults: 2,
        children: 0,
        fullName: fullName || undefined,
        remarks: "booked via app — pay at resort",
      });
      setConfirmed(`${trip.code} · due ${bdt(trip.due)}`);
      setAvail(null);
      setQty({});
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBooking(false);
    }
  }

  const totalEstimate = (avail ?? []).reduce(
    (sum, t) => sum + (qty[t.roomTypeId] ?? 0) * t.pricePerNight * nights,
    0,
  );
  const pickedCount = Object.values(qty).reduce((s, q) => s + q, 0);

  async function toggleSlots(catalogId: number) {
    if (openSlots === catalogId) {
      setOpenSlots(null);
      return;
    }
    setOpenSlots(catalogId);
    setSlots(null);
    setSlotsLoading(true);
    try {
      setSlots(await guestActivitySlots(catalogId, 7));
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }

  function addToTrip(slot: { id: number; startsAt: string; remaining: number }) {
    const act = resort?.activities?.find((a) => (slots ?? []).some((s) => s.id === slot.id));
    setPickedSlot({ id: slot.id, name: act?.name ?? "Activity" });
    setSeatQty(1);
    setTrips(null);
  }

  async function openTripPicker() {
    setTrips(null);
    const all = await guestTrips();
    setTrips(all.filter((t) => t.resortId === resortId && ["PENDING", "CONFIRMED"].includes(t.state)));
  }

  async function attach(tripId: number) {
    if (!pickedSlot) return;
    setBooking(true);
    try {
      await guestAddActivity(tripId, pickedSlot.id, seatQty);
      Alert.alert("Added!", `${pickedSlot.name} added to your trip — see My trips.`);
      setPickedSlot(null);
    } catch (e) {
      Alert.alert("Failed", (e as Error).message);
    } finally {
      setBooking(false);
    }
  }

  if (resort === null) return <Spinner />;

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <Text onPress={onBack} style={{ color: COLORS.brand, fontSize: 13, fontWeight: "600", marginBottom: 8 }}>
        ← All resorts
      </Text>
      <Text style={S.h1}>{resort.name}</Text>
      {resort.location ? <Text style={[S.sub, { marginBottom: 10 }]}>{resort.location}</Text> : null}

      <Card>
        <Text style={[S.h2, { marginBottom: 8 }]}>Your stay</Text>
        <View style={[S.row, { gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={S.tiny}>CHECK-IN</Text>
            <Input value={checkIn} onChangeText={setCheckIn} placeholder="YYYY-MM-DD" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={S.tiny}>CHECK-OUT</Text>
            <Input value={checkOut} onChangeText={setCheckOut} placeholder="YYYY-MM-DD" />
          </View>
        </View>
        {nights > 0 && <Text style={[S.tiny, { marginTop: 4 }]}>{nights} night(s)</Text>}
        <View style={{ marginTop: 10 }}>
          <Button title="Check availability" onPress={search} loading={searching} disabled={nights <= 0} />
        </View>
      </Card>

      {err && <Text style={{ color: COLORS.red, fontSize: 12, marginBottom: 8 }}>{err}</Text>}

      {confirmed && (
        <Card style={{ backgroundColor: "#f0fdf4", borderColor: "#86efac" }}>
          <Text style={[S.h2, { color: COLORS.brand }]}>Booked! {confirmed}</Text>
          <Text style={S.tiny}>Find it under Trips — pay at the resort on arrival.</Text>
          <View style={{ marginTop: 8 }}>
            <Button title="Great" variant="ghost" onPress={() => setConfirmed(null)} />
          </View>
        </Card>
      )}

      {avail !== null && avail.length === 0 && <Empty msg="No rooms at this resort yet" />}

      {avail !== null && avail.length > 0 && (
        <Card>
          <Text style={[S.h2, { marginBottom: 8 }]}>Available rooms</Text>
          {avail.map((t) => {
            const q = qty[t.roomTypeId] ?? 0;
            return (
              <View key={t.roomTypeId} style={[S.row, S.between, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={S.h2}>{t.name}</Text>
                  <Text style={S.tiny}>
                    {bdt(t.pricePerNight)}/night · sleeps {t.maxAdults}+{t.maxChildren} · {t.available} left
                  </Text>
                </View>
                {t.available === 0 ? (
                  <Badge value="CANCELLED" />
                ) : (
                  <View style={[S.row, { gap: 10, alignItems: "center" }]}>
                    <Text onPress={() => setQty((s) => ({ ...s, [t.roomTypeId]: Math.max(0, q - 1) }))}
                      style={{ fontSize: 22, color: COLORS.brand, paddingHorizontal: 6 }}>−</Text>
                    <Text style={{ fontSize: 16, fontWeight: "700", width: 20, textAlign: "center" }}>{q}</Text>
                    <Text onPress={() => setQty((s) => ({ ...s, [t.roomTypeId]: Math.min(t.available, q + 1) }))}
                      style={{ fontSize: 22, color: COLORS.brand, paddingHorizontal: 6 }}>+</Text>
                  </View>
                )}
              </View>
            );
          })}

          {pickedCount > 0 && (
            <>
              <View style={{ marginTop: 10 }}>
                <Input placeholder="Your full name" value={fullName} onChangeText={setFullName} />
              </View>
              <View style={[S.row, S.between, { marginTop: 10 }]}>
                <Text style={S.sub}>
                  {pickedCount} room(s) × {nights}n ≈ <Text style={{ fontWeight: "800", color: COLORS.text }}>{bdt(totalEstimate)}</Text>
                </Text>
                <Button title="Book — pay at resort" onPress={book} loading={booking} />
              </View>
            </>
          )}
        </Card>
      )}

      {(resort.activities ?? []).length > 0 && (
        <Card>
          <Text style={[S.h2, { marginBottom: 6 }]}>Activities</Text>
          {(resort.activities ?? []).map((a) => (
            <View key={a.id} style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 8 }}>
              <View style={[S.row, S.between]}>
                <View style={{ flex: 1 }}>
                  <Text style={S.h2}>{a.name}</Text>
                  <Text style={S.tiny}>{a.durationMin} min · {bdt(a.price)} / person</Text>
                </View>
                <Button
                  title={openSlots === a.id ? "Hide" : "See times"}
                  variant="ghost"
                  onPress={() => void toggleSlots(a.id)}
                />
              </View>
              {openSlots === a.id && (
                <View style={{ marginTop: 8 }}>
                  {(slots ?? []).length === 0 && !slotsLoading && (
                    <Text style={S.tiny}>No upcoming times this week</Text>
                  )}
                  {slotsLoading && slots === null && <Spinner />}
                  {(slots ?? []).map((sl) => (
                    <View key={sl.id} style={[S.row, S.between, { paddingVertical: 6 }]}>
                      <Text style={S.sub}>
                        {new Date(sl.startsAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {"  "}· {sl.remaining} left
                      </Text>
                      <Button title="Add to trip" onPress={() => addToTrip(sl)} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </Card>
      )}

      {(resort.roomTypes ?? []).length === 0 && <Empty msg="Room details coming soon" />}

      {/* trip picker for activity add-to-stay */}
      <Modal visible={pickedSlot !== null} animationType="slide" transparent onRequestClose={() => setPickedSlot(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: "75%" }}>
            <Text style={S.h1}>Add to trip</Text>
            <Text style={[S.sub, { marginBottom: 8 }]}>
              {pickedSlot?.name} — {pickedSlot ? new Date((slots ?? []).find((s) => s.id === pickedSlot.id)?.startsAt ?? "").toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : ""}
            </Text>
            <View style={[S.row, S.between, { marginBottom: 10 }]}>
              <Text style={S.sub}>Seats</Text>
              <View style={[S.row, { gap: 14, alignItems: "center" }]}>
                <Text onPress={() => setSeatQty((q) => Math.max(1, q - 1))} style={{ fontSize: 24, color: COLORS.brand, paddingHorizontal: 8 }}>−</Text>
                <Text style={{ fontSize: 16, fontWeight: "700" }}>{seatQty}</Text>
                <Text onPress={() => setSeatQty((q) => Math.min(10, q + 1))} style={{ fontSize: 24, color: COLORS.brand, paddingHorizontal: 8 }}>+</Text>
              </View>
            </View>

            {trips === null ? (
              <Spinner />
            ) : trips.length === 0 ? (
              <Empty msg="No changeable trips at this resort — book a room first" />
            ) : (
              trips.map((t) => (
                <View key={t.id} style={[S.card, { paddingVertical: 10 }]}>
                  <View style={[S.row, S.between]}>
                    <View style={{ flex: 1 }}>
                      <Text style={S.h2}>{t.code}</Text>
                      <Text style={S.tiny}>{dmy(t.checkIn)} → {dmy(t.checkOut)} · {t.rooms.join(", ")}</Text>
                    </View>
                    <Badge value={t.state} />
                  </View>
                  <View style={{ marginTop: 8 }}>
                    <Button title="Add to this trip" onPress={() => attach(t.id)} loading={booking} />
                  </View>
                </View>
              ))
            )}
            <Button title="Close" variant="ghost" onPress={() => setPickedSlot(null)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
