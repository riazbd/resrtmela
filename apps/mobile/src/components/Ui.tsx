import { StyleSheet, Text, TouchableOpacity, View, TextInput, ActivityIndicator } from "react-native";

export const COLORS = {
  bg: "#f8fafc",
  brand: "#15803d",
  brandDark: "#14532d",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  sub: "#64748b",
  red: "#dc2626",
  amber: "#d97706",
  blue: "#2563eb",
};

export const S = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  row: { flexDirection: "row", alignItems: "center" },
  between: { justifyContent: "space-between" },
  h1: { fontSize: 20, fontWeight: "700", color: COLORS.text },
  h2: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.sub },
  tiny: { fontSize: 10, color: COLORS.sub },
  btn: {
    backgroundColor: COLORS.brand,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnGhost: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  btnDanger: { backgroundColor: COLORS.red },
  btnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  btnGhostText: { color: COLORS.text, fontSize: 12, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#fff",
    color: COLORS.text,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: "600",
    overflow: "hidden",
  },
});

export function Button(props: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: object;
}) {
  const style =
    props.variant === "ghost" ? S.btnGhost : props.variant === "danger" ? [S.btn, S.btnDanger] : S.btn;
  return (
    <TouchableOpacity
      onPress={props.onPress}
      disabled={props.disabled || props.loading}
      style={[style, { opacity: props.disabled ? 0.5 : 1 }, props.style]}
    >
      {props.loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={props.variant === "ghost" ? S.btnGhostText : S.btnText}>{props.title}</Text>
      )}
    </TouchableOpacity>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[S.card, style]}>{children}</View>;
}

export function Badge({ value }: { value: string }) {
  const map: Record<string, string> = {
    CONFIRMED: "#dcfce7",
    PENDING: "#fef3c7",
    CHECKED_IN: "#dbeafe",
    CHECKED_OUT: "#e2e8f0",
    CANCELLED: "#fee2e2",
    NO_SHOW: "#e7e5e4",
    PAID: "#dcfce7",
    PARTIAL: "#ffedd5",
    UNPAID: "#fee2e2",
  };
  const fg: Record<string, string> = {
    CONFIRMED: "#166534", PENDING: "#92400e", CHECKED_IN: "#1e40af",
    CHECKED_OUT: "#475569", CANCELLED: "#991b1b", NO_SHOW: "#44403c",
    PAID: "#166534", PARTIAL: "#9a3412", UNPAID: "#991b1b",
  };
  return (
    <View style={{ backgroundColor: map[value] ?? "#e2e8f0", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, fontWeight: "600", color: fg[value] ?? "#475569" }}>
        {value.replace(/_/g, "-")}
      </Text>
    </View>
  );
}

export function Input(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor="#94a3b8" {...props} style={[S.input, props.style]} />;
}

export function Spinner() {
  return <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.brand} />;
}

export function Empty({ msg }: { msg: string }) {
  return (
    <Text style={{ textAlign: "center", color: COLORS.sub, marginTop: 32, fontSize: 13 }}>{msg}</Text>
  );
}
