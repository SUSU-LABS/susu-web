import { describe, expect, it } from "vitest"
import { buildAvatarPath, parseAvatarPath, getAvatarPathRegex } from "./avatar"

describe("avatar path helpers", () => {
  it("builds and parses a correct avatar path", () => {
    const path = buildAvatarPath(1, "d46c6f383baca108cd19e7097d86a5e7", "png")
    expect(path).toBe("storage/avatars/1/d46c6f383baca108cd19e7097d86a5e7.png")

    const parsed = parseAvatarPath(path)
    expect(parsed).toEqual({
      userId: 1,
      digest: "d46c6f383baca108cd19e7097d86a5e7",
      ext: "png",
    })
  })

  it("rejects malformed paths", () => {
    expect(parseAvatarPath("storage/avatars/not-a-number/abc.png")).toBeNull()
    expect(parseAvatarPath("storage/avatars/1/short.png")).toBeNull()
    expect(parseAvatarPath("storage/avatars/1/d46c6f383baca108cd19e7097d86a5e7.bmp")).toBeNull()
  })

  it("matches existing avatar paths for a numeric user id", () => {
    const regex = getAvatarPathRegex(1)
    expect(regex.test("users/1/avatar/d46c6f383baca108cd19e7097d86a5e7.png")).toBe(true)
    expect(regex.test("users/1/avatar/d46c6f383baca108cd19e7097d86a5e7.webp")).toBe(true)
    expect(regex.test("users/2/avatar/d46c6f383baca108cd19e7097d86a5e7.png")).toBe(false)
  })

  it("treats regex metacharacters in a user id literally", () => {
    const userId = "user[1]"
    const regex = getAvatarPathRegex(userId)

    // The path containing the literal id should match
    expect(regex.test(`users/${userId}/avatar/d46c6f383baca108cd19e7097d86a5e7.png`)).toBe(true)

    // A crafted path that would exploit unescaped metacharacters must NOT match
    // e.g. "users/user/1/avatar/…" or "users/user[1]/avatar/…" with alternation
    expect(regex.test("users/user/avatar/d46c6f383baca108cd19e7097d86a5e7.png")).toBe(false)
    expect(regex.test("users/user1/avatar/d46c6f383baca108cd19e7097d86a5e7.png")).toBe(false)
  })
})
