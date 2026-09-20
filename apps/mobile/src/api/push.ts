/**
 * Asking to be told things, and stopping.
 *
 * Four events reach this app — a new booking, a payment, tomorrow's
 * arrivals, an agency waiting to be verified — and none of them arrives
 * unless the device has handed the server a token.
 *
 * **Registered on sign-in, forgotten on sign-out, and the second half is
 * the important one.** A token is a standing permission to push at
 * whoever is holding the device. A phone that is sold, lent or handed to
 * a new clerk must stop receiving the resort's bookings, and the only
 * moment we reliably know it has left somebody's hands is the moment
 * they sign out of it.
 *
 * **Nothing is imported at the top of this file.** Expo Go dropped
 * Android push with SDK 53, and `expo-notifications` does not merely
 * return nothing there — importing it throws, at module scope, before
 * any screen renders. That crashed the app on the first launch after
 * this was written: a red screen on the login screen of an app whose
 * sign-in has nothing to do with notifications. So the module is
 * required inside the function, after the environment has been asked
 * whether it can carry one at all.
 *
 * Every path fails soft. A person who declines, an emulator with no Play
 * Services, a device offline at sign-in, Expo Go — none is a reason to
 * fail a sign-in, and all of them happen. What it will not do is fail
 * silently to whoever is debugging: each refusal says which it was.
 */
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

/** What `client.auth.registerDevice` will accept. */
export type PushPlatform = "android" | "ios";

export const platform: PushPlatform = Platform.OS === "ios" ? "ios" : "android";

/**
 * Expo Go, where there is no push transport to ask for.
 *
 * `storeClient` is the sandbox; a development build or a real APK is
 * `standalone` or `bare`, and only those have a token to give.
 */
export const inExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * This device's Expo push token, or null and a reason.
 *
 * Null is an ordinary outcome, not an error.
 */
export async function pushToken(): Promise<{ token: string | null; why?: string }> {
  if (inExpoGo) {
    return { token: null, why: "Expo Go has carried no push transport since SDK 53" };
  }
  try {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const Notifications = require("expo-notifications") as typeof import("expo-notifications");
    const Device = require("expo-device") as typeof import("expo-device");
    /* eslint-enable @typescript-eslint/no-var-requires */

    if (!Device.isDevice) {
      // a simulator has no push transport either, and asking throws
      return { token: null, why: "not a physical device" };
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return { token: null, why: "permission not given" };

    /**
     * Android needs a channel before anything will be shown, and one made
     * after the first notification arrives is a notification nobody saw.
     */
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Resort Mela",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { data } = await Notifications.getExpoPushTokenAsync();
    return { token: data };
  } catch (ex) {
    return { token: null, why: (ex as Error).message };
  }
}
