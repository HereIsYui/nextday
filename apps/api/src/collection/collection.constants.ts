import type { EraCollectionType } from "@nextday/shared";

export const collectionConfigVersion = "collection_p2_2_v1";
export const collectionRulesetVersion = "ruleset_p2_2_v1";
export const collectionRewardBoundaryVersion = "reward_p2_collection_none_v1";
export const collectionBlessingCapPercent = 1;

export interface CollectionDisplaySlotConfig {
  slotId: string;
  name: string;
  allowedTypes: EraCollectionType[];
}

export interface EraCollectionConfig {
  collectionId: string;
  name: string;
  collectionType: EraCollectionType;
  rarity: "common" | "rare" | "epic" | "legendary";
  eraId: string;
  sourceType: string;
  sourceId: string;
  sourceHint: string;
  displayPositions: string[];
  inheritRule: string;
  duplicateConvert: string;
  blessingPercent: number;
  unlockHint: string;
  publicSummary: string;
  unlock: {
    chapterRequired?: number;
    storyScrollId?: string;
    chronicleType?: string;
    appearanceId?: string;
    ancientTreasureId?: string;
  };
}

export const collectionDisplaySlots: CollectionDisplaySlotConfig[] = [
  {
    slotId: "profile_showcase",
    name: "名片陈列",
    allowedTypes: ["story_scroll", "title", "event_memorial", "ancient_catalog"],
  },
  {
    slotId: "chronicle_wall",
    name: "史册墙",
    allowedTypes: ["era_chronicle", "tower_achievement", "faction_ending", "event_memorial"],
  },
  {
    slotId: "museum_focus",
    name: "博物志焦点",
    allowedTypes: ["story_scroll", "era_chronicle", "title", "ancient_catalog"],
  },
];

export const eraCollectionConfigs: EraCollectionConfig[] = [
  {
    collectionId: "collection_story_xuantie_first_seal",
    name: "玄铁初鸣残卷",
    collectionType: "story_scroll",
    rarity: "common",
    eraId: "era_mvp_001",
    sourceType: "story_scroll",
    sourceId: "story_scroll_ch01_xuantie_first_seal",
    sourceHint: "完成第一章卷轴归档后获得",
    displayPositions: ["profile_showcase", "museum_focus"],
    inheritRule: "跨纪元只继承展示和回看入口，不继承战斗效果",
    duplicateConvert: "重复残卷转化为收藏尘，不产生战力",
    blessingPercent: 0,
    unlockHint: "初入冀州后解锁",
    publicSummary: "记录第一次听见玄铁塔裂隙回声的卷轴残页。",
    unlock: {
      chapterRequired: 1,
      storyScrollId: "story_scroll_ch01_xuantie_first_seal",
    },
  },
  {
    collectionId: "collection_chronicle_jiuta_memory",
    name: "九塔纪事拓本",
    collectionType: "era_chronicle",
    rarity: "rare",
    eraId: "era_mvp_001",
    sourceType: "era_chronicle",
    sourceId: "tower",
    sourceHint: "纪元史册整理九塔公开状态后获得",
    displayPositions: ["chronicle_wall", "museum_focus"],
    inheritRule: "跨纪元保留史册展示，不叠加九塔贡献",
    duplicateConvert: "重复拓本转化为收藏尘，只提升展示等级",
    blessingPercent: 1,
    unlockHint: "生成九塔纪事后解锁",
    publicSummary: "公开记录本纪元九塔状态的史册拓本。",
    unlock: {
      chapterRequired: 1,
      chronicleType: "tower",
    },
  },
  {
    collectionId: "collection_title_jiuzhou_ming",
    name: "九州鸣名帖",
    collectionType: "title",
    rarity: "epic",
    eraId: "era_mvp_001",
    sourceType: "rank_title",
    sourceId: "title_era_jiuzhou_ming",
    sourceHint: "纪元榜称号归档后获得",
    displayPositions: ["profile_showcase", "museum_focus"],
    inheritRule: "称号样式可继承展示，纪元祝福有效值受 1% 限幅",
    duplicateConvert: "重复名帖只转收藏材料或展示等级",
    blessingPercent: 1,
    unlockHint: "获得九州鸣称号后解锁",
    publicSummary: "将纪元榜称号压成一枚可陈列的名帖。",
    unlock: {
      appearanceId: "title_era_jiuzhou_ming",
    },
  },
  {
    collectionId: "collection_event_suishi_note",
    name: "岁时同贺笺",
    collectionType: "event_memorial",
    rarity: "common",
    eraId: "era_mvp_001",
    sourceType: "event",
    sourceId: "era_event",
    sourceHint: "参与节日活动或读取活动史册后获得",
    displayPositions: ["profile_showcase", "chronicle_wall"],
    inheritRule: "活动纪念物跨纪元只做展示，不继承活动奖励",
    duplicateConvert: "重复纪念笺转化为收藏尘",
    blessingPercent: 0,
    unlockHint: "活动节点写入史册后解锁",
    publicSummary: "记录本纪元岁时活动的纪念笺。",
    unlock: {
      chapterRequired: 1,
      chronicleType: "event",
    },
  },
  {
    collectionId: "collection_ancient_catalog_first_echo",
    name: "古宝图鉴初拓",
    collectionType: "ancient_catalog",
    rarity: "rare",
    eraId: "era_mvp_001",
    sourceType: "ancient_catalog",
    sourceId: "any_owned_ancient_treasure",
    sourceHint: "首次获得九大古宝图鉴外观后获得",
    displayPositions: ["profile_showcase", "museum_focus"],
    inheritRule: "只继承图鉴外观和收藏，不复制九大古宝本体",
    duplicateConvert: "重复图鉴转化为收藏材料",
    blessingPercent: 0,
    unlockHint: "拥有任意九大古宝后解锁",
    publicSummary: "古宝图鉴的第一枚拓印，只证明你曾见过它。",
    unlock: {
      ancientTreasureId: "any",
    },
  },
];
