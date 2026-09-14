/**
 * Files, which this platform has never had (2026-09-14 design, §5.4).
 *
 * Until now the only image anywhere was the platform's own logo, kept as base64
 * inside a settings row. That works for one small file and is wrong for a
 * gallery: the row becomes megabytes, every read of it carries them, and the
 * nightly dump grows by the size of the pictures.
 *
 * So there is a disk now, and a disk brings its own questions — all of which
 * are somebody else's problem until the day they are yours:
 *
 * **Is it an image?** Not "does it claim to be". A file is believed only after
 * it has been decoded and written out again, which is also what removes the
 * GPS coordinates a phone camera puts in every photograph.
 *
 * **Whose disk is it?** One box, a dozen businesses. A resort gets a quota and
 * is told when it is full, rather than everyone finding out together.
 *
 * **Where does it go?** Under one root that is deployment configuration, and
 * never a path the caller chose.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { DiskStore } from "../../src/site/disk-store";
import { UploadService, MAX_UPLOAD_BYTES, RESORT_UPLOAD_QUOTA } from "../../src/site/upload.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
let fx: Fixture;
let root: string;
let uploads: UploadService;

/** A real PNG of a given size, which is the only kind of test worth writing here. */
const png = (w = 40, h = 30) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .png()
    .toBuffer();

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  root = mkdtempSync(join(tmpdir(), "rm-uploads-"));
  uploads = new UploadService(prisma as unknown as PrismaService, new DiskStore(root));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a picture arriving", () => {
  it("is written under the root and recorded, with its real size", async () => {
    const row = await uploads.put(fx.resortId, fx.managerId, await png(40, 30), "image/png");

    expect(row).toMatchObject({ mediaType: "image/webp", width: 40, height: 30 });
    expect(existsSync(join(root, row.path))).toBe(true);
    expect(row.bytes).toBe(readFileSync(join(root, row.path)).byteLength);
  });

  /**
   * The bytes on disk are ours, not the caller's. Re-encoding is what makes
   * "this is an image" true rather than claimed, and it is the same operation
   * that drops the GPS coordinates a phone writes into every photograph — a
   * resort uploading a picture of its own beach should not be publishing the
   * exact spot the owner was standing on.
   */
  it("is decoded and written out again, so what is served is never what arrived", async () => {
    const withGps = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .withExif({ IFD0: { Copyright: "someone", Artist: "a phone" }, GPS: { GPSLatitudeRef: "N" } })
      .jpeg()
      .toBuffer();

    const row = await uploads.put(fx.resortId, fx.managerId, withGps, "image/jpeg");

    const meta = await sharp(readFileSync(join(root, row.path))).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("comes back as one file when the same picture is sent twice", async () => {
    const bytes = await png();

    const first = await uploads.put(fx.resortId, fx.managerId, bytes, "image/png");
    const second = await uploads.put(fx.resortId, fx.managerId, bytes, "image/png");

    expect(second.id).toBe(first.id);
    expect(await prisma.upload.count({ where: { resortId: fx.resortId } })).toBe(1);
  });

  it("is shrunk when it is larger than any page will ever draw it", async () => {
    const huge = await png(5000, 3000);

    const row = await uploads.put(fx.resortId, fx.managerId, huge, "image/png");

    expect(row.width).toBeLessThanOrEqual(2400);
    expect(row.height).toBe(Math.round((row.width! * 3000) / 5000));
  });
});

describe("a file that is not a picture", () => {
  it("is refused, whatever it says it is", async () => {
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");

    await expect(uploads.put(fx.resortId, fx.managerId, pdf, "image/png")).rejects.toMatchObject({
      status: 400,
    });
    expect(await prisma.upload.count()).toBe(0);
  });

  it("leaves nothing on the disk when it is refused", async () => {
    await expect(
      uploads.put(fx.resortId, fx.managerId, Buffer.from("not an image at all"), "image/jpeg"),
    ).rejects.toMatchObject({ status: 400 });

    expect(existsSync(join(root, String(fx.resortId)))).toBe(false);
  });

  it("is refused before it is decoded when it is simply too big", async () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 7);

    await expect(uploads.put(fx.resortId, fx.managerId, big, "image/png")).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("whose disk it is", () => {
  it("stops a resort that has filled its share, and says so in a sentence", async () => {
    await prisma.upload.create({
      data: {
        resortId: fx.resortId,
        path: "already/there.webp",
        mediaType: "image/webp",
        bytes: RESORT_UPLOAD_QUOTA,
        checksum: "x".repeat(64),
      },
    });

    await expect(uploads.put(fx.resortId, fx.managerId, await png(), "image/png")).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/space|full|limit/i),
    });
  });

  it("counts one resort's pictures against that resort alone", async () => {
    const other = await prisma.resort.create({
      data: { tenantId: fx.tenantId, name: "Next Door", slug: `next-door-${Date.now()}` },
    });
    await prisma.upload.create({
      data: {
        resortId: other.id,
        path: "elsewhere/there.webp",
        mediaType: "image/webp",
        bytes: RESORT_UPLOAD_QUOTA,
        checksum: "y".repeat(64),
      },
    });

    await expect(uploads.put(fx.resortId, fx.managerId, await png(), "image/png")).resolves.toBeTruthy();
  });
});

describe("where a file may be written", () => {
  /**
   * The store is handed a name, never a path. A caller that could choose one
   * could choose `../../etc`, and the check belongs in the store rather than in
   * whatever happens to call it today.
   */
  it("refuses to climb out of its own root", async () => {
    const store = new DiskStore(root);

    await expect(store.put("../escape.webp", Buffer.from("x"))).rejects.toMatchObject({ status: 400 });
    await expect(store.put("/etc/passwd", Buffer.from("x"))).rejects.toMatchObject({ status: 400 });
    await expect(store.put("a/../../b.webp", Buffer.from("x"))).rejects.toMatchObject({ status: 400 });
  });

  it("removes what it wrote, and shrugs at what was never there", async () => {
    const store = new DiskStore(root);
    await store.put("7/keep.webp", Buffer.from("x"));

    await store.remove("7/keep.webp");
    await store.remove("7/never-existed.webp");

    expect(existsSync(join(root, "7", "keep.webp"))).toBe(false);
  });
});
