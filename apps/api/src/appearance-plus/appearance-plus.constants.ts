export const appearancePlusConfigVersion = "appearance_plus_p2_3_v1";
export const appearancePlusRulesetVersion = "ruleset_p2_3_v1";
export const appearancePlusRewardBoundaryVersion = "reward_p2_appearance_none_v1";

export interface AppearancePlusSlotConfig {
  slotId: string;
  name: string;
  allowedTypes: string[];
}

export interface AppearancePlusConfig {
  appearanceId: string;
  name: string;
  appearanceType: string;
  displaySlot: string;
  sourceType: string;
  sourceHint: string;
  ownerScope: "player" | "sect";
  defaultOwned: boolean;
  requiredRole?: "leader" | "elder" | "deacon" | "disciple";
  baseAppearanceId?: string;
  inherited: boolean;
  limited: boolean;
  preview: {
    title: string;
    subtitle: string;
    sampleText: string;
    displayPositions: string[];
    colorToken: string;
  };
}

export const appearancePlusSlots: AppearancePlusSlotConfig[] = [
  {
    slotId: "profile_title",
    name: "名片称号",
    allowedTypes: ["dynamic_title"],
  },
  {
    slotId: "name_card",
    name: "名片布局",
    allowedTypes: ["name_card"],
  },
  {
    slotId: "battle_report",
    name: "战报边框",
    allowedTypes: ["battle_frame"],
  },
  {
    slotId: "cave_scene",
    name: "洞府摆件",
    allowedTypes: ["cave_decoration"],
  },
  {
    slotId: "sect_hall",
    name: "宗门驻地",
    allowedTypes: ["sect_decoration"],
  },
  {
    slotId: "chronicle_skin",
    name: "史册外观",
    allowedTypes: ["chronicle_skin"],
  },
];

export const appearancePlusConfigs: AppearancePlusConfig[] = [
  {
    appearanceId: "title_style_qingtian",
    name: "青天道号",
    appearanceType: "dynamic_title",
    displaySlot: "profile_title",
    sourceType: "activity",
    sourceHint: "活动外观归档后可装备",
    ownerScope: "player",
    defaultOwned: false,
    baseAppearanceId: "title_style_qingtian",
    inherited: false,
    limited: false,
    preview: {
      title: "青天道号",
      subtitle: "姓名前显示一缕青色箓纹",
      sampleText: "青天 · 云游修士",
      displayPositions: ["玩家名片", "排行榜", "聊天前缀"],
      colorToken: "azure",
    },
  },
  {
    appearanceId: "name_card_layout_shanmen",
    name: "山门名帖",
    appearanceType: "name_card",
    displaySlot: "name_card",
    sourceType: "starter",
    sourceHint: "创建角色后默认开放",
    ownerScope: "player",
    defaultOwned: true,
    inherited: false,
    limited: false,
    preview: {
      title: "山门名帖",
      subtitle: "名片显示境界、路线和最近收藏",
      sampleText: "练气一层 · 炼气 · 收藏 3 件",
      displayPositions: ["玩家名片", "插件小卡片"],
      colorToken: "ink",
    },
  },
  {
    appearanceId: "battle_report_yunlu",
    name: "云箓战报",
    appearanceType: "battle_frame",
    displaySlot: "battle_report",
    sourceType: "rank",
    sourceHint: "排行外观归档后可装备",
    ownerScope: "player",
    defaultOwned: false,
    baseAppearanceId: "battle_report_yunlu",
    inherited: false,
    limited: false,
    preview: {
      title: "云箓战报",
      subtitle: "战报摘要使用云箓分隔和关键回合高亮",
      sampleText: "第 2 回合，飞剑破阵；胜因：技能克制。",
      displayPositions: ["战报", "章节卷轴"],
      colorToken: "mist",
    },
  },
  {
    appearanceId: "cave_decoration_lingpu",
    name: "灵圃小景",
    appearanceType: "cave_decoration",
    displaySlot: "cave_scene",
    sourceType: "starter",
    sourceHint: "洞府初建后开放",
    ownerScope: "player",
    defaultOwned: true,
    inherited: false,
    limited: false,
    preview: {
      title: "灵圃小景",
      subtitle: "洞府页展示灵田、丹炉和一方石桌",
      sampleText: "洞府有风，灵圃微亮。",
      displayPositions: ["洞府", "今日修行"],
      colorToken: "green",
    },
  },
  {
    appearanceId: "sect_hall_memorial_jiuta",
    name: "九塔盟碑",
    appearanceType: "sect_decoration",
    displaySlot: "sect_hall",
    sourceType: "sect",
    sourceHint: "加入宗门后由宗主或长老陈列",
    ownerScope: "sect",
    defaultOwned: true,
    requiredRole: "leader",
    inherited: false,
    limited: false,
    preview: {
      title: "九塔盟碑",
      subtitle: "宗门驻地展示九塔镇封纪念碑",
      sampleText: "同门留名于碑，不改变宗门产出。",
      displayPositions: ["宗门列表", "宗门驻地", "纪元史册"],
      colorToken: "stone",
    },
  },
  {
    appearanceId: "era_archive_chuchen",
    name: "初尘纪元史册",
    appearanceType: "chronicle_skin",
    displaySlot: "chronicle_skin",
    sourceType: "era",
    sourceHint: "纪元史册外观归档后可装备",
    ownerScope: "player",
    defaultOwned: false,
    baseAppearanceId: "era_archive_chuchen",
    inherited: true,
    limited: false,
    preview: {
      title: "初尘纪元史册",
      subtitle: "史册页使用初尘纸纹和章节落款",
      sampleText: "本纪元山河未定，诸修各有其名。",
      displayPositions: ["纪元史册", "收藏馆"],
      colorToken: "paper",
    },
  },
];
