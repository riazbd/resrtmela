/**
 * One typed client for every caller of the API.
 *
 * The problem it solves is not typing for its own sake. There were 164 routes
 * and three separate descriptions of what they return — the API's service
 * signatures, a block of interfaces in the web app, and a hand-rolled copy in
 * whichever page needed one. Each caller also built its own URL by hand, so a
 * renamed query parameter was found by a user, not by a compiler.
 *
 * Here every route is written once, with its parameters, and the response type
 * comes from api-types.ts — the same file the API itself imports its page
 * envelope from.
 *
 * The transport is injected: the console keeps its token in localStorage, and
 * where a token lives is not this file's concern.
 */
import type {
  AccountStatusSaved,
  AgencySiteEdit,
  AgencyMoneyReceived,
  CampaignSent,
  NewCampaign,
  ExpenseImportReport,
  FbImportReport,
  PlanChangeResult,
  SubscriptionDetail,
  ActivityRow,
  AgencyInvited,
  AgencyRoleSaved,
  ApiKeyCreated,
  ApiKeyRow,
  CommissionTermsRow,
  CreditPack,
  DiscountOfferEdit,
  DiscountOfferListRow,
  DiscountOfferRow,
  DomainRow,
  ImportReport,
  ImportRequest,
  MessageTemplateReset,
  MessageTemplateRow,
  MessageTemplateSaved,
  MyEmailCredits,
  NewDiscountOffer,
  NotificationFeed,
  ReconcileReport,
  ResortAgencyTerms,
  ResortAgencyTermsSaved,
  SiteDraft,
  SiteEdit,
  WebhookDeliveryRow,
  WebhookEndpointCreated,
  WebhookEndpointRow,
  PlatformWallet,
  PlatformWalletTxn,
  AgencyApiKey,
  EmailCreditOrderRow,
  NewOffer,
  NewPlan,
  OfferRow,
  PlanScheduleInput,
  PlatformAgencyRow,
  PlatformChargeRow,
  PlatformMoneyReceived,
  PlatformSubscriptionRow,
  SubscriptionCalendarCell,
  EmployeeEdit,
  FoodPackageEdit,
  NewAgencyExpense,
  NewEmployee,
  NewFoodPackage,
  NewPermRole,
  NewRatePlan,
  NewRoom,
  NewRoomType,
  NewSalesDoc,
  NewTourPackage,
  PermRoleEdit,
  RoomEdit,
  RoomTypeEdit,
  SalesDocEdit,
  TaxRuleEdit,
  TourCategoryEdit,
  TourPackageEdit,
  AgentOwnReport,
  AgentPerformanceReport,
  AuditRow,
  CancelDecided,
  CancelRequested,
  CollectorsReport,
  DailyRevenueRow,
  ExpenseSaved,
  FiscalYears,
  IdleInventoryReport,
  NewExpense,
  NewResortUser,
  PayrollPay,
  PayrollPaymentSaved,
  PlanDefinition,
  PlanEdit,
  PlatformAgentRow,
  PlatformChargeSaved,
  PlatformOverview,
  PlatformResortRow,
  ResortStatusSaved,
  ResortUserEdit,
  ResortUserSaved,
  SetSubscription,
  SourceReport,
  SubscriptionDueRow,
  SubscriptionSaved,
  TenantUsage,
  HousekeepingRow,
  DiscoverResort,
  AgencyRole,
  AgencySite,
  AgencyStaff,
  Removal,
  TourCategorySaved,
  AgencyWallet,
  AgencyActivity,
  AgencyEmployee,
  AgencyExpensePage,
  AgencyGuestRow,
  AgencyRoomOffer,
  AgencyCalendar,
  BookingDetail,
  InvoicePayload,
  BookingQuote,
  BookingRow,
  CalendarBooking,
  CmsRow,
  DaySheet,
  DuesReport,
  Employee,
  ExpenseHeadRow,
  ExpensePage,
  ExportArchive,
  FoodPackage,
  GroupBookingResult,
  GuestRow,
  Me,
  MyAccess,
  Page,
  PaymentReceipt,
  PayrollSheet,
  PermRole,
  Activity,
  ActivitySchedule,
  ActivitySlot,
  FbBill,
  FbInHouse,
  EmailCampaign,
  EmailCredits,
  PLReport,
  ResortMetrics,
  ResortSettings,
  ResortUser,
  PlatformSettings,
  BillingSweepResult,
  RatePlan,
  Resort,
  Room,
  RoomAvail,
  RoomType,
  SalesDocDetail,
  SalesDocKind,
  SalesDocStatus,
  SalesDocRow,
  TourCategoryNode,
  TourPackageDetail,
  TourPackageRow,
  ResortOption,
  Session,
  TaxRuleRow,
  TodayFeed,
} from "./api-types";
import type { AppRelease } from "./app-version";
import type { DiscountKind } from "./discount";
import type { HousekeepingState } from "./housekeeping";
import type { PlanAudience, PlanOnSale } from "./plans-on-sale";
import type { AgencyPublished, PublishedResort } from "./site";
import type { StayChargeKind } from "./stay-charges";

/** What the host app must provide: one authenticated JSON call. */
export type Fetcher = <T>(
  path: string,
  opts?: { method?: string; body?: unknown },
) => Promise<T>;

export type QueryValue = string | number | boolean | null | undefined;

/**
 * Builds a query string, dropping empty values so a URL never carries
 * `?state=&from=` — which the API's validators treat differently from an
 * absent parameter.
 */
export function qs(params: Record<string, QueryValue> | object): string {
  const pairs = Object.entries(params as Record<string, QueryValue>)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}

export interface BookingListQuery {
  resortId: number;
  state?: string;
  source?: string;
  guestId?: number;
  group?: string;
  from?: string;
  to?: string;
  skip?: number;
  take?: number;
  /** guest name, guest phone or booking code — matched by the server, over every row */
  search?: string;
  /** one of BOOKING_SORTS; anything else reads as the default (newest booked first) */
  sort?: string;
}

/**
 * What opening a resort's workspace asks for.
 *
 * `plan` and `scheduleId` carry the card and the billing period that were on
 * screen when the button was pressed. They are optional on the wire and it
 * cost this project a bug to make them so: `plan` was absent from the API's
 * DTO for a while, and `ValidationPipe({ whitelist: true })` stripped it
 * without a word, so every workspace opened on the entry plan whatever had
 * been clicked.
 */
export interface ResortSignup {
  companyName: string;
  resortName: string;
  location?: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  slug?: string;
  offer?: string;
  plan?: string;
  scheduleId?: number;
}

/** The same front door for an agency. It lands pending: the platform verifies each one. */
export interface AgencySignup {
  agencyName: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  plan?: string;
  offer?: string;
  scheduleId?: number;
}

/**
 * What a stay costs, asked before there is a stay.
 *
 * No guest: the form prices rooms and dates while the clerk is still
 * choosing, long before there is a name to attach, and requiring one here
 * would mean the total only appeared once it was too late to be useful.
 */
export interface BookingQuoteRequest {
  resortId: number;
  roomIds: number[];
  checkIn: string;
  checkOut: string;
  adults: number;
  children?: number;
  extraPersons?: number;
  discount?: number;
  discountKind?: DiscountKind;
}

/** A guest the desk is typing in rather than picking off the list. */
export interface GuestInline {
  fullName: string;
  phone?: string;
  email?: string;
  nidPassportNo?: string;
}

/**
 * A booking, as the desk makes one.
 *
 * `method` on the advance is a code from the resort's own PAYMENT_METHOD
 * list, so it is a string here: the server holds the list and answers with a
 * sentence naming what it does accept.
 */
export interface NewBooking extends BookingQuoteRequest {
  guestId?: number;
  guest?: GuestInline;
  remarks?: string;
  source?: string;
  walkIn?: boolean;
  advancePayment?: { amount: number; method: string };
}

