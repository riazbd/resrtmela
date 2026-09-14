/**
 * A picture a resort uploaded (2026-09-14 design, §5.4).
 *
 * Three jobs, and each of them is the reason for one of the rules below: make
 * sure the file is really an image, keep one resort from filling a disk a dozen
 * businesses share, and never let the caller choose where anything lands.
 */
import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import sharp from "sharp";
import { PrismaService } from "../prisma/prisma.service";
import { badRequest } from "../common/rbac";
import { DiskStore, type FileStore } from "./disk-store";

/**
 * The largest thing worth accepting at all, checked before anything decodes it.
 *
 * A decoder is the one part of this that will happily spend a minute and a
 * gigabyte on a file somebody made specially, so the length check comes first
 * and costs nothing.
 */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/** What one resort may keep on a disk that is not only theirs. */
export const RESORT_UPLOAD_QUOTA = 200 * 1024 * 1024;

/**
 * Wider than any page draws it, and no wider.
 *
 * A phone photograph is four thousand pixels across and a cover image is shown
 * at twelve hundred on a large screen. Serving the original costs the guest
 * their data and the resort its ranking, and keeping it costs the platform a
 * disk — for detail nobody will ever see.
 */
export const MAX_IMAGE_WIDTH = 2400;

/**
 * Where the pictures are reachable from, as a stranger's browser sees it.
 *
 * A resort's site is served from the resort's own domain and the files from the
 * platform's, so a relative path would point at a directory the site's host
 * knows nothing about. Configuration rather than a constant because the answer
 * differs per deployment, and empty is correct for any arrangement where the
 * two share a host.
 */
export const photoUrl = (path: string): string =>
  `${(process.env.UPLOAD_PUBLIC_BASE ?? "").replace(/\/+$/, "")}/uploads/${path}`;

/** What a caller may claim to be sending. The bytes still have to agree. */
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"];

@Injectable()
export class UploadService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DiskStore) private readonly store: FileStore,
  ) {}

  /**
   * Accepts one picture and returns the row that now points at it.
   *
   * The order matters and is the whole of the security here: refuse on size
   * before decoding, decode before believing, check the quota before writing,
   * and write the file before the row — a file with no row is litter a sweep
   * can find, while a row with no file is a broken image on somebody's website.
   */
  async put(
    resortId: number,
    userId: number | null,
    bytes: Buffer,
    claimedType: string,
  ): Promise<{ id: bigint; path: string; mediaType: string; bytes: number; width: number | null; height: number | null }> {
    if (bytes.byteLength === 0) throw badRequest("That file is empty.");
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw badRequest(`That file is too large — the limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`);
    }
    if (!ACCEPTED.includes(claimedType.toLowerCase())) {
      throw badRequest("Use a JPEG, PNG, WebP, AVIF or GIF.");
    }

    /**
     * Decoded and written out again, which is what makes "this is an image"
     * true rather than claimed — and is the same operation that removes the
     * EXIF block, where a phone records the exact spot the photograph was taken
     * and which camera took it. A resort publishing a picture of its own beach
     * is not publishing where the owner was standing.
     *
     * `withMetadata` is deliberately not called: the default is to keep none.
     */
    let out: { data: Buffer; info: { width: number; height: number } };
    try {
      out = await sharp(bytes, { failOn: "error" })
        .rotate() // apply the orientation flag before it is thrown away with the rest
        .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw badRequest("That file is not an image this can read.");
    }

    /**
     * The name of the file is the hash of its contents, so the same picture
     * uploaded twice is one file — an owner who uploads the same cover to the
     * gallery and to a room type pays for it once.
     */
    const checksum = createHash("sha256").update(out.data).digest("hex");
    const existing = await this.prisma.upload.findFirst({ where: { resortId, checksum } });
    if (existing) return existing;

    const used = await this.used(resortId);
    if (used + out.data.byteLength > RESORT_UPLOAD_QUOTA) {
      throw badRequest(
        `There is no space left for more pictures — the limit is ${Math.round(RESORT_UPLOAD_QUOTA / 1024 / 1024)}MB. Remove some first.`,
      );
    }

    // the caller never names anything: the resort's id and the content hash do
    const path = `${resortId}/${checksum}.webp`;
    await this.store.put(path, out.data);

    return this.prisma.upload.create({
      data: {
        resortId,
        path,
        mediaType: "image/webp",
        bytes: out.data.byteLength,
        width: out.info.width,
        height: out.info.height,
        checksum,
        uploadedById: userId,
      },
    });
  }

  /** What this resort is keeping, in bytes. */
  async used(resortId: number): Promise<number> {
    const sum = await this.prisma.upload.aggregate({ where: { resortId }, _sum: { bytes: true } });
    return sum._sum.bytes ?? 0;
  }

  /**
   * Forgets a picture, file and row.
   *
   * The file goes first for the same reason it arrives last: a file with no row
   * is litter, and a row with no file is a broken image somebody can see.
   */
  async remove(resortId: number, id: bigint): Promise<void> {
    const row = await this.prisma.upload.findFirst({ where: { id, resortId } });
    if (!row) return;
    await this.store.remove(row.path);
    await this.prisma.upload.delete({ where: { id: row.id } });
  }
}
