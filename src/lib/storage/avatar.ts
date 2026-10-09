import { z } from "zod"
import path from "path"

const AVATAR_PATH_PATTERN = /^users\/(\d+)\/avatar\/[0-9a-f]{32}\.(png|jpe?g|webp)$/
const AVATAR_URL_PATTERN = /^https?:\/\/[^/]+\/users\/(\d+)\/avatar\/[0-9a-f]{32}\.(png|jpe?g|webp)$/i
const AVATAR_DIR = "storage/avatars"

/**
 * Build a safe avatar path from a user ID and a hex digest.
 *
 * @param userId  - a numeric user ID (must be >= 0)
 * @param digest  - a 32-character hex string (the avatar hash)
 * @param ext     - file extension, one of `png`, `jpg`, or `webp`
 */
function buildAvatarPath(userId: number, digest: string, ext: string): string {
  return path.join(AVATAR_DIR, String(userId), digest + "." + ext)
}

/**
 * Parse an avatar path and return its components.
 *
 * @param avatarPath - the full relative path to the avatar file
 * @returns parsed avatar info or null if the path doesn't match the expected pattern
 */
export function parseAvatarPath(avatarPath: string): { userId: number; digest: string; ext: string } | null {
  const match = AVATAR_PATH_PATTERN.exec(avatarPath)
  if (!match) return null

  return {
    userId: Number.parseInt(match[1], 10),
    digest: match[0].split("/").pop()!.replace(/\.\w+$/, ""),
    ext: match[0].split(".").pop()!,
  }
}

/**
 * Escape special regex characters in a string so it can be used safely
 * inside a dynamically built RegExp.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Return a RegExp that matches any avatar path for the given user ID.
 *
 * The `userId` segment is escaped so that regex metacharacters are treated
 * literally instead of being interpreted as part of the pattern.
 *
 * @param userId - user identifier (string or number)
 */
export function getAvatarPathRegex(userId: string | number): RegExp {
  const escapedId = escapeRegExp(String(userId))
  return new RegExp(`^users/${escapedId}/avatar/[0-9a-f]{32}\\.(png|jpe?g|webp)$`)
}

/**
 * Delete all avatar files for a given user.
 *
 * @param db   - database connection
 * @param userId - user ID whose avatars should be removed
 */
export async function deleteAvatarsForUser(db: Database, userId: string | number): Promise<void> {
  const regex = getAvatarPathRegex(userId)
  const keys = Object.keys(db.avatars).filter((key) => regex.test(key))
  for (const key of keys) {
    delete db.avatars[key]
  }
}

/**
 * Get the list of all avatars for a user.
 *
 * @param db   - database connection
 * @param userId - user ID to query avatars for
 * @returns array of avatar paths belonging to the user
 */
export function listAvatarsForUser(db: Database, userId: string | number): string[] {
  const regex = getAvatarPathRegex(userId)
  return Object.keys(db.avatars).filter((key) => regex.test(key))
}

/**
 * Avatar storage functions.
 */
export const AvatarStore = {
  buildPath: buildAvatarPath,
  parsePath: parseAvatarPath,
  deleteAll: deleteAvatarsForUser,
  listAll: listAvatarsForUser,
} as const
