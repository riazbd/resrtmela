import type { PublishedResort } from "@rh/shared";
import { Amenities, Contact, MapLink, Photo, PriceFrom, sleeps, Vacancy } from "./parts";

/**
 * Ledger — plain and quick: prices and availability first, pictures after.
 *
 * For a resort whose guests already know the place and are checking one thing.
 * No cover image at all above the fold: the name, the price list and the
 * vacancy lookup, in that order, which is the fastest page of the three on a
 * phone on mobile data — and the one a returning guest will thank you for.
 */
export default function Ledger({ resort }: { resort: PublishedResort }) {
  const accent = resort.themeColor ?? "#0f172a";

  return (
    <main className="bg-white text-slate-900">
      <header className="border-b border-slate-200" style={{ borderTopColor: accent, borderTopWidth: 4 }}>
        <div className="mx-auto max-w-4xl px-6 py-8">
          <h1 className="text-2xl font-bold sm:text-3xl">{resort.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{resort.location}</p>
          {resort.headline && <p className="mt-3 text-base text-slate-700">{resort.headline}</p>}
          <Contact resort={resort} className="mt-5" />
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-10 px-6 py-10">
        <Vacancy resort={resort} />

        <section data-testid="rooms">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Rooms and rates
          </h2>
          <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
            {resort.roomTypes.map((room) => (
              <article
                key={room.key}
                id={room.key}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4"
              >
                <div>
                  <h3 className="text-base font-semibold">{room.name}</h3>
                  <p className="text-sm text-slate-500">
                    Sleeps {sleeps(room)}
                    {room.amenities.length > 0 && ` · ${room.amenities.join(", ")}`}
                  </p>
                </div>
                <PriceFrom room={room} resort={resort} />
              </article>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Check in {resort.checkInTime} · Check out {resort.checkOutTime}
          </p>
        </section>

        {resort.intro && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              About
            </h2>
            <p className="mt-3 leading-relaxed text-slate-700">{resort.intro}</p>
            <Amenities items={resort.amenities} className="mt-4" />
          </section>
        )}

        {resort.photos.length > 0 && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {resort.photos.map((p, i) => (
              <Photo
                key={p.url}
                photo={p}
                priority={i === 0}
                sizes="(max-width: 640px) 50vw, 25vw"
                className="aspect-[4/3] w-full rounded-lg object-cover"
              />
            ))}
          </section>
        )}

        <section className="rounded-lg bg-slate-50 p-5">
          <div className="text-sm font-semibold">Find us</div>
          {resort.address && <p className="mt-1 text-sm text-slate-600">{resort.address}</p>}
          <div className="mt-2">
            <MapLink resort={resort} />
          </div>
        </section>
      </div>
    </main>
  );
}
