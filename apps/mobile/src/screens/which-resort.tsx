/**
 * The states between opening a screen and being able to use it.
 *
 * Every screen in this app needs a resort before it can ask the server
 * anything, and nineteen of them said the same thing when they did not
 * have one: *"No resort selected — choose a resort from the More tab."*
 *
 * That sentence is true of exactly one situation and was being shown in
 * three.
 *
 * **Restoring.** The session reads device storage and then fetches
 * `/auth/me`; until that lands there is no active resort. In a browser
 * this never showed — storage answers in under a millisecond and the
 * fetch is on a desk's connection. On a phone, opened cold from a deep
 * link on a hill-district connection, it is seconds, and it is the
 * first thing a person sees.
 *
 * **Signed out.** Found by opening the app on the owner's own phone,
 * through Expo Go, after the fix above had already shipped. Every word
 * of the sentence is wrong here: there is no resort to choose, no More
 * tab worth opening, and no owner who could add this person to one.
 * They have not signed in. The first fix counted the states and got two
 * of them, which is the whole lesson — enumerate the states, do not
 * patch the one in front of you.
 *
 * **Signed in, no resort.** Only here is the sentence right, and only
 * here is there something for the reader to do.
 */
import { router } from "expo-router";
import { View, StyleSheet } from "react-native";
import { Button } from "../design/button";
import { Empty, Loading } from "../design/states";
import { space } from "../design/tokens";
import { useAuth } from "../api/session";

export function WhichResort({
  /** What this screen would have been loading, for the honest message. */
  what = "your resort",
}: {
  what?: string;
}) {
  const { loading, me } = useAuth();

  if (loading) return <Loading what={what} />;

  if (!me) {
    return (
      <View style={styles.middle}>
        <Empty
          message="You are not signed in"
          hint="Sign in and this screen will have something to show you."
        />
        <View style={styles.door}>
          <Button label="Sign in" onPress={() => router.replace("/login")} />
        </View>
      </View>
    );
  }

  return (
    <Empty
      message="No resort selected"
      hint="Choose a resort from the More tab, or ask the owner to add you to one."
    />
  );
}

const styles = StyleSheet.create({
  middle: { flex: 1, justifyContent: "center" },
  // the sentence above it is centred in the screen; the button sits under
  // it rather than in the middle of its own empty half
  door: { paddingHorizontal: space.xl, paddingTop: space.lg },
});
