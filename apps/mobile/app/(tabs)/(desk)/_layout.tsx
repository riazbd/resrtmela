/**
 * The destinations, inside the bar.
 *
 * Every screen the More list offers used to sit on the root stack, beside
 * the tab navigator rather than inside it — so the bar vanished the moment
 * anybody opened one. Thirteen screens had a back arrow and nothing else:
 * from the day sheet, reaching the bookings list meant going back first,
 * and the rule for which screens kept the bar was invisible because there
 * wasn't one.
 *
 * The owner asked why, which is the right question. A destination is
 * somewhere you go; a bar is how you go somewhere else; taking it away
 * turns a menu into a corridor.
 *
 * So they live in this group now. `(tabs)` and `(desk)` are both groups,
 * and a group contributes no URL segment, so `/daysheet` is still
 * `/daysheet` — every deep link, every `router.push`, and `CONSOLE_NAV`'s
 * own hrefs are untouched. The Tabs layout registers this group with
 * `href: null`: inside the navigator, so the bar draws, but not a button
 * of its own.
 *
 * It is a Stack, so these screens keep their headers and their back
 * arrows. What stays outside is what is not a destination: signing in,
 * the front door, and the two task flows — taking a booking, and the
 * desk's arrive/depart/pay/edit — where a bar would invite somebody to
 * wander off mid-transaction and lose what they had typed.
 */
import { Stack } from "expo-router";
import { color, text } from "../../../src/design/tokens";

export default function DeskLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: color.surface },
        headerTintColor: color.brand[600],
        headerTitleStyle: { color: color.title, fontWeight: "600", fontSize: text.strong.size },
        // a rule, not a shadow: the register below it is drawn in rules
        headerShadowVisible: false,
        contentStyle: { backgroundColor: color.screen },
        animation: "fade",
      }}
    />
  );
}
