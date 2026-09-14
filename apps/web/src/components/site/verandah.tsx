import type { PublishedResort } from "@rh/shared";
import { Amenities, Contact, MapLink, Photo, PriceFrom, sleeps, Vacancy } from "./parts";

/**
 * Verandah — warm and traditional: a framed cover, the rooms side by side.
 *
 * For a family-run place that wants to look established rather than
 * fashionable. The cover is a framed picture rather than a bleed, the type is
 * serif, and the rooms are a grid of cards — the shape a guest already knows
 * from every hotel page they have used, which is an asset and not a failing.
 */
export default function Verandah({ resort }: { resort: PublishedResort }) {
  const accent = resort.themeColor ?? "#7c2d12";

  return (
    <main className="bg-[#fdfbf7] text-stone-900">
      <header className="mx-auto max-w-6xl px-6 pt-10">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: accent }}>
            {resort.location}
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">{resort.name}</h1>
          {resort.headline && (
            <p className="mx-auto mt-3 max-w-2xl text-lg text-stone-600">{resort.headline}</p>
          )}
        </div>
        {resort.photos[0] && (
          <div className="mt-8 rounded-sm border-8 border-white shadow-lg">
            <Photo
              photo={resort.photos[0]}
              priority
              sizes="100vw"
              className="aspect-[21/9] w-full object-cover"
            />
          </div>
        )}
      </header>

      <div className="mx-auto max-w-6xl space-y-16 px-6 py-14">
        {resort.intro && (
          <p className="mx-auto max-w-3xl text-center font-serif text-xl leading-relaxed text-stone-700">
            {resort.intro}
          </p>
        )}

        <section data-testid="rooms">
          <h2 className="text-center font-serif text-2xl">Our rooms</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {resort.roomTypes.map((room) => (
              <article
                key={room.key}
                id={room.key}
                className="flex flex-col overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-stone-200"
              >
                <Photo
                  photo={room.photos[0]}
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="aspect-[4/3] w-full object-cover"
                />
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-serif text-xl">{room.name}</h3>
                  <p className="mt-1 text-sm text-stone-500">Sleeps {sleeps(room)}</p>
                  <Amenities items={room.amenities} className="mt-3" />
                  <div className="mt-auto pt-4">
                    <PriceFrom room={room} resort={resort} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Amenities items={resort.amenities} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {resort.photos.slice(1).map((p) => (
                <Photo
                  key={p.url}
                  photo={p}
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="aspect-square w-full rounded-sm border-4 border-white object-cover shadow"
                />
              ))}
            </div>
            <div className="rounded-lg bg-white p-6 ring-1 ring-stone-200">
              <div className="font-serif text-lg">Come and stay</div>
              <p className="mt-1 text-sm text-stone-600">
                Check in {resort.checkInTime} · Check out {resort.checkOutTime}
              </p>
              {resort.address && <p className="mt-3 text-sm text-stone-600">{resort.address}</p>}
              <Contact resort={resort} className="mt-4" />
              <div className="mt-3">
                <MapLink resort={resort} />
              </div>
            </div>
          </div>
          <Vacancy resort={resort} />
        </section>
      </div>
    </main>
  );
}
