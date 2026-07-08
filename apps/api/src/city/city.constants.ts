export const cityConfigVersion = "city_birth_r1_001";

export const cityProtectionHours = 72;

export const initialCityResources = {
  grain: "1200",
  herb: "120",
  ore: "400",
  soldier: "60",
  spirit_stone: "800",
  wood: "500",
} as const;

export const initialCityDefense = {
  garrison_power: 120,
  protection_label: "新手城防保护",
  wall_durability: 1000,
  wall_durability_cap: 1000,
} as const;
