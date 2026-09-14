import type { PublishedResort } from "@rh/shared";
import { Amenities, Contact, MapLink, Photo, PriceFrom, sleeps, Vacancy } from "./parts";

/**
 * Sanctuary — a full-width photograph, quiet type, the rooms in a calm column.
 *
 * For a place whose selling point is that it is somewhere. The cover is given
 * the whole screen and the words are given room; everything else waits below
 * the fold, because a guest looking at a hillside should look at the hillside
 * first.
 */
export default function Sanctuary({ resort }: { resort: PublishedResort }) {
  const cover = resort.photos[0];
  const gallery = resort.photos.slice(1);

  return (
    <main className="bg-white text-slate-900">
      <header className="relative isolate flex min-h-[70vh] items-end overflow-hidden">
        {cover ? (
          <Photo
            photo={cover}
            priority
            sizes="100vw"
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 -z-10"
            style={{ background: resort.themeColor ?? "#1f2937" }}
          />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="mx-auto w-full max-w-5xl px-6 pb-14">
          <p className="text-sm font-medium tracking-wide text-white/80">{resort.location}</p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight text-white sm:text-6xl">
            {resort.name}
          </h1>
          {resort.headline && (
            <p className="mt-4 max-w-2xl text-lg text-white/90">{resort.headline}</p>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-12 px-6 py-14 lg:grid-cols-[1fr_340px]">
        <div className="space-y-14">
          {resort.intro && (
            <p className="max-w-2xl text-lg leading-relaxed text-slate-700">{resort.intro}</p>
          )}

          <Amenities items={resort.amenities} />

          <section data-testid="rooms" className="space-y-8">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Rooms
            </h2>
            {resort.roomTypes.map((room) => (
              <article
                key={room.key}
                id={room.key}
                /* the picture column exists only when there is a picture: an
                   empty 200px track squeezes the room's own words into a
                   quarter of the page, which is how a resort with no photographs
                   yet gets a page that looks broken */
                className={`grid gap-5 ${room.photos[0] ? "sm:grid-cols-[200px_1fr]" : ""}`}
              >
                <Photo
                  photo={room.photos[0]}
                  sizes="200px"
                  className="h-40 w-full rounded-2xl object-cover sm:h-full"
                />
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h3 className="text-xl font-semibold">{room.name}</h3>
                    <PriceFrom room={room} resort={resort} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">Sleeps {sleeps(room)}</p>
                  <Amenities items={room.amenities} className="mt-3" />
                </div>
              </article>
            ))}
          </section>

          {gallery.length > 0 && (
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {gallery.map((p) => (
                <Photo
                  key={p.url}
                  photo={p}
                  sizes="(max-width: 640px) 50vw, 33vw"
                  className="aspect-[4/3] w-full rounded-xl object-cover"
                />
              ))}
            </section>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <Vacancy resort={resort} />
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="text-sm font-semibold">Come and stay</div>
            <p className="mt-1 text-sm text-slate-600">
              Check in {resort.checkInTime} · Check out {resort.checkOutTime}
            </p>
            <Contact resort={resort} className="mt-4" />
            {resort.address && <p className="mt-4 text-sm text-slate-600">{resort.address}</p>}
            <div className="mt-2">
              <MapLink resort={resort} />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
