import { API_URL } from "@/lib/api-url";
import { fetchHomeData } from "./home-data";
import Home from "./home";

/**
 * The front page, rendered on the server.
 *
 * It used to be a client component that fetched its prices after loading, so
 * the HTML went out with no prices, no plan limits and no trial length in it —
 * the numbers appeared a moment later, and never at all for anything that does
 * not run JavaScript. For the one page whose whole job is to say what the
 * product costs, that is the wrong half to leave until last.
 *
 * The fetching lives in `home-data`, which never throws: the API being briefly
 * quiet costs the prices, exactly as it did before, rather than returning a 500
 * for the front door of the business.
 *
 * Everything that reacts to a click — the menu, the monthly/yearly switch, the
 * resort/agency switch — is in `home.tsx` and receives both price lists as
 * props, so switching between them is instant instead of a round trip.
 */
export default async function HomePage() {
  const data = await fetchHomeData(API_URL);
  return <Home {...data} />;
}
