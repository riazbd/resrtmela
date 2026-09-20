/**
 * The state between signing in and knowing where you work.
 *
 * Every screen in this app needs a resort before it can ask the server
 * anything, and nineteen of them said the same thing when they did not
 * have one: *"No resort selected — choose a resort from the More tab."*
 *
 * That sentence is true of exactly one situation and was being shown in
 * two. The session restores from device storage and then fetches
 * `/auth/me`; until that lands there is no active resort, and a screen
 * reached before it does told the person to go and fix something that
 * was not broken. In a browser this never showed — storage answers in
 * under a millisecond and the fetch is on a desk's connection. On a
 * device, opened cold from a deep link on a hill-district connection,
 * it is seconds, and it is the first thing a person sees.
 *
 * So: while the session is loading, this is a loading state. Only once
 * it has finished loading and there is still no resort is it a thing to
 * act on — and then the sentence is right.
 */
import { Empty, Loading } from "../design/states";
import { useAuth } from "../api/session";

export function WhichResort({
  /** What this screen would have been loading, for the honest message. */
  what = "your resort",
}: {
  what?: string;
}) {
  const { loading } = useAuth();

  if (loading) return <Loading what={what} />;

  return (
    <Empty
      message="No resort selected"
      hint="Choose a resort from the More tab, or ask the owner to add you to one."
    />
  );
}
