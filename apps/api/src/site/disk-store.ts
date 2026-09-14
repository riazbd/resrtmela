/**
 * Where a file actually goes.
 *
 * Narrow on purpose — put, remove, and where the root is. Everything above it
 * deals in names; the one thing that knows about directories is here, so moving
 * to an object store later is this file and nothing else.
 *
 * The root is deployment configuration and is never written into a row: a
 * database restored onto a different machine must not carry that machine's
 * paths with it.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { badRequest } from "../common/rbac";

export interface FileStore {
  /** Writes `bytes` at `name`, relative to the root, creating what it needs. */
  put(name: string, bytes: Buffer): Promise<void>;
  /** Deletes it if it is there, and says nothing if it is not. */
  remove(name: string): Promise<void>;
}

export class DiskStore implements FileStore {
  constructor(private readonly root: string) {}

  /**
   * The absolute path for a name, or a refusal.
   *
   * A caller that can choose a name can try to choose `../../etc/passwd`, and
   * the check lives here rather than in whichever service happens to call it
   * today — the next caller will not remember. Resolved and compared against
   * the root, so `a/../../b` is caught as surely as a leading slash: the string
   * that looks harmless is exactly the one a prefix test lets through.
   */
  private within(name: string): string {
    const full = resolve(this.root, name);
    const root = resolve(this.root);
    if (full !== root && !full.startsWith(root + sep)) {
      throw badRequest("That is not a name this can write");
    }
    return full;
  }

  async put(name: string, bytes: Buffer): Promise<void> {
    const full = this.within(name);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, bytes);
  }

  async remove(name: string): Promise<void> {
    // `force` so a row whose file is already gone can still be deleted: a
    // dangling row is worse than a dangling file, because only one of them is
    // visible to anybody
    await rm(this.within(name), { force: true });
  }

  /** Where nginx serves from. Read at boot, not stored. */
  get base(): string {
    return join(this.root);
  }
}
