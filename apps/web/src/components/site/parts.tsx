/**
 * The pieces every template is built from.
 *
 * What a template is free to change is arrangement, typography and colour. What
 * it must not change is the meaning of anything a guest reads or acts on — a
 * price, a phone number, the vacancy lookup. Those live here, once, so that
 * switching design cannot quietly change what the page says.
 */
import type { PublishedResort, PublishedRoomType } from "@rh/shared";
import { Vacancy } from "./vacancy";

/** Money in the resort's own currency, the way the console writes it. */
export function money(amount: number, resort: PublishedResort): string {
  return new Intl.NumberFormat(resort.locale || "en-IN", {
    style: "currency",
    currency: resort.currency || "BDT",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * What a night costs, or an invitation to ask.
 *
 * `null` is not free and it is not zero: it is a kind of room the resort keeps
 * and has not priced here. Printing a number nobody set would be worse than
 * either.
 */
export function PriceFrom({ room, resort }: { room: PublishedRoomType; resort: PublishedResort }) {
  if (room.priceFrom == null) {
    return <span className="text-sm text-slate-500">Please ask us</span>;
  }
  return (
    <span className="whitespace-nowrap">
      <span className="text-lg font-semibold">{money(room.priceFrom, resort)}</span>
      <span className="text-sm text-slate-500"> /night</span>
    </span>
  );
}

/** How many people a room takes, said the way a guest asks it. */
export const sleeps = (room: PublishedRoomType): string => {
  const { adults, children } = room.sleeps;
  const a = `${adults} adult${adults === 1 ? "" : "s"}`;
  return children > 0 ? `${a}, ${children} child${children === 1 ? "" : "ren"}` : a;
};

/**
 * Every way to reach a human, in the order a guest in Bangladesh actually
 * uses them.
 */
export function Contact({ resort, className = "" }: { resort: PublishedResort; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {resort.contactPhone && (
        <a
          href={`tel:${resort.contactPhone}`}
          className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          {resort.contactPhone}
        </a>
      )}
      {resort.whatsapp && (
        <a
          href={`https://wa.me/${resort.whatsapp.replace(/[^0-9]/g, "")}`}
          rel="noopener noreferrer nofollow"
          target="_blank"
          className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-slate-300 hover:bg-slate-50"
        >
          WhatsApp
        </a>
      )}
    </div>
  );
}

/** A photograph, or nothing at all — never a broken frame. */
export function Photo({
  photo,
  className = "",
  sizes,
  priority = false,
}: {
  photo: { url: string; alt: string | null; width: number | null; height: number | null } | undefined;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  if (!photo) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the file store serves
    // these already resized and in one format; next/image would add a second
    // resizing pipeline on the same box for no gain
    <img
      src={photo.url}
      alt={photo.alt ?? ""}
      width={photo.width ?? undefined}
      height={photo.height ?? undefined}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={className}
    />
  );
}

/** The amenity list, when the owner wrote one. */
export function Amenities({ items, className = "" }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((a) => (
        <li key={a} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          {a}
        </li>
      ))}
    </ul>
  );
}

/** Where it is, when the owner dropped a pin. */
export function MapLink({ resort }: { resort: PublishedResort }) {
  if (!resort.map) return null;
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${resort.map.lat},${resort.map.lng}`}
      rel="noopener noreferrer nofollow"
      target="_blank"
      className="text-sm font-semibold underline underline-offset-4"
    >
      Open in Maps
    </a>
  );
}

export { Vacancy };
