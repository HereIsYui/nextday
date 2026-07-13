import type { ArmyFormation, CityArmyPresetState } from "@nextday/shared";

export const armyConfigVersion = "city_army_r2_001";
export const soldierTrainSpiritStoneCost = 2;
export const soldierTrainGrainCost = 8;

export interface ArmyCommanderConfig {
  commanderId: string;
  commanderName: string;
  role: string;
  powerBonusPercent: number;
  requiredBarracksLevel: number;
}

export const armyCommanderConfigs: ArmyCommanderConfig[] = [
  {
    commanderId: "city_vanguard",
    commanderName: "主城先锋",
    role: "攻守均衡，适合初次行军",
    powerBonusPercent: 0,
    requiredBarracksLevel: 1,
  },
  {
    commanderId: "defense_captain",
    commanderName: "守御都尉",
    role: "擅长驻防与城池守备",
    powerBonusPercent: 12,
    requiredBarracksLevel: 2,
  },
  {
    commanderId: "swift_scout",
    commanderName: "疾行斥候",
    role: "擅长侦察与快速行军",
    powerBonusPercent: 8,
    requiredBarracksLevel: 3,
  },
];

const formationPowerBonus: Record<ArmyFormation, number> = {
  balanced: 0,
  assault: 10,
  defense: 15,
  scout: -5,
};

export function getSoldierCapacity(barracksLevel: number): number {
  return 60 + Math.max(1, barracksLevel) * 60;
}

export function getArmyPower(input: {
  soldierCount: number;
  commanderPowerBonusPercent: number;
  formation: ArmyFormation;
}): number {
  const basePower = input.soldierCount * 2;
  return Math.max(
    1,
    Math.floor(
      basePower *
        (1 + (input.commanderPowerBonusPercent + formationPowerBonus[input.formation]) / 100),
    ),
  );
}

export function getFormationLabel(formation: ArmyFormation): string {
  return (
    {
      assault: "破阵",
      balanced: "均衡",
      defense: "守御",
      scout: "轻行",
    } as Record<ArmyFormation, string>
  )[formation];
}

export function defaultPresetName(presetType: CityArmyPresetState["preset_type"]): string {
  return presetType === "march" ? "出征队" : "守备队";
}
