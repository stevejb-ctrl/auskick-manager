// Barrel re-exports for the sport abstraction.
export * from "@/lib/sports/types";
export {
  ALL_SPORTS,
  ALL_SPORT_IDS,
  getSportConfig,
  getAgeGroupConfig,
  getBrandForHost,
  getSportByBrand,
  isSportId,
} from "@/lib/sports/registry";
export { aflSport } from "@/lib/sports/afl";
export { netballSport, isPositionAllowedInZone, primaryThirdFor } from "@/lib/sports/netball";
