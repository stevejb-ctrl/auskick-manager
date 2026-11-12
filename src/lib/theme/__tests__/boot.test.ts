import { describe, expect, it } from "vitest";
import { THEME_BOOT_SCRIPT, THEME_PREFERENCE_STORAGE_KEY } from "../../themePreference";

/** Runs the inline <head> script against a stored value; returns <html data-theme>. */
function boot(stored: string | null, throws = false): string | null {
  const attrs: Record<string, string> = {};
  const localStorage = {
    getItem: (k: string) => {
      if (throws) throw new Error("SecurityError");
      return k === THEME_PREFERENCE_STORAGE_KEY ? stored : null;
    },
  };
  const document = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
  new Function("localStorage", "document", THEME_BOOT_SCRIPT)(localStorage, document);
  return attrs["data-theme"] ?? null;
}

describe("the theme boot script", () => {
  it("puts a stored Light or Dark on <html> before paint", () => {
    expect(boot("light")).toBe("light");
    expect(boot("dark")).toBe("dark");
  });

  it("leaves System (nothing stored) to the phone's setting", () => {
    expect(boot(null)).toBeNull();
  });

  it("ignores junk and a storage that throws (private Safari)", () => {
    expect(boot("purple")).toBeNull();
    expect(boot("dark", true)).toBeNull();
  });
});
