import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ZONE_BARS_STORAGE_KEY,
  aflZoneBar,
  basketballZoneBar,
  netballZoneBar,
  readZoneBars,
  soccerZoneBar,
  touchZoneBar,
  writeZoneBars,
  zoneBar,
} from "../zoneBars";

// A phone: storage and events, nothing else (the tests run in node).
function aPhone() {
  const store = new Map<string, string>();
  const target = new EventTarget();
  vi.stubGlobal("CustomEvent", class extends Event {});
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  });
}

describe("the time-bars preference", () => {
  beforeEach(aPhone);
  afterEach(() => vi.unstubAllGlobals());

  it("is on until this phone turns it off", () => {
    expect(readZoneBars()).toBe(true);
    writeZoneBars(false);
    expect(window.localStorage.getItem(ZONE_BARS_STORAGE_KEY)).toBe("off");
    expect(readZoneBars()).toBe(false);
    writeZoneBars(true);
    expect(window.localStorage.getItem(ZONE_BARS_STORAGE_KEY)).toBeNull();
    expect(readZoneBars()).toBe(true);
  });

  it("tells the screen when it changes", () => {
    let heard = 0;
    const listen = () => heard++;
    window.addEventListener("siren:zone-bars-change", listen);
    writeZoneBars(false);
    window.removeEventListener("siren:zone-bars-change", listen);
    expect(heard).toBe(1);
  });
});

describe("a kid's bar", () => {
  it("drops empty areas, and is nothing before they've played", () => {
    expect(zoneBar([{ key: "a", ms: 0, tone: "f" }])).toBeNull();
    expect(zoneBar([{ key: "a", ms: 0, tone: "f" }, { key: "b", ms: 5, tone: "b" }])).toEqual([{ key: "b", ms: 5, tone: "b" }]);
  });

  it("is nothing in a format with no areas: one plain colour says nothing", () => {
    expect(soccerZoneBar({ field: 60_000 })).toBeNull();
    expect(basketballZoneBar({ court: 60_000 })).toBeNull();
    expect(touchZoneBar({ field: 60_000 })).toBeNull();
  });

  it("puts AFL's half-forward with forward and half-back with back", () => {
    expect(aflZoneBar({ fwd: 1, hfwd: 2, mid: 3, hback: 4, back: 5 })).toEqual([
      { key: "fwd", ms: 3, tone: "f" },
      { key: "mid", ms: 3, tone: "c" },
      { key: "back", ms: 9, tone: "b" },
    ]);
  });

  it("colours netball's thirds and the soccer keeper by place", () => {
    expect(netballZoneBar({ attack: 1, centre: 2, defence: 3 })?.map((s) => s.tone)).toEqual(["f", "c", "b"]);
    expect(soccerZoneBar({ att: 1, def: 2, gk: 3 })?.map((s) => [s.key, s.tone])).toEqual([
      ["att", "f"],
      ["def", "b"],
      ["gk", "k"],
    ]);
  });
});
