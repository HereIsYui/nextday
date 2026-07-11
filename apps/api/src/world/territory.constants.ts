import type { CityExpansionState, CityResourceSnapshot, WorldTerrainType } from "@nextday/shared";

export const territoryConfigVersion = "world_territory_r1_006";
export const maximumCityLevel = 10;

export interface TerritoryHourlyOutput {
  spirit_stone: number;
  grain: number;
  ore: number;
  wood: number;
  herb: number;
}

export interface CityExpansionCost {
  spirit_stone: number;
  grain: number;
  ore: number;
  wood: number;
}

const terrainHourlyOutput: Record<WorldTerrainType, TerritoryHourlyOutput> = {
  plain: { spirit_stone: 2, grain: 18, ore: 0, wood: 2, herb: 0 },
  swamp: { spirit_stone: 4, grain: 3, ore: 0, wood: 1, herb: 11 },
  forest: { spirit_stone: 3, grain: 4, ore: 0, wood: 14, herb: 5 },
  mountain: { spirit_stone: 7, grain: 0, ore: 16, wood: 1, herb: 0 },
  desert: { spirit_stone: 10, grain: 1, ore: 5, wood: 0, herb: 0 },
};

export function getTerritoryBlockLimit(cityLevel: number): number {
  return 3 + Math.max(0, cityLevel - 1) * 2;
}

export function getRequiredPlainBlocksForExpansion(cityLevel: number): number {
  return cityLevel + 1;
}

export function getCityBuildingSlots(cityLevel: number): number {
  return 4 + Math.max(0, cityLevel - 1) * 2;
}

export function getCityExpansionCost(cityLevel: number): CityExpansionCost | null {
  if (cityLevel >= maximumCityLevel) {
    return null;
  }

  return {
    spirit_stone: 180 + cityLevel * 120,
    grain: 320 + cityLevel * 180,
    ore: 120 + cityLevel * 90,
    wood: 160 + cityLevel * 110,
  };
}

export function buildCityExpansionState(input: {
  cityLevel: number;
  ownedPlainBlocks: number;
  resources: CityResourceSnapshot;
}): CityExpansionState {
  const cost = getCityExpansionCost(input.cityLevel);
  const requiredPlainBlocks = getRequiredPlainBlocksForExpansion(input.cityLevel);
  const resources = input.resources;
  const hasResources =
    cost !== null &&
    Number(resources.spirit_stone) >= cost.spirit_stone &&
    Number(resources.grain) >= cost.grain &&
    Number(resources.ore) >= cost.ore &&
    Number(resources.wood) >= cost.wood;
  const hasPlainBlocks = input.ownedPlainBlocks >= requiredPlainBlocks;
  const eligible = Boolean(cost && hasPlainBlocks && hasResources);
  const reason = !cost
    ? "主城已达当前纪元最高等级"
    : !hasPlainBlocks
      ? `还需拥有 ${requiredPlainBlocks - input.ownedPlainBlocks} 块平原领地才可扩建`
      : !hasResources
        ? "主城库存不足，先积累粮草、灵木、矿材与灵石"
        : "平原与物资齐备，可扩建主城";

  return {
    city_level: input.cityLevel,
    next_city_level: cost ? input.cityLevel + 1 : null,
    maximum_city_level: maximumCityLevel,
    building_slots: getCityBuildingSlots(input.cityLevel),
    owned_plain_blocks: input.ownedPlainBlocks,
    required_plain_blocks: requiredPlainBlocks,
    eligible,
    reason,
    cost,
  };
}

export function getTerrainHourlyOutput(terrainType: WorldTerrainType): TerritoryHourlyOutput {
  return terrainHourlyOutput[terrainType];
}

export function emptyTerritoryHourlyOutput(): TerritoryHourlyOutput {
  return { spirit_stone: 0, grain: 0, ore: 0, wood: 0, herb: 0 };
}