/** One party, one set of dates, a room each — the group form's whole shape. */
export interface NewGroupBooking {
  resortId: number;
  roomIds: number[];
  checkIn: string;
  checkOut: string;
  guest: GuestInline;
  adults: number;
  children?: number;
  discountPerRoom?: number;
  discountKind?: DiscountKind;
  advancePerRoom?: number;
  advanceMethod?: string;
  remarks?: string;
  source?: string;
}

/** What the edit form may change. Rooms and dates move together or not at all. */
export interface BookingEdit {
  checkIn?: string;
  checkOut?: string;
  roomIds?: number[];
  adults?: number;
  children?: number;
  discount?: number;
  discountKind?: DiscountKind;
  remarks?: string;
}

/**
 * Money arriving.
 *
 * `clientRef` is the identity of the write. A desk that queues its writes
 * sends the same one it generated offline, and the server answers a repeat
 * with the original receipt instead of taking the money twice.
 */
/** A line on a restaurant bill, as the POS sends it. */
export interface NewFbBillItem {
  name: string;
  qty: number;
  unitPrice: number;
}

/**
 * A restaurant bill being written.
 *
 * `bookingId` is what puts it on a room rather than taking cash: a bill
 * with one is owed by the stay, and `paidAmount` is what was handed over
 * at the counter instead.
 */
export interface NewFbBill {
  date: string;
  items: NewFbBillItem[];
  guestName?: string;
  bookingId?: number;
  roomId?: number;
  paidAmount?: number;
  method?: string;
  note?: string;
}

/**
 * An activity in the catalogue.
 *
 * `category` is checked against a list hardcoded in the controller's
 * DTO, which is in tension with `ACTIVITY_CATEGORY` being one of the
 * lists a resort owns — a resort can add a category to its list and the
 * API will still refuse it here. The type follows the DTO, because the
 * DTO is what actually answers; reconciling the two is the API's to do.
 */
export interface NewActivity {
  name: string;
  category: string;
  basePrice: number;
  durationMin: number;
  minPerSlot?: number;
  maxPerSlot?: number;
  description?: string;
}

export interface PaymentEntry {
  amount: number;
  method: string;
  type?: "ADVANCE" | "FINAL" | "REFUND";
  note?: string;
  clientRef?: string;
}

/** A service, damage or a fine, put on a bill at the desk. */
export interface StayChargeEntry {
  kind: StayChargeKind;
  label: string;
  amount: number;
  qty?: number;
}

export interface DateRange {
  from?: string;
  to?: string;
}

/**
 * The two addresses a client cannot keep to itself.
 *
 * Almost every write goes through a method here and no caller ever sees a
 * path. Three cannot: a check-in, a check-out and a payment may be held
 * until the network returns, and a held write is a row in storage — it has
 * to carry where it was going as data.
 *
 * Both clients wrote those out by hand at the call site, which is exactly
 * where `checkout` went wrong: two addresses for one route, only one of
 * them checked against the server. One copy, used by the method that posts
 * it and by the queue that holds it.
 */
export const paths = {
  bookingTransition: (id: number) => `/bookings/${id}/transition`,
  bookingPayments: (id: number) => `/bookings/${id}/payments`,
} as const;

