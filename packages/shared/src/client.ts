/**
 * One typed client, shared by the console and the mobile app.
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
 * The transport is injected: the console keeps its token in localStorage and
 * the mobile app in secure storage, and neither concern belongs here.
 */
import type {
  AgencyEmployee,
  AgencyExpensePage,
  AgencyGuestRow,
  AgencyRoomOffer,
  AgencyCalendar,
  BookingDetail,
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
  GuestRow,
  Me,
  Page,
  PayrollSheet,
  PermRole,
  PLReport,
  PlatformSettings,
  BillingSweepResult,
  RatePlan,
  Resort,
  Room,
  RoomAvail,
  RoomType,
  SalesDocDetail,
  SalesDocKind,
  SalesDocRow,
  TourCategoryNode,
  TourPackageDetail,
  TourPackageRow,
  ResortOption,
} from "./api-types";

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
}

export interface DateRange {
  from?: string;
  to?: string;
}

export function createApiClient(http: Fetcher) {
  return {
    // ── who am I ──
    me: () => http<Me>("/auth/me"),
    permissions: (resortId?: number) =>
      http<{ permissions: string[] }>(`/auth/permissions${qs({ resortId })}`),
    myResorts: () => http<Resort[]>("/resorts/mine"),

    // ── bookings ──
    bookings: {
      list: (q: BookingListQuery) => http<Page<BookingRow>>(`/bookings${qs({ ...q })}`),
      get: (id: number) => http<BookingDetail>(`/bookings/${id}`),
      create: (body: unknown) => http<BookingDetail>("/bookings", { method: "POST", body }),
      createGroup: (body: unknown) => http<{ bookings: BookingDetail[] }>("/bookings/group", { method: "POST", body }),
      update: (id: number, body: unknown) => http<BookingDetail>(`/bookings/${id}`, { method: "PATCH", body }),
      transition: (id: number, state: string) =>
        http<BookingDetail>(`/bookings/${id}/transition`, { method: "POST", body: { state } }),
      cancel: (id: number, reason?: string) =>
        http<BookingDetail>(`/bookings/${id}/cancel`, { method: "POST", body: { reason } }),
      remove: (id: number) => http<{ deleted: boolean }>(`/bookings/${id}`, { method: "DELETE" }),
      pay: (id: number, body: unknown) =>
        http<BookingDetail>(`/bookings/${id}/payments`, { method: "POST", body }),
      checkout: (id: number, body?: unknown) =>
        http<BookingDetail>(`/bookings/${id}/checkout`, { method: "POST", body }),
      invoice: (id: number) => http<unknown>(`/bookings/${id}/invoice`),
      generateInvoice: (id: number) => http<{ invoiceNo: string }>(`/bookings/${id}/invoice`, { method: "POST" }),
      emailInvoice: (id: number) => http<{ sent: boolean }>(`/bookings/${id}/email-invoice`, { method: "POST", body: {} }),
      cancelRequests: (resortId: number) => http<BookingRow[]>(`/bookings/cancel-requests${qs({ resortId })}`),
      requestCancel: (id: number, reason?: string) =>
        http<unknown>(`/bookings/${id}/cancel-request`, { method: "POST", body: { reason } }),
      decideCancel: (id: number, approve: boolean) =>
        http<unknown>(`/bookings/${id}/cancel-decision`, { method: "POST", body: { approve } }),
    },

    // ── inventory ──
    rooms: {
      list: (resortId: number) => http<Room[]>(`/resorts/${resortId}/rooms`),
      create: (resortId: number, body: unknown) => http<Room>(`/resorts/${resortId}/rooms`, { method: "POST", body }),
      update: (id: number, body: unknown) => http<Room>(`/rooms/${id}`, { method: "PATCH", body }),
      types: (resortId: number) => http<RoomType[]>(`/resorts/${resortId}/room-types`),
      createType: (resortId: number, body: unknown) =>
        http<RoomType>(`/resorts/${resortId}/room-types`, { method: "POST", body }),
      updateType: (id: number, body: unknown) => http<RoomType>(`/room-types/${id}`, { method: "PATCH", body }),
      ratePlans: (resortId: number) => http<RatePlan[]>(`/resorts/${resortId}/rate-plans`),
      createRatePlan: (resortId: number, body: unknown) =>
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

    // ── the desk ──
    daySheet: (resortId: number, date?: string) => http<DaySheet>(`/resorts/${resortId}/day-sheet${qs({ date })}`),
    today: (resortId: number) => http<unknown>(`/resorts/${resortId}/today`),
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
      categories: (resortId: number) => http<string[]>(`/resorts/${resortId}/expenses/categories`),
      create: (resortId: number, body: unknown) =>
        http<unknown>(`/resorts/${resortId}/expenses`, { method: "POST", body }),
      remove: (id: number) => http<{ deleted: boolean }>(`/expenses/${id}`, { method: "DELETE" }),
    },

    fb: {
      inHouse: (resortId: number) => http<unknown[]>(`/resorts/${resortId}/fb/in-house`),
      bills: (resortId: number, q: DateRange & { skip?: number; take?: number } = {}) =>
        http<unknown>(`/resorts/${resortId}/fb/bills${qs(q)}`),
      createBill: (resortId: number, body: unknown) =>
        http<unknown>(`/resorts/${resortId}/fb/bills`, { method: "POST", body }),
      payBill: (id: number, body: unknown) => http<unknown>(`/fb/bills/${id}/pay`, { method: "POST", body }),
      removeBill: (id: number) => http<{ deleted: boolean }>(`/fb/bills/${id}`, { method: "DELETE" }),
      packages: (resortId: number) => http<FoodPackage[]>(`/resorts/${resortId}/fb/packages`),
      createPackage: (resortId: number, body: unknown) =>
        http<FoodPackage>(`/resorts/${resortId}/fb/packages`, { method: "POST", body }),
      updatePackage: (id: number, body: unknown) =>
        http<FoodPackage>(`/fb/packages/${id}`, { method: "PATCH", body }),
      removePackage: (id: number) => http<{ deleted: boolean }>(`/fb/packages/${id}`, { method: "DELETE" }),
    },

    payroll: {
      employees: (resortId: number) => http<Employee[]>(`/resorts/${resortId}/payroll/employees`),
      addEmployee: (resortId: number, body: unknown) =>
        http<Employee>(`/resorts/${resortId}/payroll/employees`, { method: "POST", body }),
      updateEmployee: (resortId: number, employeeId: number, body: unknown) =>
        http<Employee>(`/resorts/${resortId}/payroll/employees/${employeeId}`, { method: "PATCH", body }),
      removeEmployee: (resortId: number, employeeId: number) =>
        http<{ deleted: boolean }>(`/resorts/${resortId}/payroll/employees/${employeeId}`, { method: "DELETE" }),
      sheet: (resortId: number, month: string) => http<PayrollSheet>(`/resorts/${resortId}/payroll${qs({ month })}`),
      pay: (resortId: number, employeeId: number, body: unknown) =>
        http<unknown>(`/resorts/${resortId}/payroll/employees/${employeeId}/pay`, { method: "POST", body }),
      unpay: (paymentId: number) => http<{ deleted: boolean }>(`/payroll/payments/${paymentId}`, { method: "DELETE" }),
    },

    // ── what the numbers say ──
    reports: {
      metrics: (resortId: number, r: DateRange = {}) => http<unknown>(`/resorts/${resortId}/metrics${qs(r)}`),
      daily: (resortId: number, from: string, to: string) =>
        http<unknown>(`/resorts/${resortId}/reports/daily${qs({ from, to })}`),
      agents: (resortId: number, r: DateRange = {}) => http<unknown>(`/resorts/${resortId}/reports/agents${qs(r)}`),
      sources: (resortId: number, r: DateRange = {}) => http<unknown>(`/resorts/${resortId}/reports/sources${qs(r)}`),
      collectors: (resortId: number, r: DateRange = {}) =>
        http<unknown>(`/resorts/${resortId}/reports/collectors${qs(r)}`),
      idleInventory: (resortId: number, from: string, to: string) =>
        http<unknown>(`/resorts/${resortId}/reports/idle-inventory${qs({ from, to })}`),
      pl: (resortId: number, from: string, to: string) =>
        http<PLReport>(`/resorts/${resortId}/reports/pl${qs({ from, to })}`),
      audit: (resortId: number, take?: number) => http<unknown>(`/resorts/${resortId}/audit${qs({ take })}`),
    },

    // ── the resort itself ──
    resort: {
      get: (id: number) => http<unknown>(`/resorts/${id}`),
      update: (id: number, body: unknown) => http<unknown>(`/resorts/${id}`, { method: "PATCH", body }),
      users: (id: number) => http<unknown[]>(`/resorts/${id}/users`),
      addUser: (id: number, body: unknown) => http<unknown>(`/resorts/${id}/users`, { method: "POST", body }),
      updateUser: (id: number, userId: number, body: unknown) =>
        http<unknown>(`/resorts/${id}/users/${userId}`, { method: "PATCH", body }),
      roles: (id: number) => http<PermRole[]>(`/resorts/${id}/roles`),
      createRole: (id: number, body: unknown) => http<PermRole>(`/resorts/${id}/roles`, { method: "POST", body }),
      updateRole: (roleId: number, body: unknown) => http<PermRole>(`/roles/${roleId}`, { method: "PATCH", body }),
      removeRole: (roleId: number) => http<{ deleted: boolean }>(`/roles/${roleId}`, { method: "DELETE" }),
      usage: (tenantId: number) => http<unknown>(`/tenants/${tenantId}/usage`),
      fiscalYears: (id: number) => http<unknown>(`/resorts/${id}/fiscal-years`),
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
      wallet: () => http<unknown>("/agent/wallet"),
      activity: (q: { q?: string; take?: number } = {}) => http<unknown[]>(`/agent/activity${qs(q)}`),

      tours: {
        categories: () => http<TourCategoryNode[]>("/agent/tours/categories"),
        createCategory: (body: { name: string; parentId?: number | null }) =>
          http<unknown>("/agent/tours/categories", { method: "POST", body }),
        updateCategory: (id: number, body: unknown) =>
          http<unknown>(`/agent/tours/categories/${id}`, { method: "PATCH", body }),
        deleteCategory: (id: number) =>
          http<{ deleted: boolean }>(`/agent/tours/categories/${id}`, { method: "DELETE" }),
        packages: (q: { q?: string; active?: boolean } = {}) =>
          http<TourPackageRow[]>(`/agent/tours/packages${qs(q)}`),
        package: (id: number) => http<TourPackageDetail>(`/agent/tours/packages/${id}`),
        createPackage: (body: unknown) =>
          http<{ id: number }>("/agent/tours/packages", { method: "POST", body }),
        updatePackage: (id: number, body: unknown) =>
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
        deleteHead: (id: number) => http<unknown>(`/agent/expense-heads/${id}`, { method: "DELETE" }),
        expenses: (q: { from?: string; to?: string; headId?: number; skip?: number; take?: number } = {}) =>
          http<AgencyExpensePage>(`/agent/expenses${qs(q)}`),
        addExpense: (body: unknown) => http<{ id: number }>("/agent/expenses", { method: "POST", body }),
        removeExpense: (id: number) => http<{ deleted: boolean }>(`/agent/expenses/${id}`, { method: "DELETE" }),
      },

      payroll: {
        employees: () => http<AgencyEmployee[]>("/agent/employees"),
        addEmployee: (body: unknown) => http<{ id: number }>("/agent/employees", { method: "POST", body }),
        editEmployee: (id: number, body: unknown) =>
          http<{ id: number }>(`/agent/employees/${id}`, { method: "PATCH", body }),
        removeEmployee: (id: number) => http<unknown>(`/agent/employees/${id}`, { method: "DELETE" }),
        sheet: (month: string) => http<PayrollSheet>(`/agent/payroll${qs({ month })}`),
        pay: (employeeId: number, body: unknown) =>
          http<{ id: number }>(`/agent/payroll/${employeeId}`, { method: "POST", body }),
        undoPay: (paymentId: number) =>
          http<{ deleted: boolean }>(`/agent/payroll/payment/${paymentId}`, { method: "DELETE" }),
      },

      sales: {
        list: (q: { kind?: SalesDocKind; status?: string; q?: string } = {}) =>
          http<SalesDocRow[]>(`/agent/sales${qs(q)}`),
        get: (id: number) => http<SalesDocDetail>(`/agent/sales/${id}`),
        create: (body: unknown) => http<{ id: number; number: string }>("/agent/sales", { method: "POST", body }),
        update: (id: number, body: unknown) => http<{ id: number }>(`/agent/sales/${id}`, { method: "PATCH", body }),
        convert: (id: number) =>
          http<{ id: number; number: string }>(`/agent/sales/${id}/convert`, { method: "POST", body: {} }),
        send: (id: number, body: { to?: string; message?: string } = {}) =>
          http<{ sent: boolean; to: string }>(`/agent/sales/${id}/send`, { method: "POST", body }),
        recordPayment: (id: number, body: { amount: number; note?: string }) =>
          http<unknown>(`/agent/sales/${id}/payments`, { method: "POST", body }),
        setStatus: (id: number, status: string) =>
          http<unknown>(`/agent/sales/${id}/status`, { method: "PATCH", body: { status } }),
        remove: (id: number) => http<unknown>(`/agent/sales/${id}`, { method: "DELETE" }),
        /** The printable copy is HTML, fetched by the host app, not JSON. */
        printPath: (id: number) => `/agent/sales/${id}/print`,
      },

      guests: (q: { q?: string; take?: number } = {}) =>
        http<{ rows: AgencyGuestRow[]; total: number }>(`/agent/guests${qs(q)}`),
      rooms: (q: { from: string; to: string; resortId?: number }) =>
        http<AgencyRoomOffer[]>(`/agent/rooms${qs(q)}`),
      calendar: (q: { from: string; to: string; resortId?: number }) =>
        http<AgencyCalendar>(`/agent/calendar${qs(q)}`),
    },

    // ── running the platform ──
    platform: {
      overview: () => http<unknown>("/platform/overview"),
      resorts: () => http<unknown[]>("/platform/resorts"),
      agents: () => http<unknown[]>("/platform/agents"),
      plans: () => http<unknown[]>("/platform/plans"),
      updatePlan: (name: string, body: unknown) => http<unknown>(`/platform/plans/${name}`, { method: "PATCH", body }),
      dues: (q: { resortId?: number; status?: string } = {}) => http<unknown[]>(`/platform/dues${qs(q)}`),
      /** Subscription dues and one-off charges together, per resort. */
      outstanding: () =>
        http<{ resortId: number; resort: string; subscriptions: number; charges: number; total: number }[]>(
          "/platform/outstanding",
        ),
      charges: (q: { resortId?: number; status?: string } = {}) =>
        http<
          {
            id: number;
            resort: { id: number; name: string };
            kind: string;
            description: string;
            amount: number;
            status: string;
            paidAt: string | null;
            createdAt: string;
          }[]
        >(`/platform/charges${qs(q)}`),
      payCharge: (id: number, method?: string) =>
        http<unknown>(`/platform/charges/${id}/pay`, { method: "POST", body: { method } }),
      payDue: (id: number, method?: string) =>
        http<unknown>(`/platform/dues/${id}/pay`, { method: "POST", body: { method } }),
      subscribe: (resortId: number, body: unknown) =>
        http<unknown>(`/platform/resorts/${resortId}/subscription`, { method: "POST", body }),
      renew: (subscriptionId: number, months = 1) =>
        http<unknown>(`/platform/subscriptions/${subscriptionId}/renew`, { method: "POST", body: { months } }),
      cancelSubscription: (subscriptionId: number) =>
        http<unknown>(`/platform/subscriptions/${subscriptionId}/cancel`, { method: "POST" }),
      setResortStatus: (resortId: number, status: string, reason?: string) =>
        http<unknown>(`/platform/resorts/${resortId}/status`, { method: "PATCH", body: { status, reason } }),
      settings: () => http<PlatformSettings>("/platform/settings"),
      updateSettings: (patch: PlatformSettings) =>
        http<PlatformSettings>("/platform/settings", { method: "PATCH", body: patch }),
      runBillingSweep: () => http<BillingSweepResult>("/platform/billing/sweep", { method: "POST" }),
      cms: () => http<CmsRow[]>("/platform/cms"),
      setCms: (key: string, value: string) => http<CmsRow>("/platform/cms", { method: "POST", body: { key, value } }),
      loginAs: (userId: number) => http<{ accessToken: string }>(`/platform/users/${userId}/login-as`, { method: "POST" }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
