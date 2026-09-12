/**
 * Resort Mela, for the two audiences that pay for it: resort staff and agents.
 *
 * The role decides what the user sees, and the console already knows how to do
 * that — so there is no role logic here, and there is no guest build, because
 * since 2026-09-11 a guest is a row in a resort's register rather than an
 * account.
 */
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import { ConsoleScreen } from "./src/console/ConsoleScreen";

/** Set in app.json so the build, not the source, decides which server. */
const CONSOLE_URL =
  (Constants.expoConfig?.extra?.consoleUrl as string | undefined) ?? "https://resortmela.rootcodebd.com";

SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden; not worth crashing the app over */
});

export default function App() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // `isInternetReachable` rather than `isConnected`: a resort's wifi is
    // frequently up while its uplink is not, and the difference is the whole
    // reason the offline screen exists
    const stop = NetInfo.addEventListener((state) => {
      setOnline(state.isInternetReachable ?? state.isConnected ?? false);
    });
    SplashScreen.hideAsync().catch(() => {});
    return stop;
  }, []);

  return (
    <SafeAreaProvider>
      {/* dark glyphs: the safe area behind them is white, like the console's header */}
      <StatusBar style="dark" />
      <SafeAreaView style={styles.fill} edges={["top", "bottom"]}>
        <View style={styles.fill}>
          <ConsoleScreen consoleUrl={CONSOLE_URL} online={online} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#ffffff" },
});
