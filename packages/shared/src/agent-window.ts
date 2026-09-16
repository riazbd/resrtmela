/**
 * How far ahead a resort lets agencies sell.
 *
 * The window is a number of days, stored as the resort chose it — these are
 * the three the settings screen offers as one tap, not the only three there
 * are. Empty means no limit.
 */
export const AGENT_BOOKING_WINDOW_PRESETS = [30, 60, 90] as const;

/** The longest window a resort can set: two years is past any season anyone plans. */
export const AGENT_BOOKING_WINDOW_MAX_DAYS = 730;
