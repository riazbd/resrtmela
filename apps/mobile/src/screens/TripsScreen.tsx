import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, ScrollView, Text, View } from "react-native";
import {
  guestCancel, guestTrips, createCheckout, confirmMockCheckout,
  bdt, dmy, type GuestTrip,
} from "../lib/api";
import { Badge, Button, Empty, S, Spinner, COLORS } from "../components/Ui";

export default function TripsScreen({ refreshKey }: { refreshKey: number }) {
  const [trips, setTrips] = useState<GuestTrip[] | null>(null);
  const [open, setOpen] = useState<GuestTrip | null>(null);
  const [busy, setBusy] = useState(false);
  const [payFor, setPayFor] = useState<GuestTrip | null>(null);
  const [method, setMethod] = useState<"BKASH" | "NAGAD">("BKASH");
  const [payStage, setPayStage] = useState<"form" | "gateway" | "done">("form");
  const [payResult, setPayResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTrips(null);
    try {
      setTrips(await guestTrips());
    } catch {
      setTrips([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function cancel(trip: GuestTrip) {
    Alert.alert("Cancel booking?", `${trip.code} will be cancelled.`, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await guestCancel(trip.id);
            setOpen(null);
            await load();
          } catch (e) {
            Alert.alert("Failed", (e as Error).message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  async function pay() {
    if (!payFor) return;
    setBusy(true);
    try {
      const co = await createCheckout(payFor.id, method, payFor.due);
      // simulate the hosted gateway page: a beat, then the gateway confirms
      setPayStage("gateway");
      await new Promise((r) => setTimeout(r, 1200));
      const res = await confirmMockCheckout(co.providerRef);
      setPayResult(`${res.booking.paid > 0 ? `Paid ${bdt(res.booking.paid)}` : ""} · due ${bdt(res.booking.due)}`);
      setPayStage("done");
      await load();
    } catch (e) {
      Alert.alert("Payment failed", (e as Error).message);
      setPayStage("form");
    } finally {
      setBusy(false);
    }
  }

  if (trips === null) return <Spinner />;

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <Text style={[S.h1, { marginBottom: 10 }]}>My trips</Text>
      {trips.length === 0 && <Empty msg="No trips yet — explore resorts to book your first stay" />}
      {trips.map((t) => (
        <View key={t.id} style={S.card}>
          <View style={[S.row, S.between]}>
            <View style={{ flex: 1 }}>
              <Text style={S.h2}>{t.resortName ?? t.resort?.name}</Text>
              <Text style={S.tiny}>
                {t.code} · {dmy(t.checkIn)} → {dmy(t.checkOut)} · {t.rooms.join(", ")}
              </Text>
              <Text style={S.tiny}>due {bdt(t.due)}</Text>
            </View>
            <View style={{ gap: 4, alignItems: "flex-end" }}>
              <Badge value={t.state} />
              <Badge value={t.paymentState} />
            </View>
          </View>
          <View style={{ marginTop: 8 }}>
            <Button title="Details" variant="ghost" onPress={() => setOpen(t)} />
          </View>
        </View>
      ))}

      <Modal visible={open !== null} animationType="slide" transparent onRequestClose={() => setOpen(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: "80%" }}>
            {open && (
              <ScrollView>
                <Text style={S.h1}>{open.code}</Text>
                <Text style={[S.sub, { marginBottom: 10 }]}>
                  {open.resortName ?? open.resort?.name}
                </Text>
                <View style={[S.row, { gap: 6, marginBottom: 10 }]}>
                  <Badge value={open.state} />
                  <Badge value={open.paymentState} />
                </View>
                <Text style={S.sub}>
                  {dmy(open.checkIn)} → {dmy(open.checkOut)} · {open.nights} night(s) · {open.adults} adults
                  {(open.children ?? 0) > 0 ? ` · ${open.children} children` : ""}
                </Text>
                <Text style={[S.sub, { marginTop: 2 }]}>Rooms: {open.rooms.join(", ")}</Text>
                {(open.activities ?? []).length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={[S.tiny, { fontWeight: '700' }]}>ACTIVITIES</Text>
                    {(open.activities ?? []).map((a) => (
                      <View key={a.itemId} style={[S.row, S.between, { paddingVertical: 3 }]}>
                        <Text style={S.tiny}>
                          {a.name} � {a.qty} � {new Date(a.startsAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        <Text style={{ fontSize: 11, fontWeight: '600' }}>{bdt(a.unitPrice * a.qty)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10, gap: 2 }}>
                  <View style={[S.row, S.between]}>
                    <Text style={S.sub}>Rent</Text>
                    <Text style={{ fontWeight: "600" }}>{bdt(open.rent)}</Text>
                  </View>
                  {open.discount > 0 && (
                    <View style={[S.row, S.between]}>
                      <Text style={S.sub}>Discount</Text>
                      <Text>-{bdt(open.discount)}</Text>
                    </View>
                  )}
                  <View style={[S.row, S.between]}>
                    <Text style={S.sub}>Paid</Text>
                    <Text style={{ color: COLORS.brand, fontWeight: "600" }}>{bdt(open.paid)}</Text>
                  </View>
                  <View style={[S.row, S.between]}>
                    <Text style={[S.sub, { fontWeight: "700" }]}>Due at resort</Text>
                    <Text style={{ fontWeight: "800", fontSize: 15, color: COLORS.red }}>{bdt(open.due)}</Text>
                  </View>
                </View>

                {open.remarks ? (
                  <Text style={[S.tiny, { marginTop: 8, fontStyle: "italic" }]}>{open.remarks}</Text>
                ) : null}

                <View style={[S.row, { gap: 8, marginTop: 16 }]}>
                  {open.state === "PENDING" && (
                    <Button title="Cancel booking" variant="danger" loading={busy} onPress={() => cancel(open)} style={{ flex: 1 }} />
                  )}
                  {open.due > 0 && ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(open.state) && (
                    <Button title="Pay online" onPress={() => { setPayFor(open); setPayStage("form"); setPayResult(null); }} style={{ flex: 1 }} />
                  )}
                  <Button title="Close" variant="ghost" onPress={() => setOpen(null)} style={{ flex: 1 }} />
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* mock gateway checkout */}
      <Modal visible={payFor !== null} animationType="fade" transparent onRequestClose={() => setPayFor(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 18, padding: 20, width: "100%", maxWidth: 380 }}>
            <Text style={S.h2}>Secure checkout</Text>
            {payFor && (
              <Text style={[S.tiny, { marginTop: 2 }]}>
                {payFor.code} · {bdt(payFor.due)} due
              </Text>
            )}
            {payStage === "form" && (
              <View style={{ marginTop: 14, gap: 10 }}>
                <Text style={S.sub}>Choose payment method (demo gateway)</Text>
                <View style={[S.row, { gap: 8 }]}>
                  {(["BKASH", "NAGAD"] as const).map((m) => (
                    <View key={m} style={{ flex: 1 }}>
                      <Button
                        title={m}
                        variant={method === m ? "primary" : "ghost"}
                        onPress={() => setMethod(m)}
                      />
                    </View>
                  ))}
                </View>
                <Button title={`Pay ${payFor ? bdt(payFor.due) : ""}`} onPress={pay} loading={busy} />
                <Button title="Cancel" variant="ghost" onPress={() => setPayFor(null)} />
              </View>
            )}
            {payStage === "gateway" && (
              <View style={{ marginTop: 16, alignItems: "center", gap: 8 }}>
                <Spinner />
                <Text style={S.sub}>Contacting {method} gateway…</Text>
              </View>
            )}
            {payStage === "done" && (
              <View style={{ marginTop: 14, gap: 10, alignItems: "center" }}>
                <Text style={[S.h2, { color: COLORS.brand }]}>Payment successful</Text>
                {payResult ? <Text style={S.sub}>{payResult}</Text> : null}
                <Button title="Done" onPress={() => { setPayFor(null); setOpen(null); }} />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
