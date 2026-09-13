/**
 * Moved to `@rh/shared` so the mobile app runs the same rules.
 *
 * Named rather than `export *`: a star re-export would put all 177 API routes
 * behind this module's name too, and a call site could then lean on something
 * this file was never about without anyone noticing.
 */
export { type BookingHandoff, bookingHandoff } from "@rh/shared";
