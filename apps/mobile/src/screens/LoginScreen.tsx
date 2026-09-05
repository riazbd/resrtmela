import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useAuth } from "../lib/auth";
import { requestOtp, verifyOtp } from "../lib/api";
import { Button, Input, COLORS, S } from "../components/Ui";

export default function LoginScreen() {
  const { login, loginWithToken } = useAuth();
  const [mode, setMode] = useState<"staff" | "guest">("guest");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function staffLogin() {
    setErr(null);
    setBusy(true);
    try {
      await login(phone, password);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    setErr(null);
    setBusy(true);
    try {
      const res = await requestOtp(phone);
      setOtpSent(true);
      setHint(res.devCode ? `Dev code: ${res.devCode}` : "Code sent via SMS");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setErr(null);
    setBusy(true);
    try {
      const res = await verifyOtp(phone, code);
      await loginWithToken(res.accessToken);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.brandDark }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <View
            style={{
              width: 56, height: 56, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.12)",
              alignItems: "center", justifyContent: "center", marginBottom: 10,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: "800" }}>R</Text>
          </View>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>Resort Mela</Text>
        </View>

        <View style={{ flexDirection: "row", backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 12, padding: 4, marginBottom: 14 }}>
          {(["guest", "staff"] as const).map((m) => (
            <Text
              key={m}
              onPress={() => { setMode(m); setErr(null); setOtpSent(false); setHint(null); }}
              style={{
                flex: 1, textAlign: "center", paddingVertical: 8, borderRadius: 9,
                fontSize: 13, fontWeight: "600",
                color: mode === m ? COLORS.brandDark : "#bbf7d0",
                backgroundColor: mode === m ? "#fff" : "transparent",
              }}
            >
              {m === "guest" ? "I'm a guest" : "Staff / Agent"}
            </Text>
          ))}
        </View>

        <View style={{ backgroundColor: "#fff", borderRadius: 18, padding: 18, gap: 12 }}>
          <Input
            placeholder="Phone (01XXXXXXXXX)"
            keyboardType="phone-pad"
            autoCapitalize="none"
            value={phone}
            onChangeText={setPhone}
          />

          {mode === "staff" ? (
            <>
              <Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
              <Button title="Sign in" onPress={staffLogin} loading={busy} disabled={!phone || !password} />
            </>
          ) : otpSent ? (
            <>
              <Input
                placeholder="6-digit code"
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={setCode}
              />
              {hint && <Text style={{ color: COLORS.brand, fontSize: 12, fontWeight: "600" }}>{hint}</Text>}
              <Button title="Verify & continue" onPress={verifyCode} loading={busy} disabled={code.length !== 6} />
              <Button title="Change number" variant="ghost" onPress={() => { setOtpSent(false); setCode(""); setHint(null); }} />
            </>
          ) : (
            <>
              <Text style={S.tiny}>We'll text you a one-time code to sign in or create your account.</Text>
              <Button title="Send code" onPress={sendOtp} loading={busy} disabled={phone.length < 10} />
            </>
          )}

          {err && <Text style={{ color: COLORS.red, fontSize: 12 }}>{err}</Text>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
