export const riskRulesetVersion = "risk_m6_v1";
export const riskConfigVersion = "risk_m6_v1";

export const riskConfig = {
  highFrequencyWindowMs: 5 * 60 * 1000,
  highFrequencySamePathCount: 8,
  fixedIntervalMinSamples: 5,
  fixedIntervalVarianceSeconds: 2,
  longOnlineWindowMs: 6 * 60 * 60 * 1000,
  sameIpPlayersWindowMs: 60 * 60 * 1000,
  sameIpPlayerThreshold: 3,
  towerDelayedRepeatThreshold: 3,
  score: {
    highFrequency: 35,
    fixedInterval: 20,
    longOnline: 10,
    repeatedTarget: 35,
    delayedRepeatedTarget: 60,
    sameIpMultiAccount: 30,
    batchOverflow: 25,
    privilegeViolation: 90,
  },
} as const;

export const transientRateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequestsPerKey: 180,
  sweepIntervalMs: 5 * 60 * 1000,
} as const;
