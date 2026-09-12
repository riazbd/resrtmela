/**
 * The console, hosted natively.
 *
 * Release 0 renders the whole product through one WebView. That is deliberate
 * and temporary: every screen of both panels works from the first build, and
 * native screens replace this one at a time (see the design doc). What this
 * file owns is everything the browser would have done badly — the back button,
 * refreshing, links that belong to other apps, and the state of the network.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { routeFor } from "./url-policy";

export function ConsoleScreen({ consoleUrl, online }: { consoleUrl: string; online: boolean }) {
  const webview = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  /**
   * Android's back button, given the meaning it has in every other app: go
   * back a page, and only leave when there is nowhere left to go. The default
   * closes the app from any depth, which reads as a crash to anyone three
   * screens into a booking.
   */
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack.current) return false;
      webview.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  const reload = useCallback(() => {
    setFailed(false);
    setLoading(true);
    webview.current?.reload();
  }, []);

  // a failed load is shown whether or not the phone believes it is online:
  // "connected" to a wifi that goes nowhere is the commonest case at a resort
  if (failed) return <Offline online={online} onRetry={reload} />;

  return (
    <View style={styles.fill}>
      <WebView
        ref={webview}
        source={{ uri: consoleUrl }}
        style={styles.fill}
        // the console stores its session token itself; this keeps it across
        // launches so staff sign in once, not every morning
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        // the console's uploads: a guest's ID, a bKash slip, room damage
        allowsInlineMediaPlayback
        mediaCapturePermissionGrantType="grant"
        onNavigationStateChange={(nav: WebViewNavigation) => {
          canGoBack.current = nav.canGoBack;
        }}
        onShouldStartLoadWithRequest={(req) => {
          const route = routeFor(req.url, consoleUrl);
          if (route === "outside") {
            Linking.openURL(req.url).catch(() => {
              /* no app for this scheme; refusing is better than crashing */
            });
          }
          return route === "inside";
        }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setFailed(true);
          setLoading(false);
        }}
        pullToRefreshEnabled
      />
      {loading && <Spinner />}
    </View>
  );
}

function Spinner() {
  return (
    <View style={styles.centred} pointerEvents="none">
      <ActivityIndicator size="large" color="#15803d" />
    </View>
  );
}

/**
 * What a phone with no signal shows. English, like the console — English is
 * this platform's default and Bangla is a toggle inside it, and a native
 * screen does not get to disagree with the product it wraps.
 */
function Offline({ online, onRetry }: { online: boolean; onRetry: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.centredPage}>
      <Text style={styles.offlineTitle}>{online ? "Could not load" : "No connection"}</Text>
      <Text style={styles.offlineBody}>
        {online
          ? "Resort Mela is not answering right now. Nothing you have done is lost."
          : "Resort Mela needs the network to load. Reconnect and try again."}
      </Text>
      <TouchableOpacity style={styles.retry} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.retryText}>Try again</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#ffffff" },
  centred: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  centredPage: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  offlineTitle: { fontSize: 22, fontWeight: "600", color: "#111827", marginBottom: 8 },
  offlineBody: { fontSize: 15, lineHeight: 22, color: "#4b5563", textAlign: "center", marginBottom: 24 },
  retry: { backgroundColor: "#15803d", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
});