export function createApiClient(http: Fetcher) {
  return {
    // ── who am I ──
    me: () => http<Me>("/auth/me"),
    /**
     * Two answers, not one: `permissions` is what the owner granted, `features`
     * is what the plan includes. The signature promised only the first for
     * three days after the API started sending both.
     */
    permissions: (resortId?: number) =>
      http<MyAccess>(`/auth/permissions${qs({ resortId })}`),
    myResorts: () => http<Resort[]>("/resorts/mine"),

    // ── the doors into a session ──
    /**
     * Every route on `auth.controller.ts`, so that no screen — on the desk or
     * on a phone — writes one of these paths itself. `the-way-into-a-session-
     * is-typed.spec.ts` is what keeps this list level with that controller.
     */
    auth: {
      /**
       * One identifier, whichever kind it is.
       *
       * The controller reads `identifier ?? phone ?? email` and the login box
       * does not ask which was typed, so neither does this: an address and a
       * phone number travel the same way, and guessing here would be a second
       * opinion about something the server already decides.
       */
      login: (identifier: string, password: string) =>
        http<Session>("/auth/login", { method: "POST", body: { identifier, password } }),

      signup: (body: ResortSignup) =>
        http<Session>("/auth/signup", { method: "POST", body }),

      /**
       * This phone, asking to be told things.
       *
       * No resort in the path: a token belongs to a person, and who is
       * sent to is worked out at send time from the permission matrix.
       * `forget` is the sign-out half and is not optional — a device
       * that changes hands must stop receiving a resort's bookings.
       */
      /**
       * The price list, before anybody has an account.
       *
       * Public — `/cms/plans` takes no token, and could not: the person
       * reading it is deciding whether to have one. The web has drawn
       * this since the homepage had prices; the phone showed nothing and
       * signed everybody up on the entry plan.
       */
      plansOnSale: (audience: PlanAudience = "RESORT") =>
        http<PlanOnSale[]>(`/cms/plans${qs({ audience })}`),

      registerDevice: (token: string, platform: "android" | "ios") =>
        http<{ ok: boolean }>("/devices", { method: "POST", body: { token, platform } }),
      forgetDevice: (token: string, platform: "android" | "ios") =>
        http<{ ok: boolean }>("/devices/forget", { method: "POST", body: { token, platform } }),

      signupAgency: (body: AgencySignup) =>
        http<Session>("/auth/signup/agency", { method: "POST", body }),

      /**
       * Answers the same way whether or not the account exists — the neutral
       * sentence is the point, and it is the server's to keep, not a caller's.
       */
      forgotPassword: (identifier: string) =>
        http<{ sent: boolean }>("/auth/password/forgot", {
          method: "POST",
          body: { identifier },
        }),

      resetPassword: (token: string, password: string) =>
        http<{ ok: true }>("/auth/password/reset", {
          method: "POST",
          body: { token, password },
        }),

      /**
       * `currentPassword` is omitted rather than sent as `undefined`: an
       * account opened by invitation has no password yet, and the controller
       * only demands the old one when a hash exists. `qs` learned the same
       * lesson about query strings — an absent field and an empty one are
       * different requests.
       */
      changePassword: (newPassword: string, currentPassword?: string) =>
        http<{ ok: boolean }>("/auth/me/password", {
          method: "POST",
          body: currentPassword === undefined
            ? { newPassword }
            : { newPassword, currentPassword },
        }),
    },

    // ── bookings ──
    bookings: {
      list: (q: BookingListQuery) => http<Page<BookingRow>>(`/bookings${qs({ ...q })}`),
      get: (id: number) => http<BookingDetail>(`/bookings/${id}`),
      /** What the stay will cost, priced by the code that will charge it. */
      quote: (body: BookingQuoteRequest) => http<BookingQuote>("/bookings/quote", { method: "POST", body }),
      create: (body: NewBooking) => http<BookingDetail>("/bookings", { method: "POST", body }),
      createGroup: (body: NewGroupBooking) =>
        http<GroupBookingResult>("/bookings/group", { method: "POST", body }),
      update: (id: number, body: BookingEdit) => http<BookingDetail>(`/bookings/${id}`, { method: "PATCH", body }),
      // the controller reads `to`; this sent `state`, so the typed client's
      // transition has never worked and the console hand-rolls the call
      transition: (id: number, to: string) =>
        http<BookingDetail>(paths.bookingTransition(id), { method: "POST", body: { to } }),
      /*
       * There is no `cancel` here.
       *
       * One used to be, posting to `/bookings/:id/cancel` — a route the
       * API has never declared. It answered 404 to anybody who called
       * it, and nobody ever did: cancelling is
       * `transition(id, "CANCELLED")`, which is what every screen uses.
       * A dead method on the one description of this API is worse than
       * a missing one, because the next person writes a screen against
       * it. Found by `every-route-the-client-calls-exists` (2026-09-21).
       */
      remove: (id: number) => http<{ deleted: boolean }>(`/bookings/${id}`, { method: "DELETE" }),
      /**
       * A selection, deleted together and all-or-nothing.
       *
       * POST, not DELETE: a body on a DELETE is legal and dropped by enough
       * proxies to be a bad bet, and the ids are the whole request.
       */
      removeMany: (resortId: number, ids: number[]) =>
        http<{ deleted: number; alreadyGone: number }>(`/resorts/${resortId}/bookings/delete`, {
          method: "POST",
          body: { ids },
        }),
      /**
       * Money in, and the receipt for it.
       *
       * This promised a `BookingDetail` until 2026-09-20 and the route has
       * never answered one. It answers the payment, the booking as it now
       * stands, and whether the server had already applied this write — which
       * is the only way a queued desk can tell a replay from a second payment.
       *
       * There is no `checkout` beside it: that method posted to
       * `/bookings/:id/checkout`, a route the API has never declared. Leaving
       * is `transition(id, "CHECKED_OUT")`.
       */
      pay: (id: number, body: PaymentEntry) =>
        http<PaymentReceipt>(paths.bookingPayments(id), { method: "POST", body }),
      /** More (or fewer) people in the room than were booked. */
      extraPersons: (id: number, persons: number) =>
        http<BookingDetail>(`/bookings/${id}/extra-persons`, { method: "POST", body: { persons } }),
      addCharge: (id: number, body: StayChargeEntry) =>
        http<BookingDetail>(`/bookings/${id}/charges`, { method: "POST", body }),
      removeCharge: (id: number, itemId: number) =>
        http<BookingDetail>(`/bookings/${id}/charges/${itemId}`, { method: "DELETE" }),
      /** The platform letting an agent's payment through after the deadline. */
      approveLate: (id: number) =>
        http<{ ok: boolean; code: string }>(`/bookings/${id}/approve-late`, { method: "POST" }),
      invoice: (id: number) => http<InvoicePayload>(`/bookings/${id}/invoice`),
      generateInvoice: (id: number) => http<{ invoiceNo: string }>(`/bookings/${id}/invoice`, { method: "POST" }),
      emailInvoice: (id: number) => http<{ sent: boolean }>(`/bookings/${id}/email-invoice`, { method: "POST", body: {} }),
      cancelRequests: (resortId: number) => http<BookingRow[]>(`/bookings/cancel-requests${qs({ resortId })}`),
      requestCancel: (id: number, reason?: string) =>
        http<CancelRequested>(`/bookings/${id}/cancel-request`, { method: "POST", body: { reason } }),
      decideCancel: (id: number, approve: boolean) =>
        http<CancelDecided>(`/bookings/${id}/cancel-decision`, { method: "POST", body: { approve } }),
    },

    // ── inventory ──
    rooms: {
      list: (resortId: number) => http<Room[]>(`/resorts/${resortId}/rooms`),
      create: (resortId: number, body: NewRoom) => http<Room>(`/resorts/${resortId}/rooms`, { method: "POST", body }),
      update: (id: number, body: RoomEdit) => http<Room>(`/rooms/${id}`, { method: "PATCH", body }),
      /**
       * Deleted, or retired — the server decides which, not the caller.
       * A room with bookings against it is kept and taken off sale,
       * because a stay that happened has to keep naming somewhere.
       */
      remove: (id: number) =>
        http<{ removed: "deleted" | "retired"; name: string }>(`/rooms/${id}`, { method: "DELETE" }),
      types: (resortId: number) => http<RoomType[]>(`/resorts/${resortId}/room-types`),
      createType: (resortId: number, body: NewRoomType) =>
        http<RoomType>(`/resorts/${resortId}/room-types`, { method: "POST", body }),
      updateType: (id: number, body: RoomTypeEdit) => http<RoomType>(`/room-types/${id}`, { method: "PATCH", body }),
      /**
       * Which rooms are ready. Its own permission, not `rooms.view`: a
       * housekeeper may read this and nothing else about the inventory.
       */
      housekeeping: (resortId: number) =>
        http<HousekeepingRow[]>(`/resorts/${resortId}/housekeeping`),
      setHousekeeping: (roomId: number, state: HousekeepingState) =>
        http<{ id: number; housekeeping: HousekeepingState; housekeepingAt: string }>(
          `/rooms/${roomId}/housekeeping`,
          { method: "PATCH", body: { state } },
        ),

      ratePlans: (resortId: number) => http<RatePlan[]>(`/resorts/${resortId}/rate-plans`),
      createRatePlan: (resortId: number, body: NewRatePlan) =>
        http<RatePlan>(`/resorts/${resortId}/rate-plans`, { method: "POST", body }),
      availability: (resortId: number, from: string, to: string) =>
        http<RoomAvail[]>(`/resorts/${resortId}/availability${qs({ from, to })}`),
    },

    /**
     * The lists a resort owns — payment methods, booking sources, activity
     * categories. Addressed by name, so making the next thing dynamic costs a
     * registry entry rather than four more client methods.
     */
    options: {
      list: (resortId: number, list: string) =>
        http<ResortOption[]>(`/resorts/${resortId}/options/${list}`),
      create: (resortId: number, list: string, body: { code: string; label: string; meta?: Record<string, unknown> }) =>
        http<ResortOption>(`/resorts/${resortId}/options/${list}`, { method: "POST", body }),
      update: (
        resortId: number,
        list: string,
        id: number,
        body: { label?: string; active?: boolean; sortOrder?: number; meta?: Record<string, unknown> },
      ) => http<ResortOption>(`/resorts/${resortId}/options/${list}/${id}`, { method: "PATCH", body }),
      remove: (resortId: number, list: string, id: number) =>
        http<{ removed: boolean; deactivated: boolean; used: number }>(
          `/resorts/${resortId}/options/${list}/${id}`,
          { method: "DELETE" },
        ),
      lists: () => http<{ name: string; label: string }[]>(`/option-lists`),
    },

    /** What a resort charges on top of its rates — VAT, service charge, whatever it has. */
    taxRules: {
      list: (resortId: number) => http<TaxRuleRow[]>(`/resorts/${resortId}/tax-rules`),
      create: (resortId: number, body: { code: string; label: string; ratePct: number; appliesTo?: string; inclusive?: boolean; compound?: boolean }) =>
        http<TaxRuleRow>(`/resorts/${resortId}/tax-rules`, { method: "POST", body }),
      update: (resortId: number, id: number, body: TaxRuleEdit) =>
        http<TaxRuleRow>(`/resorts/${resortId}/tax-rules/${id}`, { method: "PATCH", body }),
      deactivate: (resortId: number, id: number) =>
        http<TaxRuleRow>(`/resorts/${resortId}/tax-rules/${id}`, { method: "DELETE" }),
    },

    // ── the desk ──
    daySheet: (resortId: number, date?: string) => http<DaySheet>(`/resorts/${resortId}/day-sheet${qs({ date })}`),
    today: (resortId: number) => http<TodayFeed>(`/resorts/${resortId}/today`),
    calendar: (resortId: number, from: string, to: string) =>
      http<{ bookings: CalendarBooking[]; rooms: Room[] }>(`/resorts/${resortId}/calendar${qs({ from, to })}`),
    dues: (resortId: number) => http<DuesReport>(`/resorts/${resortId}/dues`),

    guests: {
      list: (resortId: number, q: { search?: string; skip?: number; take?: number } = {}) =>
        http<Page<GuestRow>>(`/resorts/${resortId}/guests${qs(q)}`),
    },

    // ── money ──
    expenses: {
      list: (resortId: number, q: DateRange & { category?: string; scope?: string; skip?: number; take?: number } = {}) =>
        http<ExpensePage>(`/resorts/${resortId}/expenses${qs(q)}`),
      /**
       * What has *been* spent on, with a count — not what may be.
       *
       * Typed `string[]` until 2026-09-20; the route is a `groupBy` and
       * has always answered `{ category, uses }[]`. Nobody found out
       * because nobody called it: the console reads the resort's own
       * `EXPENSE_CATEGORY` list instead, deliberately, because a groupBy
       * cannot offer a category nothing has been spent on yet and keeps
       * "Salaries", "salary" and "Salery" as three categories for ever.
       *
       * Kept because a report that asks "what did this resort actually
       * spend on" wants exactly this. A form offering choices wants
       * `options.list(resortId, "EXPENSE_CATEGORY")`.
       */
      categories: (resortId: number) =>
        http<{ category: string; uses: number }[]>(`/resorts/${resortId}/expenses/categories`),
      create: (resortId: number, body: NewExpense) =>
        http<ExpenseSaved>(`/resorts/${resortId}/expenses`, { method: "POST", body }),
      remove: (id: number) => http<{ deleted: boolean }>(`/expenses/${id}`, { method: "DELETE" }),
    },

    fb: {
      inHouse: (resortId: number) => http<FbInHouse[]>(`/resorts/${resortId}/fb/in-house`),
      bills: (resortId: number, q: DateRange & { skip?: number; take?: number } = {}) =>
        http<Page<FbBill>>(`/resorts/${resortId}/fb/bills${qs(q)}`),
      createBill: (resortId: number, body: NewFbBill) =>
        http<FbBill>(`/resorts/${resortId}/fb/bills`, { method: "POST", body }),
      /** The server refuses more than the bill comes to, and says the two figures. */
      payBill: (id: number, body: { amount: number; method: string }) =>
        http<FbBill>(`/fb/bills/${id}/pay`, { method: "POST", body }),
      removeBill: (id: number) => http<{ deleted: boolean }>(`/fb/bills/${id}`, { method: "DELETE" }),
      packages: (resortId: number) => http<FoodPackage[]>(`/resorts/${resortId}/fb/packages`),
      createPackage: (resortId: number, body: NewFoodPackage) =>
        http<FoodPackage>(`/resorts/${resortId}/fb/packages`, { method: "POST", body }),
      updatePackage: (id: number, body: FoodPackageEdit) =>
        http<FoodPackage>(`/fb/packages/${id}`, { method: "PATCH", body }),
      removePackage: (id: number) => http<{ deleted: boolean }>(`/fb/packages/${id}`, { method: "DELETE" }),
    },

    /**
     * Activities: the catalogue, its weekly pattern, and the slots that
     * pattern generates.
     *
     * There was no group here at all until 2026-09-20 — the console
     * reached all four of these through hand-written paths, which is the
     * arrangement §0.3 exists to end.
     */
    /**
     * Writing to a whole guest list, and paying for the right to.
     *
     * There was no group for this until 2026-09-20. Sending is not here
     * on purpose: a campaign is a paragraph somebody wants to re-read
     * before it reaches four hundred people, and the phone reads the
     * balance and what has already gone out.
     */
    engage: {
      credits: () => http<EmailCredits>("/email-credits"),
      campaigns: () => http<EmailCampaign[]>("/email-campaigns"),
      sendCampaign: (body: NewCampaign) =>
        http<CampaignSent>("/email-campaigns", { method: "POST", body }),
      /** What the platform is selling today — the console draws its buttons from this. */
      creditPacks: () => http<CreditPack[]>("/email-credits/packs"),
      myCredits: () => http<MyEmailCredits>("/email-credits"),
      /**
       * Asking for a pack. Nothing is granted and nothing is charged until
       * the platform approves it: a pack used to be granted the moment a
       * resort clicked it, raising a bill nobody here had agreed to.
       */
      requestCredits: (credits: number, clientRef?: string) =>
        http<EmailCreditOrderRow>("/email-credits/purchase", {
          method: "POST",
          body: { credits, clientRef },
        }),
      myCreditOrders: () => http<EmailCreditOrderRow[]>("/email-credits/orders"),

      /** The bell. */
      notifications: (take?: number) => http<NotificationFeed>(`/notifications${qs({ take })}`),
      markAllRead: () => http<{ ok: true }>("/notifications/read", { method: "POST", body: { all: true } }),
      markRead: (id: string) => http<{ ok: true }>(`/notifications/${id}/read`, { method: "POST" }),
    },

    activities: {
      list: (resortId: number) => http<Activity[]>(`/resorts/${resortId}/activities`),
      create: (resortId: number, body: NewActivity) =>
        http<Activity>(`/resorts/${resortId}/activities`, { method: "POST", body }),
      update: (id: number, body: Partial<NewActivity> & { active?: boolean }) =>
        http<Activity>(`/activities/${id}`, { method: "PATCH", body }),
      /**
       * The whole week at once: a PUT, because it replaces rather than adds.
       *
       * The body key is `rows`. It was written as `schedules` here first,
       * which is precisely how `transition` sent `state` where the
       * controller read `to` and never worked — caught this time by
       * reading `SetSchedulesDto` before shipping rather than after.
       */
      setSchedules: (id: number, rows: ActivitySchedule[]) =>
        http<Activity>(`/activities/${id}/schedules`, { method: "PUT", body: { rows } }),
      /**
       * Turns the weekly pattern into real slots between two dates.
       *
       * `matched` is how many the pattern hit and `created` how many were
       * new — the difference is the ones that already existed, which is
       * what makes running it twice safe.
       */
      generate: (id: number, from: string, to: string) =>
        http<{ created: number; matched: number; totalSlots: number }>(
          `/activities/${id}/generate`,
          { method: "POST", body: { from, to } },
        ),
      /** `futureOnly` drops slots that have already run; the API defaults it off. */
      slots: (
        resortId: number,
        catalogId: number,
        q: DateRange & { futureOnly?: boolean } = {},
      ) => http<ActivitySlot[]>(`/resorts/${resortId}/activities/${catalogId}/slots${qs(q)}`),
      removeSlot: (id: number) =>
        http<{ deleted: boolean }>(`/activity-slots/${id}`, { method: "DELETE" }),
      addToBooking: (bookingId: number, body: { slotId: number; persons: number }) =>
        http<BookingDetail>(`/bookings/${bookingId}/activities`, { method: "POST", body }),
      removeFromBooking: (bookingId: number, itemId: number) =>
        http<BookingDetail>(`/bookings/${bookingId}/activities/${itemId}`, { method: "DELETE" }),
    },

    payroll: {
      employees: (resortId: number) => http<Employee[]>(`/resorts/${resortId}/payroll/employees`),
      addEmployee: (resortId: number, body: NewEmployee) =>
        http<Employee>(`/resorts/${resortId}/payroll/employees`, { method: "POST", body }),
      updateEmployee: (resortId: number, employeeId: number, body: EmployeeEdit) =>
        http<Employee>(`/resorts/${resortId}/payroll/employees/${employeeId}`, { method: "PATCH", body }),
      /**
       * Deleted, or deactivated — and which of the two is the server's
       * decision, not the caller's. An employee with payroll history is
       * kept and switched off, because a payslip that already exists has
       * to keep naming somebody. Typed `{ deleted: boolean }` until
       * 2026-09-20, so the one field that matters was missing.
       */
      removeEmployee: (resortId: number, employeeId: number) =>
        http<{ deleted?: boolean; deactivated?: boolean }>(
          `/resorts/${resortId}/payroll/employees/${employeeId}`,
          { method: "DELETE" },
        ),
      sheet: (resortId: number, month: string) => http<PayrollSheet>(`/resorts/${resortId}/payroll${qs({ month })}`),
      pay: (resortId: number, employeeId: number, body: PayrollPay) =>
        http<PayrollPaymentSaved>(
          `/resorts/${resortId}/payroll/employees/${employeeId}/pay`,
          { method: "POST", body },
        ),
      unpay: (paymentId: number) => http<{ deleted: boolean }>(`/payroll/payments/${paymentId}`, { method: "DELETE" }),
    },

    // ── what the numbers say ──
    reports: {
      metrics: (resortId: number, r: DateRange = {}) =>
        http<ResortMetrics>(`/resorts/${resortId}/metrics${qs(r)}`),
      daily: (resortId: number, from: string, to: string) =>
        http<DailyRevenueRow[]>(`/resorts/${resortId}/reports/daily${qs({ from, to })}`),
      agents: (resortId: number, r: DateRange = {}) =>
        http<AgentPerformanceReport>(`/resorts/${resortId}/reports/agents${qs(r)}`),
      sources: (resortId: number, r: DateRange = {}) =>
        http<SourceReport>(`/resorts/${resortId}/reports/sources${qs(r)}`),
      collectors: (resortId: number, r: DateRange = {}) =>
        http<CollectorsReport>(`/resorts/${resortId}/reports/collectors${qs(r)}`),
      idleInventory: (resortId: number, from: string, to: string) =>
        http<IdleInventoryReport>(`/resorts/${resortId}/reports/idle-inventory${qs({ from, to })}`),
      pl: (resortId: number, from: string, to: string) =>
        http<PLReport>(`/resorts/${resortId}/reports/pl${qs({ from, to })}`),
      audit: (resortId: number, take?: number) => http<AuditRow[]>(`/resorts/${resortId}/audit${qs({ take })}`),
      /**
       * An agency's own commission, over its own bookings.
       *
       * The one report on this list an agency may read, and the only one
       * that needs no selling access: like the bookings it counts, it stays
       * readable after a resort closes its door. The console reached it by
       * hand-writing the URL, which is why it was the last route here with
       * no entry at all.
       */
      mine: (resortId: number, r: DateRange = {}) =>
        http<AgentOwnReport>(`/agents/me/report${qs({ resortId, ...r })}`),
    },

    // ── the resort itself ──
    resort: {
      get: (id: number) => http<ResortSettings>(`/resorts/${id}`),
      update: (id: number, body: Partial<ResortSettings>) =>
        http<ResortSettings>(`/resorts/${id}`, { method: "PATCH", body }),
      users: (id: number) => http<ResortUser[]>(`/resorts/${id}/users`),
      addUser: (id: number, body: NewResortUser) =>
        http<ResortUserSaved>(`/resorts/${id}/users`, { method: "POST", body }),
      updateUser: (id: number, userId: number, body: ResortUserEdit) =>
        http<ResortUserSaved>(`/resorts/${id}/users/${userId}`, { method: "PATCH", body }),
      /** Its own route on its own permission: setting a password is not editing a user. */
      setUserPassword: (id: number, userId: number, password: string) =>
        http<{ ok: true }>(`/resorts/${id}/users/${userId}/password`, { method: "POST", body: { password } }),
      roles: (id: number) => http<PermRole[]>(`/resorts/${id}/roles`),
      createRole: (id: number, body: NewPermRole) => http<PermRole>(`/resorts/${id}/roles`, { method: "POST", body }),
      updateRole: (roleId: number, body: PermRoleEdit) => http<PermRole>(`/roles/${roleId}`, { method: "PATCH", body }),
      removeRole: (roleId: number) => http<{ deleted: boolean }>(`/roles/${roleId}`, { method: "DELETE" }),
      usage: (tenantId: number) => http<TenantUsage>(`/tenants/${tenantId}/usage`),
      fiscalYears: (id: number) => http<FiscalYears>(`/resorts/${id}/fiscal-years`),

      /**
       * What the resort pays every agent.
       *
       * One rate for the resort, replacing a field that used to sit on
       * every agent's row — which is how two agents selling the same room
       * once earned differently on it. Reading it needs only resort
       * access, because an agent has to be able to see their own terms.
       */
      commission: (id: number) => http<CommissionTermsRow>(`/resorts/${id}/commission`),
      setCommission: (id: number, body: CommissionTermsRow) =>
        http<CommissionTermsRow>(`/resorts/${id}/commission`, { method: "POST", body }),

      /**
       * The agencies, and this resort's standing with each.
       *
       * The plan is the door now, not a per-resort approval queue; what
       * is left here is what was always the resort's to decide — which
       * agency it refuses, and on what commission.
       */
      agencies: (id: number) => http<ResortAgencyTerms[]>(`/resorts/${id}/agencies`),
      setAgencyTerms: (
        id: number,
        accountId: number,
        body: { blocked?: boolean; commissionKind?: string | null; commissionRate?: number | null },
      ) =>
        http<ResortAgencyTermsSaved>(`/resorts/${id}/agencies/${accountId}`, { method: "PATCH", body }),
      inviteAgency: (id: number, body: { email: string; name?: string }) =>
        http<AgencyInvited>(`/resorts/${id}/invite-agency`, { method: "POST", body }),

      /** What happened here, and who did it. */
      activity: (id: number, q: { take?: number; q?: string } = {}) =>
        http<ActivityRow[]>(`/resorts/${id}/activity${qs(q)}`),
      deleteActivity: (activityId: string) =>
        http<{ deleted: boolean }>(`/activity/${activityId}`, { method: "DELETE" }),

      /**
       * The owner's own subscription — what they are on, what is owed,
       * and what else is for sale.
       *
       * Gated on `billing.view` / `billing.manage` rather than on being
       * platform staff, and distinct from the super admin's
       * `platform.subscribe`, which moves an account from the outside.
       */
      subscription: (id: number) => http<SubscriptionDetail>(`/resorts/${id}/subscription`),
      changePlan: (id: number, plan: string, scheduleId?: number) =>
        http<PlanChangeResult>(`/resorts/${id}/subscription/plan`, {
          method: "POST",
          body: { plan, scheduleId },
        }),

      /** A second resort on the same account, if the plan allows one. */
      addResort: (tenantId: number, body: { name: string; location?: string }) =>
        http<Resort>(`/tenants/${tenantId}/resorts`, { method: "POST", body }),
    },

    /**
     * Standing offers: a rate off every room, off one category, or off the
     * one room facing the generator.
     */
    discounts: {
      list: (resortId: number) => http<DiscountOfferListRow[]>(`/resorts/${resortId}/discounts`),
      create: (resortId: number, body: NewDiscountOffer) =>
        http<DiscountOfferRow>(`/resorts/${resortId}/discounts`, { method: "POST", body }),
      update: (id: number, body: DiscountOfferEdit) =>
        http<DiscountOfferRow>(`/discounts/${id}`, { method: "PATCH", body }),
    },

    /**
     * What the resort says to a guest.
     *
     * The platform's own notices about an unpaid subscription are not on
     * this list: they are not the tenant's to rewrite.
     */
    templates: {
      list: (resortId: number) => http<MessageTemplateRow[]>(`/resorts/${resortId}/message-templates`),
      save: (resortId: number, name: string, body: string) =>
        http<MessageTemplateSaved>(`/resorts/${resortId}/message-templates/${encodeURIComponent(name)}`, {
          method: "PUT",
          body: { body },
        }),
      reset: (resortId: number, name: string) =>
        http<MessageTemplateReset>(`/resorts/${resortId}/message-templates/${encodeURIComponent(name)}`, {
          method: "DELETE",
        }),
    },

    /** Keys for a resort's own website. The secret is returned once, at creation. */
    apiKeys: {
      list: (resortId: number) => http<ApiKeyRow[]>(`/resorts/${resortId}/api-keys`),
      create: (resortId: number, name: string, scopes?: string[]) =>
        http<ApiKeyCreated>(`/resorts/${resortId}/api-keys`, { method: "POST", body: { name, scopes } }),
      revoke: (id: string) => http<{ ok: true }>(`/api-keys/${id}`, { method: "DELETE" }),
    },

    /** Where a resort's own website is told things, and what happened to each call. */
    webhooks: {
      list: (resortId: number) => http<WebhookEndpointRow[]>(`/resorts/${resortId}/webhooks`),
      add: (resortId: number, url: string) =>
        http<WebhookEndpointCreated>(`/resorts/${resortId}/webhooks`, { method: "POST", body: { url } }),
      remove: (resortId: number, endpointId: number) =>
        http<{ removed: true }>(`/resorts/${resortId}/webhooks/${endpointId}`, { method: "DELETE" }),
      deliveries: (resortId: number) =>
        http<WebhookDeliveryRow[]>(`/resorts/${resortId}/webhooks/deliveries`),
      retry: (resortId: number, deliveryId: string) =>
        http<{ queued: boolean }>(`/resorts/${resortId}/webhooks/deliveries/${deliveryId}/retry`, {
          method: "POST",
        }),
    },

    /** The resort's own page on the public site. */
    site: {
      get: (resortId: number) => http<SiteDraft>(`/resorts/${resortId}/site`),
      save: (resortId: number, body: SiteEdit) =>
        http<SiteDraft>(`/resorts/${resortId}/site`, { method: "PATCH", body }),
      publish: (resortId: number, published: boolean) =>
        http<SiteDraft>(`/resorts/${resortId}/site/publish`, { method: "POST", body: { published } }),
      setAddress: (resortId: number, slug: string) =>
        http<{ slug: string }>(`/resorts/${resortId}/site/address`, { method: "POST", body: { slug } }),
      movePhoto: (resortId: number, photoId: number, sortOrder: number) =>
        http<SiteDraft>(`/resorts/${resortId}/site/photos/${photoId}`, {
          method: "PATCH",
          body: { sortOrder },
        }),
      removePhoto: (resortId: number, photoId: number) =>
        http<{ removed: true }>(`/resorts/${resortId}/site/photos/${photoId}`, { method: "DELETE" }),
      /** A picture goes up as raw bytes with headers, so the host app posts it itself. */
      photoPath: (resortId: number) => `/resorts/${resortId}/site/photos`,
      /** The draft as the public page would render it — only the owner may ask. */
      preview: (resortId: number) => http<PublishedResort>(`/resorts/${resortId}/site/preview`),
    },

    /**
     * A name of your own — the same four steps for a resort and an agency,
     * which is why the screen takes these as functions rather than a path.
     */
    domains: {
      list: (resortId: number) => http<DomainRow[]>(`/resorts/${resortId}/domains`),
      claim: (resortId: number, host: string) =>
        http<DomainRow>(`/resorts/${resortId}/domains`, { method: "POST", body: { host } }),
      verify: (resortId: number, domainId: number) =>
        http<DomainRow>(`/resorts/${resortId}/domains/${domainId}/verify`, { method: "POST" }),
      setCanonical: (resortId: number, domainId: number) =>
        http<DomainRow[]>(`/resorts/${resortId}/domains/${domainId}/canonical`, { method: "POST" }),
      remove: (resortId: number, domainId: number) =>
        http<{ removed: true }>(`/resorts/${resortId}/domains/${domainId}`, { method: "DELETE" }),
    },

    /** Moving a spreadsheet in, and checking it landed. */
    importer: {
      bookings: (resortId: number, body: ImportRequest) =>
        http<ImportReport>(`/resorts/${resortId}/import/bookings`, { method: "POST", body }),
      expenses: (resortId: number, csv: string) =>
        http<ExpenseImportReport>(`/resorts/${resortId}/import/expenses`, { method: "POST", body: { csv } }),
      /**
       * The sheet's own room names are matched directly; a map is only
       * for registers that write something else, and one resort's map is
       * not something to ship to every other resort.
       */
      fb: (resortId: number, csv: string, roomMap?: Record<string, string>) =>
        http<FbImportReport>(`/resorts/${resortId}/import/fb`, { method: "POST", body: { csv, roomMap } }),
      reconcile: (resortId: number, sheet7: string, sheet11: string) =>
        http<ReconcileReport>(`/resorts/${resortId}/reconcile`, {
          method: "POST",
          body: { sheet7, sheet11 },
        }),
    },

    // ── your data, on your terms ──
    exports: {
      datasets: (resortId: number) => http<{ datasets: string[] }>(`/resorts/${resortId}/export`),
      archive: (resortId: number) => http<ExportArchive>(`/resorts/${resortId}/export/archive`),
      /** CSV is a file download, not JSON — the host app fetches this path itself. */
      csvPath: (resortId: number, dataset: string) => `/resorts/${resortId}/export/${dataset}.csv`,
    },

    // ── the agency's own side ──
    agent: {
      me: () => http<{ agencyId: number; isOwner: boolean; permissions: string[] }>("/agent/me"),
      wallet: () => http<AgencyWallet>("/agent/wallet"),

      /**
       * Who works at the agency, and on what role.
       *
       * `staff` is served by the *platform* controller and `roles` by the
       * agent one — two controllers, one screen. Written down here so a
       * caller does not have to know that, and so the next person does
       * not hunt for `/agent/staff` in agent.controller.ts, where it
       * is not.
       */
      /**
       * The resorts open to this agency. Served by the *engage*
       * controller, not the agent one — the third of three that answer
       * under `/agent`.
       */
      discover: () => http<DiscoverResort[]>("/agent/discover"),

      staff: () => http<AgencyStaff[]>("/agent/staff"),
      /** Which of the agency's own roles somebody holds; null takes it away. */
      setStaffRole: (userId: number, roleId: number | null) =>
        http<{ assigned: true }>(`/agent/staff/${userId}/role`, { method: "PATCH", body: { roleId } }),
      createRole: (body: { name: string; permissions: string[] }) =>
        http<AgencyRoleSaved>("/agent/roles", { method: "POST", body }),
      updateRole: (id: number, body: { name?: string; permissions?: string[] }) =>
        http<AgencyRoleSaved>(`/agent/roles/${id}`, { method: "PATCH", body }),
      deleteRole: (id: number) => http<{ deleted: boolean }>(`/agent/roles/${id}`, { method: "DELETE" }),
      /** A colleague at the agency, who can sign in and book for guests. */
      addStaff: (body: { name: string; email: string; phone: string; password: string }) =>
        http<{ id: number; name: string; email: string; phone: string; status: string }>("/agent/staff", {
          method: "POST",
          body,
        }),
      /** Its own route on its own act: setting a password is not editing a person. */
      setStaffPassword: (userId: number, password: string) =>
        http<{ ok: true }>(`/agent/staff/${userId}/password`, { method: "POST", body: { password } }),
      roles: () => http<AgencyRole[]>("/agent/roles"),

      /** The agency's own website, and the keys it signs requests with. */
      site: () => http<AgencySite>("/agent/site"),
      saveSite: (body: AgencySiteEdit) =>
        http<AgencySite>("/agent/site", { method: "PATCH", body }),
      publishSite: (published: boolean) =>
        http<AgencySite>("/agent/site/publish", { method: "POST", body: { published } }),
      setSiteAddress: (slug: string) =>
        http<{ slug: string }>("/agent/site/address", { method: "POST", body: { slug } }),
      movePhoto: (photoId: number, sortOrder: number) =>
        http<AgencySite>(`/agent/site/photos/${photoId}`, { method: "PATCH", body: { sortOrder } }),
      removePhoto: (photoId: number) =>
        http<{ removed: true }>(`/agent/site/photos/${photoId}`, { method: "DELETE" }),
      /** A picture goes up as raw bytes with headers, so the host app posts it itself. */
      photoPath: () => "/agent/site/photos",
      sitePreview: () => http<AgencyPublished>("/agent/site/preview"),

      /** The agency's own domains: the resort's flow, owned by the account. */
      domains: {
        list: () => http<DomainRow[]>("/agent/domains"),
        claim: (host: string) => http<DomainRow>("/agent/domains", { method: "POST", body: { host } }),
        verify: (domainId: number) =>
          http<DomainRow>(`/agent/domains/${domainId}/verify`, { method: "POST" }),
        setCanonical: (domainId: number) =>
          http<DomainRow[]>(`/agent/domains/${domainId}/canonical`, { method: "POST" }),
        remove: (domainId: number) =>
          http<{ removed: true }>(`/agent/domains/${domainId}`, { method: "DELETE" }),
      },

      /** Where the agency's own website is told about its bookings. */
      webhooks: {
        list: () => http<WebhookEndpointRow[]>("/agent/webhooks"),
        add: (url: string) =>
          http<WebhookEndpointCreated>("/agent/webhooks", { method: "POST", body: { url } }),
        remove: (id: number) => http<{ removed: true }>(`/agent/webhooks/${id}`, { method: "DELETE" }),
        deliveries: () => http<WebhookDeliveryRow[]>("/agent/webhooks/deliveries"),
        retry: (deliveryId: string) =>
          http<{ queued: boolean }>(`/agent/webhooks/deliveries/${deliveryId}/retry`, { method: "POST" }),
      },
      apiKeys: {
        list: () => http<AgencyApiKey[]>("/agent/api-keys"),
        // the secret is returned once and never again
        create: (name: string, scopes?: string[]) =>
          http<{ secret: string }>("/agent/api-keys", { method: "POST", body: { name, scopes } }),
        // the id is a string because the row is a BigInt, which is what
        // `AgencyApiKey.id` says and what the list hands a caller — taking
        // a number here made every call site convert, and the console's
        // did not
        revoke: (id: string) => http<{ ok: true }>(`/agent/api-keys/${id}`, { method: "DELETE" }),
      },
      activity: (q: { q?: string; take?: number } = {}) =>
        http<AgencyActivity[]>(`/agent/activity${qs(q)}`),

      tours: {
        categories: () => http<TourCategoryNode[]>("/agent/tours/categories"),
        createCategory: (body: { name: string; parentId?: number | null }) =>
          http<TourCategorySaved>("/agent/tours/categories", { method: "POST", body }),
        updateCategory: (id: number, body: TourCategoryEdit) =>
          http<TourCategorySaved>(`/agent/tours/categories/${id}`, { method: "PATCH", body }),
        deleteCategory: (id: number) =>
          http<{ deleted: boolean }>(`/agent/tours/categories/${id}`, { method: "DELETE" }),
        packages: (q: { q?: string; active?: boolean } = {}) =>
          http<TourPackageRow[]>(`/agent/tours/packages${qs(q)}`),
        package: (id: number) => http<TourPackageDetail>(`/agent/tours/packages/${id}`),
        createPackage: (body: NewTourPackage) =>
          http<{ id: number }>("/agent/tours/packages", { method: "POST", body }),
        updatePackage: (id: number, body: TourPackageEdit) =>
          http<{ id: number }>(`/agent/tours/packages/${id}`, { method: "PATCH", body }),
        deletePackage: (id: number) =>
          http<{ deleted: boolean }>(`/agent/tours/packages/${id}`, { method: "DELETE" }),
      },

      books: {
        heads: () => http<ExpenseHeadRow[]>("/agent/expense-heads"),
        createHead: (name: string) =>
          http<ExpenseHeadRow>("/agent/expense-heads", { method: "POST", body: { name } }),
        updateHead: (id: number, body: { name?: string; active?: boolean }) =>
          http<ExpenseHeadRow>(`/agent/expense-heads/${id}`, { method: "PATCH", body }),
        // deleted when nothing has been booked against it, deactivated when
        // something has — an expense still has to be able to name its head
        deleteHead: (id: number) => http<Removal>(`/agent/expense-heads/${id}`, { method: "DELETE" }),
        expenses: (q: { from?: string; to?: string; headId?: number; skip?: number; take?: number } = {}) =>
          http<AgencyExpensePage>(`/agent/expenses${qs(q)}`),
        addExpense: (body: NewAgencyExpense) => http<{ id: number }>("/agent/expenses", { method: "POST", body }),
        removeExpense: (id: number) => http<{ deleted: boolean }>(`/agent/expenses/${id}`, { method: "DELETE" }),
      },

      payroll: {
        employees: () => http<AgencyEmployee[]>("/agent/employees"),
        addEmployee: (body: NewEmployee) => http<{ id: number }>("/agent/employees", { method: "POST", body }),
        editEmployee: (id: number, body: EmployeeEdit) =>
          http<{ id: number }>(`/agent/employees/${id}`, { method: "PATCH", body }),
        // same two answers as a head: paid wages keep the person on the books
        removeEmployee: (id: number) => http<Removal>(`/agent/employees/${id}`, { method: "DELETE" }),
        sheet: (month: string) => http<PayrollSheet>(`/agent/payroll${qs({ month })}`),
        /**
         * `month` is required and `amount` is not: paying without one
         * settles the salary in full, which is what a month usually is.
         * `kind` is checked against `PAYROLL_PAYMENT_KINDS` and defaults
         * to SALARY.
         */
        pay: (employeeId: number, body: PayrollPay) =>
          http<{ id: number }>(`/agent/payroll/${employeeId}`, { method: "POST", body }),
        undoPay: (paymentId: number) =>
          http<{ deleted: boolean }>(`/agent/payroll/payment/${paymentId}`, { method: "DELETE" }),
      },

      sales: {
        list: (q: { kind?: SalesDocKind; status?: string; q?: string } = {}) =>
          http<SalesDocRow[]>(`/agent/sales${qs(q)}`),
        get: (id: number) => http<SalesDocDetail>(`/agent/sales/${id}`),
        create: (body: NewSalesDoc) => http<{ id: number; number: string }>("/agent/sales", { method: "POST", body }),
        update: (id: number, body: SalesDocEdit) => http<{ id: number }>(`/agent/sales/${id}`, { method: "PATCH", body }),
        convert: (id: number) =>
          http<{ id: number; number: string }>(`/agent/sales/${id}/convert`, { method: "POST", body: {} }),
        send: (id: number, body: { to?: string; message?: string } = {}) =>
          http<{ sent: boolean; to: string }>(`/agent/sales/${id}/send`, { method: "POST", body }),
        // the reply carries the document's new arithmetic, so a screen
        // does not have to guess what the payment did to the balance
        recordPayment: (id: number, body: { amount: number; note?: string }) =>
          http<{ id: number; paid: number; due: number; status: SalesDocStatus }>(
            `/agent/sales/${id}/payments`,
            { method: "POST", body },
          ),
        setStatus: (id: number, status: string) =>
          http<{ id: number; status: SalesDocStatus }>(`/agent/sales/${id}/status`, {
            method: "PATCH",
            body: { status },
          }),
        // a document that was sent is voided rather than deleted — a
        // client holding a copy of it still has to be able to find it
        remove: (id: number) =>
          http<{ deleted: true } | { voided: true }>(`/agent/sales/${id}`, { method: "DELETE" }),
        /** The printable copy is HTML, fetched by the host app, not JSON. */
        printPath: (id: number) => `/agent/sales/${id}/print`,
        /** What this agency took against its documents, and who took it. */
        moneyReceived: (q: { from?: string; to?: string; take?: number } = {}) =>
          http<AgencyMoneyReceived>(`/agent/sales/money-received${qs(q)}`),
      },

      guests: (q: { q?: string; take?: number } = {}) =>
        http<{ rows: AgencyGuestRow[]; total: number }>(`/agent/guests${qs(q)}`),
      rooms: (q: { from: string; to: string; resortId?: number }) =>
        http<AgencyRoomOffer[]>(`/agent/rooms${qs(q)}`),
      calendar: (q: { from: string; to: string; resortId?: number }) =>
        http<AgencyCalendar>(`/agent/calendar${qs(q)}`),
    },

    /**
     * Which build the platform is offering, and which it will still
     * serve. Open: the caller may be a phone that has just been refused
     * with a 426 and needs to know where the new one lives.
     */
    appRelease: () => http<AppRelease>("/app/release"),

    // ── running the platform ──
    platform: {
      overview: () => http<PlatformOverview>("/platform/overview"),
      resorts: () => http<PlatformResortRow[]>("/platform/resorts"),
      agents: () => http<PlatformAgentRow[]>("/platform/agents"),
      plans: () => http<PlanDefinition[]>("/platform/plans"),
      updatePlan: (name: string, body: PlanEdit) =>
        http<PlanDefinition>(`/platform/plans/${name}`, { method: "PATCH", body }),
      dues: (q: { resortId?: number; status?: string } = {}) =>
        http<SubscriptionDueRow[]>(`/platform/dues${qs(q)}`),
      /** Subscription dues and one-off charges together, per resort. */
      outstanding: () =>
        http<{ resortId: number; resort: string; subscriptions: number; charges: number; total: number }[]>(
          "/platform/outstanding",
        ),
      charges: (q: { resortId?: number; status?: string } = {}) =>
        http<PlatformChargeRow[]>(`/platform/charges${qs(q)}`),
      payCharge: (id: number, method?: string) =>
        http<PlatformChargeSaved>(`/platform/charges/${id}/pay`, { method: "POST", body: { method } }),
      payDue: (id: number, method?: string) =>
        http<SubscriptionDueRow>(`/platform/dues/${id}/pay`, { method: "POST", body: { method } }),
      subscribe: (resortId: number, body: SetSubscription) =>
        http<SubscriptionSaved>(`/platform/resorts/${resortId}/subscription`, { method: "POST", body }),
      /**
       * `periods`, not months.
       *
       * This took `months` and sent `{ months }`, which the server still
       * accepts under that name — and then counts as periods of whatever
       * the account is standing on. Renewing a yearly subscription by one
       * adds a year and bills a year, so the parameter was out by twelve
       * for every customer not paying monthly. Only the console called it,
       * and the console sent `periods`.
       */
      renew: (subscriptionId: number, periods = 1) =>
        http<SubscriptionSaved>(`/platform/subscriptions/${subscriptionId}/renew`, { method: "POST", body: { periods } }),
      cancelSubscription: (subscriptionId: number) =>
        http<SubscriptionSaved>(`/platform/subscriptions/${subscriptionId}/cancel`, { method: "POST" }),
      setResortStatus: (resortId: number, status: string, reason?: string) =>
        http<ResortStatusSaved>(`/platform/resorts/${resortId}/status`, { method: "PATCH", body: { status, reason } }),
      settings: () => http<PlatformSettings>("/platform/settings"),
      updateSettings: (patch: PlatformSettings) =>
        http<PlatformSettings>("/platform/settings", { method: "PATCH", body: patch }),
      runBillingSweep: () => http<BillingSweepResult>("/platform/billing/sweep", { method: "POST" }),
      cms: () => http<CmsRow[]>("/platform/cms"),
      setCms: (key: string, value: string) => http<CmsRow>("/platform/cms", { method: "POST", body: { key, value } }),
      loginAs: (userId: number) => http<{ accessToken: string }>(`/platform/users/${userId}/login-as`, { method: "POST" }),

      /**
       * The rest of the panel, which reached the API by hand-writing URLs.
       *
       * Fifteen routes the platform console called through the web app's
       * raw `api()` helper, each with a locally hand-written interface
       * beside it. That is the arrangement `api-types.ts` exists to end,
       * and it is how the Resorts tab came to print a schedule label the
       * server had never sent.
       */
      moneyReceived: (q: { from?: string; to?: string; take?: number } = {}) =>
        http<PlatformMoneyReceived>(`/platform/money-received${qs(q)}`),
      subCalendar: (from: string, to: string) =>
        http<SubscriptionCalendarCell[]>(`/platform/sub-calendar${qs({ from, to })}`),
      subscriptions: () => http<PlatformSubscriptionRow[]>("/platform/subscriptions"),
      offers: () => http<OfferRow[]>("/platform/offers"),
      createOffer: (body: NewOffer) => http<OfferRow>("/platform/offers", { method: "POST", body }),
      agencies: (status?: string) => http<PlatformAgencyRow[]>(`/platform/agencies${qs({ status })}`),
      verifyAgency: (accountId: number) =>
        http<{ id: number; name: string; status: string }>(`/platform/agencies/${accountId}/verify`, {
          method: "POST",
        }),
      /**
       * An agency IS its account row — there are no resorts to suspend —
       * so this was the only customer the platform could not hold by
       * hand while the billing sweep could hold it automatically.
       */
      setAccountStatus: (accountId: number, status: "active" | "suspended", reason?: string) =>
        http<AccountStatusSaved>(`/platform/accounts/${accountId}/status`, {
          method: "PATCH",
          body: { status, reason },
        }),
      setAccountDemo: (accountId: number, demo: boolean) =>
        http<{ id: number; demo: boolean }>(`/platform/accounts/${accountId}/demo`, {
          method: "PATCH",
          body: { demo },
        }),
      createPlan: (body: NewPlan) => http<PlanDefinition>("/platform/plans", { method: "POST", body }),
      /** Refused once anybody is on it: retire it instead, and its customers stay. */
      deletePlan: (name: string) =>
        http<{ deleted: true; name: string }>(`/platform/plans/${encodeURIComponent(name)}`, { method: "DELETE" }),
      planSchedules: (name: string) =>
        http<PlanScheduleInput[]>(`/platform/plans/${encodeURIComponent(name)}/schedules`),
      setPlanSchedules: (name: string, schedules: PlanScheduleInput[]) =>
        http<PlanScheduleInput[]>(`/platform/plans/${encodeURIComponent(name)}/schedules`, {
          method: "PUT",
          body: { schedules },
        }),
      /**
       * The agency's float, and moving it.
       *
       * Only the platform may: `RESORT_ADMIN` was once allowed, so a
       * resort could fund and drain a float the agency holds with the
       * platform and spend it on a rival's booking.
       */
      wallet: (userId: number) => http<PlatformWallet>(`/wallets/${userId}`),
      moveWallet: (userId: number, body: { kind: string; amount: number; note?: string }) =>
        http<PlatformWalletTxn>(`/wallets/${userId}/txns`, { method: "POST", body }),
      creditOrders: (status?: string) =>
        http<EmailCreditOrderRow[]>(`/platform/email-credit-orders${qs({ status })}`),
      /**
       * Approval is the only moment credits come into being, and it
       * grants them and raises the charge in one transaction.
       */
      decideCreditOrder: (
        id: string,
        decision: "APPROVE" | "REJECT",
        body: { note?: string; paid?: boolean; method?: string } = {},
      ) =>
        http<EmailCreditOrderRow>(`/platform/email-credit-orders/${id}/decision`, {
          method: "POST",
          body: { decision, ...body },
        }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
