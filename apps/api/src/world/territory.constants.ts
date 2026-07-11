import type {
  CityBuildingCostState,
  CityBuildingType,
  CityExpansionState,
  CityResourceSnapshot,
  CityStorageCapacityState,
  WorldTerrainType,
} from "@nextday/shared";

export const territoryConfigVersion = "world_territory_r1_007";
export const maximumCityLevel = 10;
export const territoryCollectionCapSeconds = 12 * 60 * 60;
export const cityBuildingTypes: CityBuildingType[] = [
  "warehouse",
  "barracks",
  "fortification",
  "workshop",
];

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

const cityBuildingNames: Record<CityBuildingType, string> = {
  warehouse: "仓库",
  barracks: "兵营",
  fortification: "城防",
  workshop: "工坊",
};

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

export function sumTerritoryHourlyOutput(terrainTypes: WorldTerrainType[]): TerritoryHourlyOutput {
  return terrainTypes.reduce((total, terrainType) => {
    const output = getTerrainHourlyOutput(terrainType);
    total.spirit_stone += output.spirit_stone;
    total.grain += output.grain;
    total.ore += output.ore;
    total.wood += output.wood;
    total.herb += output.herb;
    return total;
  }, emptyTerritoryHourlyOutput());
}

export function getCityBuildingName(buildingType: CityBuildingType): string {
  return cityBuildingNames[buildingType];
}

export function getMaximumBuildingLevel(cityLevel: number): number {
  return Math.max(1, cityLevel * 2);
}

export function getBuildingUpgradeCost(
  buildingType: CityBuildingType,
  buildingLevel: number,
): CityBuildingCostState {
  const targetLevel = buildingLevel + 1;
  const base = 80 + targetLevel * 55;
  const modifier =
    buildingType === "warehouse"
      ? { spirit_stone: 1, grain: 1.3, ore: 0.8, wood: 1.2 }
      : buildingType === "barracks"
        ? { spirit_stone: 1.1, grain: 1.4, ore: 0.9, wood: 0.8 }
        : buildingType === "fortification"
          ? { spirit_stone: 1.2, grain: 0.7, ore: 1.5, wood: 1.1 }
          : { spirit_stone: 1.3, grain: 0.8, ore: 1.1, wood: 1.4 };

  return {
    spirit_stone: Math.round(base * modifier.spirit_stone),
    grain: Math.round(base * modifier.grain),
    ore: Math.round(base * modifier.ore),
    wood: Math.round(base * modifier.wood),
  };
}

export function getBuildingUpgradeSeconds(buildingLevel: number): number {
  return 60 + buildingLevel * 30;
}

export function getStorageCapacity(warehouseLevel: number): CityStorageCapacityState {
  const level = Math.max(1, warehouseLevel);
  return {
    spirit_stone: 3000 + level * 2200,
    grain: 4500 + level * 3000,
    ore: 1800 + level * 1500,
    wood: 2200 + level * 1800,
    herb: 1400 + level * 1200,
  };
}

export function getCityBuildingEffectSummary(
  buildingType: CityBuildingType,
  level: number,
): string {
  if (buildingType === "warehouse") {
    const capacity = getStorageCapacity(level);
    return `库存上限：灵石 ${capacity.spirit_stone}、粮草 ${capacity.grain}`;
  }
  if (buildingType === "barracks") {
    return `驻防上限与城防兵力提升，当前兵营 ${level} 级`;
  }
  if (buildingType === "fortification") {
    return `城墙耐久与守城韧性提升，当前城防 ${level} 级`;
  }
  return `炼丹、炼器与阵法建设的基础工坊，当前 ${level} 级`;
}
