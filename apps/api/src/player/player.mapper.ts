import type {
  PlayerProfileResponse,
  PlayerProgressState,
  PlayerWalletState,
} from "@nextday/shared";
import type { Player, PlayerProgress, PlayerWallet } from "@prisma/client";
import { toPlayerSummary } from "../auth/auth.service";

export function toPlayerProfileResponse(input: {
  player: Player | null;
  progress: PlayerProgress | null;
  wallet: PlayerWallet | null;
}): PlayerProfileResponse {
  if (!input.player) {
    return {
      player: null,
      progress: null,
      wallet: null,
    };
  }

  return {
    player: toPlayerSummary(input.player),
    progress: input.progress ? toProgressState(input.progress) : null,
    wallet: input.wallet ? toWalletState(input.wallet) : null,
  };
}

function toProgressState(progress: PlayerProgress): PlayerProgressState {
  return {
    player_id: progress.playerId,
    era_id: progress.eraId,
    cultivation_value: progress.cultivationValue.toString(),
    breakthrough_fail_count: progress.breakthroughFailCount,
    calamity_value: progress.calamityValue,
    chapter_id: progress.chapterId,
    catchup_bonus_rate: progress.catchupBonusRate,
    newbie_protection_until: progress.newbieProtectionUntil?.toISOString() ?? null,
    daily_active_score: progress.dailyActiveScore,
    weekly_active_score: progress.weeklyActiveScore,
    cultivation_rate_per_hour: progress.cultivationRatePerHour,
    last_cultivation_at: progress.lastCultivationAt.toISOString(),
  };
}

function toWalletState(wallet: PlayerWallet): PlayerWalletState {
  return {
    player_id: wallet.playerId,
    spirit_stone: wallet.spiritStone.toString(),
    immortal_stone: wallet.immortalStone.toString(),
    jade_paid: wallet.jadePaid.toString(),
    jade_bound: wallet.jadeBound.toString(),
    era_point: wallet.eraPoint.toString(),
  };
}
