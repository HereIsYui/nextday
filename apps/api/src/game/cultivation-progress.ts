import {
  getLevelRequirement,
  getRealmConfig,
  getStageLevelCount,
  maximumRealm,
  stagesPerRealm,
} from "./realm-progression.constants";

export const standardDailyExploreCount = 21;
export const passiveCultivationShare = 0.65;
export const exploreCultivationShare = 0.25;
export const eventCultivationShare = 0.1;

export interface CultivationStateInput {
  currentRealm: number;
  currentStage: number;
  currentLevel: number;
  cultivationValue: bigint;
}

export interface CultivationAllocation {
  currentRealm: number;
  currentStage: number;
  currentLevel: number;
  cultivationValue: bigint;
  levelUps: number;
  stageUps: number;
}

export function allocateCultivation(
  state: CultivationStateInput,
  gain: bigint,
): CultivationAllocation {
  const currentRealm = state.currentRealm;
  let currentStage = normalizeStage(state.currentStage);
  let currentLevel = Math.max(1, state.currentLevel);
  let cultivationValue = state.cultivationValue + (gain > 0n ? gain : 0n);
  let levelUps = 0;
  let stageUps = 0;

  while (currentRealm <= maximumRealm) {
    const stageLevelCount = getStageLevelCount(currentRealm);
    currentLevel = Math.min(Math.max(1, currentLevel), stageLevelCount);
    if (currentStage === stagesPerRealm && currentLevel === stageLevelCount) {
      break;
    }
    const requirement = getLevelRequirement(currentRealm, currentStage, currentLevel);
    if (cultivationValue < requirement) break;

    cultivationValue -= requirement;
    levelUps += 1;
    if (currentLevel < stageLevelCount) {
      currentLevel += 1;
      continue;
    }
    if (currentStage < stagesPerRealm) {
      currentStage += 1;
      currentLevel = 1;
      stageUps += 1;
      continue;
    }
    currentLevel = stageLevelCount;
    break;
  }

  return {
    currentRealm,
    currentStage,
    currentLevel,
    cultivationValue,
    levelUps,
    stageUps,
  };
}

export function getCultivationRatePerHour(realmId: number): number {
  const config = getRealmConfig(realmId);
  return Math.max(1, Math.round((config.standardDailyCultivation * passiveCultivationShare) / 24));
}

export function getExploreCultivationReward(realmId: number, result: "win" | "lose"): number {
  const config = getRealmConfig(realmId);
  const winReward = Math.max(
    1,
    Math.round(
      (config.standardDailyCultivation * exploreCultivationShare) / standardDailyExploreCount,
    ),
  );
  return result === "win" ? winReward : Math.max(1, Math.round(winReward * 0.25));
}

export function getEventCultivationReward(realmId: number, ratio = 0.1): number {
  const config = getRealmConfig(realmId);
  return Math.max(
    1,
    Math.round(config.standardDailyCultivation * Math.min(0.12, Math.max(0.08, ratio))),
  );
}

export function getPillCultivationLimit(realmId: number): number {
  const config = getRealmConfig(realmId);
  return Math.max(1, Math.round(config.standardDailyCultivation * 0.25));
}

function normalizeStage(stage: number): number {
  return Math.min(stagesPerRealm, Math.max(1, Math.floor(stage)));
}
