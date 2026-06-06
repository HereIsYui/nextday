import type {
  RankEntryState,
  ResourcePointSummary,
  SectDetailResponse,
  SectMemberSummary,
  SectSummary,
  SectWarehouseItemState,
  TowerStateSummary,
  WorldBossStateSummary,
} from "@nextday/shared";
import type {
  Player,
  ResourcePointState,
  Sect,
  SectMember,
  SectWarehouseItem,
  TowerState,
  WorldBossState,
} from "@prisma/client";
import { getItemMeta } from "../production/production.constants";

export function toTowerStateSummary(tower: TowerState): TowerStateSummary {
  return {
    tower_id: tower.towerId,
    province_id: tower.provinceId,
    tower_name: tower.towerName,
    integrity: tower.integrity,
    seal_progress: tower.sealProgress,
    break_progress: tower.breakProgress,
    supply_progress: tower.supplyProgress,
    rift_pressure: tower.riftPressure,
    corruption: tower.corruption,
    phase: tower.phase,
  };
}

export function toBossStateSummary(boss: WorldBossState): WorldBossStateSummary {
  return {
    boss_id: boss.bossId,
    name: boss.name,
    phase: boss.phase,
    total_hp: boss.totalHp,
    remaining_hp: boss.remainingHp,
    defeated_count: boss.defeatedCount,
  };
}

export function toSectSummary(
  sect: Sect & { members?: SectMember[] },
  myMember?: SectMember | null,
): SectSummary {
  return {
    sect_id: sect.sectId,
    name: sect.name,
    alignment: sect.alignment,
    level: sect.level,
    funds: sect.funds.toString(),
    build_exp: sect.buildExp,
    member_limit: sect.memberLimit,
    member_count: sect.members?.length ?? 0,
    my_role: (myMember?.role as SectSummary["my_role"]) ?? null,
    my_contribution_weekly: myMember?.contributionWeekly ?? 0,
    my_contribution_total: myMember?.contributionTotal ?? 0,
  };
}

export function toSectMemberSummary(
  member: SectMember & { player: Pick<Player, "playerId" | "name"> },
): SectMemberSummary {
  return {
    player_id: member.playerId,
    name: member.player.name,
    role: member.role,
    contribution_weekly: member.contributionWeekly,
    contribution_total: member.contributionTotal,
  };
}

export function toSectWarehouseItemState(item: SectWarehouseItem): SectWarehouseItemState {
  const meta = getItemMeta(item.itemId);

  return {
    item_id: item.itemId,
    name: meta.name,
    count: item.count.toString(),
  };
}

export function toSectDetailResponse(input: {
  sect:
    | (Sect & {
        members: Array<SectMember & { player: Pick<Player, "playerId" | "name"> }>;
        warehouse: SectWarehouseItem[];
      })
    | null;
  myMember?: SectMember | null;
}): SectDetailResponse {
  if (!input.sect) {
    return { sect: null, members: [], warehouse: [] };
  }

  return {
    sect: toSectSummary(input.sect, input.myMember),
    members: input.sect.members.map(toSectMemberSummary),
    warehouse: input.sect.warehouse.map(toSectWarehouseItemState),
  };
}

export function toResourcePointSummary(point: ResourcePointState): ResourcePointSummary {
  return {
    resource_point_id: point.resourcePointId,
    province_id: point.provinceId,
    name: point.name,
    owner_sect_id: point.ownerSectId,
    owner_player_id: point.ownerPlayerId,
    control_score: point.controlScore,
  };
}

export function toRankEntryState(input: {
  rankNo: number;
  targetType: "player" | "sect";
  targetId: string;
  displayName: string;
  score: bigint | number;
  rewardPreview: RankEntryState["reward_preview"];
}): RankEntryState {
  return {
    rank_no: input.rankNo,
    target_type: input.targetType,
    target_id: input.targetId,
    display_name: input.displayName,
    score: input.score.toString(),
    reward_preview: input.rewardPreview,
  };
}
