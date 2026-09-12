/**
 * The example sheets the Import screen hands out.
 *
 * Someone arriving with two years of bookings in a spreadsheet has one
 * question: what do the columns have to be called? The screen used to answer
 * it in a sentence — "Booking ID, Guest Name, Mobile, Room, Check-In/Out, …" —
 * which is fine until you hit the parts a sentence cannot carry: that the date
 * format is `15-Aug-2026`, that an empty Advance is allowed but an empty
 * Check-In is not, that "out of service" in the Status column marks a room
 * rather than making a booking.
 *
 * These live here rather than in the web app because the parser that has to
 * accept them lives in the API, and `the-sample-sheet-imports.spec.ts` runs
 * every one of them through it. A sample that has drifted from the importer is
 * worse than no sample: the person following it concludes the importer is
 * broken, and they are not wrong about their own experience.
 *
 * The rows are deliberately a little awkward — a cancelled booking, a stay with
 * no advance, a room out of service — because the questions people actually
 * write in are about those, not about the row that works.
 */

/**
 * Bookings. Required: Booking ID, Guest Name, Room, Check-In. Everything else
 * may be blank, and the last row shows what a blank column looks like.
 */
export const SAMPLE_BOOKINGS_CSV = [
  "Booking ID,Booking Date,Guest Name,Mobile,NID/Passport No,Room,Check-In,Check-Out,Nights,Room Rate,Rent,Discount,Advance,Due,Payment Status,Booking Source,Advance received,Adults,Children,Status,Remarks",
  "BK-00001,01-Nov-2026,Rahima Khatun,01711000001,,101,05-Nov-2026,07-Nov-2026,2,5000,10000,0,3000,7000,Partial,Direct,,2,0,Confirmed,Late check-in",
  "BK-00002,02-Nov-2026,Shafiqul Islam,01711000002,1234567890,102,06-Nov-2026,08-Nov-2026,2,5000,10000,500,9500,0,Paid,Facebook,,2,1,Confirmed,",
  "BK-00003,03-Nov-2026,Tanvir Ahmed,01711000003,,103,10-Nov-2026,12-Nov-2026,2,6500,13000,0,,13000,Unpaid,Agent,,2,0,Confirmed,No advance taken yet",
  "BK-00004,04-Nov-2026,Nusrat Jahan,01711000004,,101,15-Nov-2026,16-Nov-2026,1,5000,5000,0,5000,0,Paid,Walk-in,,1,0,Cancelled,Guest cancelled",
  // a blocked room, not a booking: the importer reads "out of service" from
  // Guest Name or Remarks, so writing it only in Status books a phantom guest
  // into a room that was shut
  "BK-00005,05-Nov-2026,Out of service,,,104,18-Nov-2026,20-Nov-2026,2,,,,,,,,,,,,Bathroom repair",
].join("\r\n");

/**
 * Expenses. The sheet's own "Daily Total Expense" column is checked against
 * what we add up, so it is here to be checked — leaving it out is allowed, but
 * then nothing catches a typo in an amount.
 */
export const SAMPLE_EXPENSES_CSV = [
  "Date,Expense Category,Details,Amount,Daily Total Expense",
  "05-Nov-2026,Electricity,November meter reading,8500,12300",
  "05-Nov-2026,Kitchen,Fish and vegetables,3800,",
  "06-Nov-2026,Salary,Housekeeping — Ramiza,7000,7000",
  "07-Nov-2026,Repairs,Generator servicing,4500,4500",
].join("\r\n");

/**
 * Restaurant bills. One bill is several rows — one per item — tied together by
 * Bill No, and the Total column is taken as written rather than recomputed,
 * because the sheet is the record of what the guest was actually charged.
 */
export const SAMPLE_FB_CSV = [
  "Date,Bill No,Guest Name,Room,Item,Qty,Unit Price,Total,Paid,Due,Status",
  "05-Nov-2026,RES-0001,Rahima Khatun,101,Chicken curry,2,320,640,640,0,Paid",
  "05-Nov-2026,RES-0001,Rahima Khatun,101,Plain rice,4,60,240,240,0,Paid",
  "06-Nov-2026,RES-0002,Shafiqul Islam,102,Breakfast set,2,250,500,200,300,Partial",
  "06-Nov-2026,RES-0003,Walk-in guest,,Tea,3,30,90,0,90,Unpaid",
].join("\r\n");

/** What each sample is called when it lands in the browser's downloads. */
export const SAMPLE_FILENAMES = {
  bookings: "resort-mela-sample-bookings.csv",
  expenses: "resort-mela-sample-expenses.csv",
  fb: "resort-mela-sample-restaurant.csv",
} as const;
