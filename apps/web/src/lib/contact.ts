/**
 * Moved to `@rh/shared` so the mobile app runs the same rules.
 *
 * `isPlaceholderEmail` / `isPlaceholderPhone` are re-exported here because this
 * module has always been where the console's forms reach for them, and moving
 * the file is not a reason to make every caller learn a new address.
 */
export {
  type ContactFields,
  changedContactFields,
  displayEmail,
  displayPhone,
  emailError,
  isPlaceholderEmail,
  isPlaceholderPhone,
  phoneError,
} from "@rh/shared";
