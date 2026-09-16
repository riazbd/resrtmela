import { formatMoney, type AgencyPublished, type AgencyResort, type PublishedRoomType } from "@rh/shared";
import { Photo } from "@/components/site/parts";
import { enquiry, telLink, whatsappLink } from "./contact";
import { ResortVacancy } from "./resort-vacancy";

/**
 * An agency's own page (2026-09-17 design, §1).
 *
 * Laid out the way a traveller reads an agency: who they are, what trips they
 * put together, where they can put you up, and how to reach them. Every call to
 * action is a conversation with the agency — there is no booking button,
 * because guests do not book on the platform.
 */

/** The agency's colour, or a calm default that reads on white. */
const DEFAULT_ACCENT = "#0f5132";

/** In the resort's own currency and grouping, written the way the console writes money (৳, not BDT). */
function nightPrice(room: PublishedRoomType, resort: AgencyResort): string | null {
  if (room.priceFrom == null) return null;
  return formatMoney(room.priceFrom, { currency: resort.currency, locale: resort.locale, decimals: 0 });
}

export function AgencyPage({ page }: { page: AgencyPublished }) {
  const { agency, resorts, tours } = page;
  const accent = agency.themeColor ?? DEFAULT_ACCENT;
  const cover = agency.photos[0];
  const gallery = agency.photos.slice(1);
  const chat = whatsappLink(agency.whatsapp, `Hello ${agency.name}, I found you on your website.`);
  const call = telLink(agency.phone);

  return (
    <main className="bg-white text-slate-900">
      <header className="relative isolate flex min-h-[60vh] items-end overflow-hidden">
        {cover ? (
          <Photo photo={cover} priority sizes="100vw" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 -z-10" style={{ background: accent }} />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        <div className="mx-auto w-full max-w-5xl px-5 pb-12 sm:px-6">
          <h1 className="text-4xl font-semibold leading-tight text-white sm:text-6xl">{agency.name}</h1>
          {agency.headline && <p className="mt-3 max-w-2xl text-lg text-white/90">{agency.headline}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            {chat && (
              <a href={chat} target="_blank" rel="noopener noreferrer nofollow" className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100">
                Message us on WhatsApp
              </a>
            )}
            {call && (
              <a href={call} className="rounded-full px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/70 hover:bg-white/10">
                Call {agency.phone}
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-16 px-5 py-14 sm:px-6">
        {agency.intro && <p className="max-w-3xl whitespace-pre-line text-lg leading-relaxed text-slate-700">{agency.intro}</p>}

        {tours.length > 0 && (
          <section data-testid="tours" className="space-y-5">
            <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: accent }}>
              Tours
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {tours.map((t) => {
                const ask = whatsappLink(agency.whatsapp, enquiry(agency.name, `the tour "${t.name}"`));
                return (
                  <article key={t.id} className="flex flex-col rounded-2xl p-5 ring-1 ring-slate-200">
                    <h3 className="text-lg font-semibold">{t.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {t.days} day{t.days === 1 ? "" : "s"}
                      {t.nights > 0 && `, ${t.nights} night${t.nights === 1 ? "" : "s"}`} · for {t.pax} {t.pax === 1 ? "person" : "people"}
                    </p>
                    {t.summary && <p className="mt-3 text-sm leading-relaxed text-slate-700">{t.summary}</p>}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                      {t.price > 0 ? (
                        <span className="text-lg font-semibold">{formatMoney(t.price, { decimals: 0 })}</span>
                      ) : (
                        <span className="text-sm text-slate-500">Price on request</span>
                      )}
                      {ask && (
                        <a href={ask} target="_blank" rel="noopener noreferrer nofollow" className="text-sm font-semibold underline underline-offset-4" style={{ color: accent }}>
                          Ask about this tour
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {resorts.length > 0 && (
          <section data-testid="resorts" className="space-y-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: accent }}>
              Where we can put you up
            </h2>
            {resorts.map((resort) => (
              <article key={resort.slug} id={resort.slug} className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <div className={`grid ${resort.photos[0] ? "md:grid-cols-[320px_1fr]" : ""}`}>
                  <Photo photo={resort.photos[0]} sizes="(max-width: 768px) 100vw, 320px" className="h-56 w-full object-cover md:h-full" />
                  <div className="space-y-4 p-5">
                    <div>
                      <h3 className="text-xl font-semibold">{resort.name}</h3>
                      {resort.location && <p className="text-sm text-slate-500">{resort.location}</p>}
                    </div>
                    {resort.roomTypes.length > 0 && (
                      <ul className="divide-y divide-slate-100 text-sm">
                        {resort.roomTypes.map((room) => (
                          <li key={room.key} className="flex items-baseline justify-between gap-3 py-1.5">
                            <span>
                              {room.name}
                              <span className="ml-2 text-xs text-slate-400">sleeps {room.sleeps.adults}</span>
                            </span>
                            <span className="whitespace-nowrap text-slate-600">
                              {nightPrice(room, resort) ? `from ${nightPrice(room, resort)} /night` : "Ask us"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <ResortVacancy agency={agency} resort={resort} whatsapp={agency.whatsapp} accent={accent} />
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

        {gallery.length > 0 && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((p) => (
              <Photo key={p.url} photo={p} sizes="(max-width: 640px) 50vw, 33vw" className="aspect-[4/3] w-full rounded-xl object-cover" />
            ))}
          </section>
        )}

        <footer className="rounded-2xl bg-slate-50 p-6">
          <div className="text-lg font-semibold">Plan your trip with {agency.name}</div>
          <div className="mt-4 flex flex-wrap gap-3">
            {chat && (
              <a href={chat} target="_blank" rel="noopener noreferrer nofollow" className="rounded-full px-5 py-2.5 text-sm font-semibold text-white" style={{ background: accent }}>
                WhatsApp
              </a>
            )}
            {call && (
              <a href={call} className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-slate-300 hover:bg-white">
                {agency.phone}
              </a>
            )}
            {agency.email && (
              <a href={`mailto:${agency.email}`} className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-slate-300 hover:bg-white">
                {agency.email}
              </a>
            )}
          </div>
          {agency.address && <p className="mt-4 text-sm text-slate-600">{agency.address}</p>}
          {(agency.social.facebook || agency.social.instagram) && (
            <div className="mt-3 flex gap-4 text-sm font-semibold">
              {agency.social.facebook && (
                <a href={agency.social.facebook} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4">
                  Facebook
                </a>
              )}
              {agency.social.instagram && (
                <a href={agency.social.instagram} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4">
                  Instagram
                </a>
              )}
            </div>
          )}
        </footer>
      </div>
    </main>
  );
}
