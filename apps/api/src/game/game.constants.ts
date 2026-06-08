import { randomUUID } from "node:crypto";
import type { RewardBundle } from "@nextday/shared";
import type { Prisma } from "@prisma/client";

export const defaultEraId = "era_mvp_001";
export const maxOfflineCultivationHours = 8;
export const maxCaveCollectMinutes = 8 * 60;
export const maxExploreBatch = 5;

export const provinceExploreSeconds: Record<string, number> = {
  ji: 20,
  yan: 30,
  qing: 30,
  xu: 30,
  yang: 45,
  jing: 45,
  yu: 45,
  liang: 60,
  yong: 60,
};

export interface ProvinceConfig {
  provinceId: string;
  name: string;
  theme: string;
  towerName: string;
  chapterRequired: number;
  recommendedAction: string;
  resources: string[];
  lowLevelEntry: string;
  longTermGoal: string;
  towerEffect: string;
  enemyId: string;
  enemyName: string;
  enemyPower: number;
}

export const provinceConfigs: ProvinceConfig[] = [
  {
    provinceId: "ji",
    name: "冀州",
    theme: "新手州，北境旧地",
    towerName: "玄铁塔",
    chapterRequired: 1,
    recommendedAction: "普通探索",
    resources: ["基础灵石", "低阶灵草", "玄铁残片"],
    lowLevelEntry: "冀州巡游、玄铁塔补给、第一次魔潮教学",
    longTermGoal: "稳定新手州灵脉，降低后续魔潮压力",
    towerEffect: "影响新手州魔潮强度和基础灵脉收益",
    enemyId: "gudiao",
    enemyName: "蛊雕",
    enemyPower: 90,
  },
  {
    provinceId: "yan",
    name: "兖州",
    theme: "宗门州，礼法复兴",
    towerName: "礼法塔",
    chapterRequired: 2,
    recommendedAction: "宗门预告",
    resources: ["宗门令", "阵砂", "礼器残片"],
    lowLevelEntry: "宗门预备、礼阵巡护、阵砂捐献",
    longTermGoal: "提升宗门建设效率和宗门战准备",
    towerEffect: "影响宗门任务、仓库额度和宗门建设效率",
    enemyId: "zheng",
    enemyName: "狰",
    enemyPower: 180,
  },
  {
    provinceId: "qing",
    name: "青州",
    theme: "海岱州，潮汐灵脉",
    towerName: "潮生塔",
    chapterRequired: 3,
    recommendedAction: "海岱采药",
    resources: ["潮汐草", "海妖骨", "丹火材料"],
    lowLevelEntry: "潮汐草采集、护送丹师、海妖镜像挑战",
    longTermGoal: "控制丹火材料和潮汐 Boss 周期",
    towerEffect: "影响丹火材料、海妖事件和水脉收益",
    enemyId: "xuangui",
    enemyName: "旋龟",
    enemyPower: 240,
  },
  {
    provinceId: "xu",
    name: "徐州",
    theme: "兵争州，古战场",
    towerName: "戈阳塔",
    chapterRequired: 3,
    recommendedAction: "兵争巡守",
    resources: ["战魂铁", "血晶", "战备符"],
    lowLevelEntry: "战备运输、资源点巡守、战场残魂清理",
    longTermGoal: "提高资源点收益权和 PVP 阵线优势",
    towerEffect: "影响资源点争夺、战备材料和阵营战线",
    enemyId: "kui",
    enemyName: "夔",
    enemyPower: 300,
  },
  {
    provinceId: "yang",
    name: "扬州",
    theme: "富庶州，商路交汇",
    towerName: "琉光塔",
    chapterRequired: 4,
    recommendedAction: "商路护送",
    resources: ["灵木", "商票", "聚灵阵材"],
    lowLevelEntry: "商队护送、灵田修复、交易税议",
    longTermGoal: "维持商路繁荣，降低交易税和材料成本",
    towerEffect: "影响交易行税率、商票产出和灵田收益",
    enemyId: "feiyi",
    enemyName: "肥遗",
    enemyPower: 390,
  },
  {
    provinceId: "jing",
    name: "荆州",
    theme: "泽林州，万木秘境",
    towerName: "万木塔",
    chapterRequired: 4,
    recommendedAction: "泽林采药",
    resources: ["灵植", "妖藤", "内天地种子"],
    lowLevelEntry: "采药、净化低阶妖藤、秘境外围巡查",
    longTermGoal: "推进高阶秘境和内天地材料产出",
    towerEffect: "影响灵草、妖藤和内天地种子产出",
    enemyId: "bashe",
    enemyName: "巴蛇幼影",
    enemyPower: 430,
  },
  {
    provinceId: "yu",
    name: "豫州",
    theme: "中州，九州中枢",
    towerName: "天衡塔",
    chapterRequired: 5,
    recommendedAction: "阵眼修复",
    resources: ["天衡石", "阵眼核心", "阵营声望材料"],
    lowLevelEntry: "阵眼巡检、声望任务、阵营调停",
    longTermGoal: "控制阵营补偿和主线分支权重",
    towerEffect: "影响阵营平衡、九州中枢和主线分支",
    enemyId: "kui_niu",
    enemyName: "夔牛",
    enemyPower: 560,
  },
  {
    provinceId: "liang",
    name: "梁州",
    theme: "山川州，地脉重镇",
    towerName: "镇岳塔",
    chapterRequired: 6,
    recommendedAction: "地脉修复",
    resources: ["山铜", "地脉石", "炼体矿材"],
    lowLevelEntry: "采矿、修复地脉节点、炼体试炼",
    longTermGoal: "提升炼体材料、防御法宝和镇塔承伤收益",
    towerEffect: "影响矿材、炼体材料和防御法宝产出",
    enemyId: "qiongqi",
    enemyName: "穷奇影",
    enemyPower: 690,
  },
  {
    provinceId: "yong",
    name: "雍州",
    theme: "古都州，圣迹残境",
    towerName: "太初塔",
    chapterRequired: 6,
    recommendedAction: "圣遗守护",
    resources: ["圣遗残卷", "太初石", "终局封印材料"],
    lowLevelEntry: "圣遗残页收集、遗迹巡守、终局封印补给",
    longTermGoal: "决定终局封印材料和魔王前置形态",
    towerEffect: "影响最终魔王形态、终局材料和圣遗事件",
    enemyId: "jiuying",
    enemyName: "九婴残首",
    enemyPower: 820,
  },
];

export interface ExploreEventChoiceConfig {
  choiceId: string;
  label: string;
  description: string;
  rewardPreview: string;
  outcomeHint?: string;
  rewards: RewardBundle;
}

export interface ExploreEventConfig {
  eventType: string;
  rarity: "common" | "uncommon" | "rare";
  provinceIds?: string[];
  title: string;
  description: string;
  prerequisiteHint: string;
  routeStepHint: string;
  choices: ExploreEventChoiceConfig[];
}

export const exploreEventConfigs: ExploreEventConfig[] = [
  {
    eventType: "herb_trace",
    title: "灵草踪迹",
    description: "山风吹开薄雾，一串细小灵光沿着石缝向林中延去。",
    choices: [
      {
        choiceId: "gather",
        label: "顺势采药",
        description: "沿着灵光采下几株低阶灵草。",
        rewardPreview: "凝露草 x1",
        outcomeHint: "适合补第一炉丹的材料缺口。",
        rewards: {
          cultivation: "0",
          spirit_stone: "0",
          items: [{ bind_type: "unbound", count: 1, item_id: "low_herb", name: "凝露草" }],
        },
      },
      {
        choiceId: "observe",
        label: "静观灵脉",
        description: "不动草木，只借灵机温养气海。",
        rewardPreview: "修为 35",
        outcomeHint: "适合距离下一层只差少量修为时选择。",
        rewards: { cultivation: "35", spirit_stone: "0", items: [] },
      },
    ],
    prerequisiteHint: "完成任意州域探索后可能出现。",
    rarity: "common",
    routeStepHint: "新手主线建议优先补足炼丹材料。",
  },
  {
    eventType: "ruin_echo",
    rarity: "common",
    title: "遗迹残响",
    description: "半截古碑陷在土中，碑面纹路仍有微弱回声。",
    prerequisiteHint: "探索遗迹、古战场和塔影附近时更常见。",
    routeStepHint: "适合把探索收获转向炼器材料。",
    choices: [
      {
        choiceId: "copy",
        label: "拓印残纹",
        description: "以符纸拓下残纹，换作日后炼器参照。",
        rewardPreview: "玄铁砂 x1",
        outcomeHint: "适合准备炼制第一件法宝。",
        rewards: {
          cultivation: "0",
          spirit_stone: "0",
          items: [{ bind_type: "unbound", count: 1, item_id: "raw_iron", name: "玄铁砂" }],
        },
      },
      {
        choiceId: "meditate",
        label: "闭目参悟",
        description: "坐在碑前参悟片刻，心神略有所得。",
        rewardPreview: "修为 45",
        outcomeHint: "适合先冲层级再回头补材料。",
        rewards: { cultivation: "45", spirit_stone: "0", items: [] },
      },
    ],
  },
  {
    eventType: "wandering_caravan",
    rarity: "uncommon",
    title: "散修商队",
    description: "几名散修在岔路边整顿行囊，愿以见闻换一点脚程。",
    prerequisiteHint: "行动令探索次数越多，越容易遇到散修往来。",
    routeStepHint: "适合补灵石或炼器粗材，让生产链路继续推进。",
    choices: [
      {
        choiceId: "trade",
        label: "交换见闻",
        description: "互换沿途消息，顺手得了些零散灵石。",
        rewardPreview: "灵石 30",
        outcomeHint: "适合灵石不足、暂时炼不起丹器时选择。",
        rewards: { cultivation: "0", spirit_stone: "30", items: [] },
      },
      {
        choiceId: "escort",
        label: "护送一程",
        description: "护送商队避开兽径，商队回赠炼器粗材。",
        rewardPreview: "玄铁砂 x1",
        outcomeHint: "适合准备炼器或淬炼法宝。",
        rewards: {
          cultivation: "0",
          spirit_stone: "0",
          items: [{ bind_type: "unbound", count: 1, item_id: "raw_iron", name: "玄铁砂" }],
        },
      },
    ],
  },
  {
    eventType: "tower_rift",
    rarity: "uncommon",
    provinceIds: ["ji", "yan", "qing", "xu", "yang", "jing", "yu", "liang", "yong"],
    title: "塔裂余波",
    description: "远处塔影一震，裂隙余波卷起尘沙，又很快归于平静。",
    prerequisiteHint: "当前州域九塔有裂隙波动时更常见。",
    routeStepHint: "新手主线会引导你把余波接到玄铁塔镇封。",
    choices: [
      {
        choiceId: "stabilize",
        label: "稳住裂隙",
        description: "以自身灵力稳住余波，虽无大战却有所磨炼。",
        rewardPreview: "修为 40",
        outcomeHint: "适合先提升自身层级。",
        rewards: { cultivation: "40", spirit_stone: "0", items: [] },
      },
      {
        choiceId: "collect",
        label: "拾取碎屑",
        description: "余波散尽后，地上残留少许可用矿砂。",
        rewardPreview: "玄铁砂 x1",
        outcomeHint: "适合补炼器材料。",
        rewards: {
          cultivation: "0",
          spirit_stone: "0",
          items: [{ bind_type: "unbound", count: 1, item_id: "raw_iron", name: "玄铁砂" }],
        },
      },
    ],
  },
  {
    eventType: "sealed_spring",
    rarity: "rare",
    provinceIds: ["ji", "qing", "jing"],
    title: "封泉暗涌",
    description: "岩缝中有一眼细泉被旧符封住，泉声很轻，却牵动气海。",
    prerequisiteHint: "低阶州域连续探索后小概率出现。",
    routeStepHint: "适合在第一次探索后补修为或丹材。",
    choices: [
      {
        choiceId: "drink",
        label: "取泉温养",
        description: "取一盏清泉温养经脉，灵机缓缓入体。",
        rewardPreview: "修为 55",
        outcomeHint: "适合推进下一次升级。",
        rewards: { cultivation: "55", spirit_stone: "0", items: [] },
      },
      {
        choiceId: "water_herbs",
        label: "浇灌灵草",
        description: "把泉水引向附近草根，收起几株沾露灵草。",
        rewardPreview: "凝露草 x2",
        outcomeHint: "适合立刻准备炼丹。",
        rewards: {
          cultivation: "0",
          spirit_stone: "0",
          items: [{ bind_type: "bound", count: 2, item_id: "low_herb", name: "凝露草" }],
        },
      },
      {
        choiceId: "copy_seal",
        label: "记下封符",
        description: "记下旧符纹路，留作镇塔时的参照。",
        rewardPreview: "镇塔符 x1",
        outcomeHint: "适合准备第一次玄铁塔行动。",
        rewards: {
          cultivation: "0",
          spirit_stone: "0",
          items: [{ bind_type: "bound", count: 1, item_id: "tower_sigil", name: "镇塔符" }],
        },
      },
    ],
  },
  {
    eventType: "abandoned_furnace",
    rarity: "uncommon",
    provinceIds: ["ji", "qing", "yang"],
    title: "弃炉余温",
    description: "一只废弃小丹炉还留着余温，炉壁内有未散尽的草木气。",
    prerequisiteHint: "探索采药路线或洞府材料不足时更容易被推荐。",
    routeStepHint: "适合把探索收获衔接到第一炉丹。",
    choices: [
      {
        choiceId: "collect_dust",
        label: "收拢丹尘",
        description: "轻敲炉壁，收起还能入药的细碎丹尘。",
        rewardPreview: "丹尘 x1",
        outcomeHint: "适合炼丹失败后继续循环。",
        rewards: {
          cultivation: "0",
          spirit_stone: "0",
          items: [{ bind_type: "bound", count: 1, item_id: "pill_dust", name: "丹尘" }],
        },
      },
      {
        choiceId: "warm_fire",
        label: "借火行功",
        description: "借残火运转一周天，让气血更稳。",
        rewardPreview: "修为 35",
        outcomeHint: "适合炼丹前补一点修为。",
        rewards: { cultivation: "35", spirit_stone: "0", items: [] },
      },
      {
        choiceId: "trade_lid",
        label: "换取灵石",
        description: "炉盖虽残，仍可换得一点散碎灵石。",
        rewardPreview: "灵石 25",
        outcomeHint: "适合补丹方灵石消耗。",
        rewards: { cultivation: "0", spirit_stone: "25", items: [] },
      },
    ],
  },
  {
    eventType: "beast_tracks",
    rarity: "common",
    title: "妖踪横径",
    description: "泥地上留下新鲜妖兽足印，通往一片低矮林坡。",
    prerequisiteHint: "任何普通探索后都可能出现。",
    routeStepHint: "适合让战斗与材料收益产生选择差异。",
    choices: [
      {
        choiceId: "pursue",
        label: "循迹追击",
        description: "追到林坡边缘，惊散妖气，也磨砺了身法。",
        rewardPreview: "修为 30，灵石 15",
        outcomeHint: "适合想要均衡成长时选择。",
        rewards: { cultivation: "30", spirit_stone: "15", items: [] },
      },
      {
        choiceId: "set_trap",
        label: "设下草索",
        description: "用草索设下简陋陷阱，回收几束可用灵草。",
        rewardPreview: "凝露草 x1",
        outcomeHint: "适合补炼丹材料。",
        rewards: {
          cultivation: "0",
          spirit_stone: "0",
          items: [{ bind_type: "bound", count: 1, item_id: "low_herb", name: "凝露草" }],
        },
      },
    ],
  },
  {
    eventType: "old_blade_cache",
    rarity: "rare",
    provinceIds: ["ji", "xu", "liang"],
    title: "旧刃藏匣",
    description: "倒塌石龛里压着一只旧匣，匣中铁意未散。",
    prerequisiteHint: "探索古战场、山川矿脉或冀州塔影附近时小概率出现。",
    routeStepHint: "适合把第一段探索转向炼器目标。",
    choices: [
      {
        choiceId: "smelt",
        label: "熔取矿砂",
        description: "拆下旧刃残片，熔成可用矿砂。",
        rewardPreview: "玄铁砂 x2",
        outcomeHint: "适合直接补第一件法宝材料。",
        rewards: {
          cultivation: "0",
          spirit_stone: "0",
          items: [{ bind_type: "bound", count: 2, item_id: "raw_iron", name: "玄铁砂" }],
        },
      },
      {
        choiceId: "study_edge",
        label: "观摩刃纹",
        description: "观摩刃纹片刻，理解了一点攻防节奏。",
        rewardPreview: "修为 50",
        outcomeHint: "适合战斗失败后补基础修为。",
        rewards: { cultivation: "50", spirit_stone: "0", items: [] },
      },
      {
        choiceId: "sell_scrap",
        label: "售出残铁",
        description: "把不可用残铁换成灵石，留给炼丹或炼器。",
        rewardPreview: "灵石 35",
        outcomeHint: "适合灵石不足时选择。",
        rewards: { cultivation: "0", spirit_stone: "35", items: [] },
      },
    ],
  },
];

export interface TaskDefinition {
  taskId: string;
  taskType: "novice" | "daily" | "weekly" | "chapter";
  title: string;
  targetValue: number;
  initialProgress?: number;
  rewardSnapshot: Prisma.InputJsonValue;
  resetKey: string;
}

export function getTaskDefinitions(date = new Date()): TaskDefinition[] {
  const dailyResetKey = getDailyResetKey(date);
  const weeklyResetKey = getWeeklyResetKey(date);

  return [
    {
      taskId: "novice_create_role",
      taskType: "novice",
      title: "初入冀州",
      targetValue: 1,
      initialProgress: 1,
      rewardSnapshot: { spirit_stone: "100" },
      resetKey: "permanent",
    },
    {
      taskId: "novice_claim_cultivation",
      taskType: "novice",
      title: "静坐行功",
      targetValue: 1,
      rewardSnapshot: { spirit_stone: "80" },
      resetKey: "permanent",
    },
    {
      taskId: "novice_explore_ji",
      taskType: "novice",
      title: "巡游冀州",
      targetValue: 1,
      rewardSnapshot: { spirit_stone: "120", items: [{ item_id: "low_herb", count: 2 }] },
      resetKey: "permanent",
    },
    {
      taskId: "novice_resolve_event",
      taskType: "novice",
      title: "途中见闻",
      targetValue: 1,
      rewardSnapshot: { spirit_stone: "80", items: [{ item_id: "low_herb", count: 1 }] },
      resetKey: "permanent",
    },
    {
      taskId: "novice_craft_alchemy",
      taskType: "novice",
      title: "第一炉丹",
      targetValue: 1,
      rewardSnapshot: { spirit_stone: "80", items: [{ item_id: "pill_dust", count: 1 }] },
      resetKey: "permanent",
    },
    {
      taskId: "novice_tower_xuantie",
      taskType: "novice",
      title: "镇封玄铁塔",
      targetValue: 1,
      rewardSnapshot: { spirit_stone: "120", items: [{ item_id: "tower_sigil", count: 1 }] },
      resetKey: "permanent",
    },
    {
      taskId: "daily_explore",
      taskType: "daily",
      title: "今日历练",
      targetValue: 3,
      rewardSnapshot: { spirit_stone: "150", action_points: 5 },
      resetKey: dailyResetKey,
    },
    {
      taskId: "daily_cave_collect",
      taskType: "daily",
      title: "洞府收取",
      targetValue: 1,
      rewardSnapshot: { spirit_stone: "60" },
      resetKey: dailyResetKey,
    },
    {
      taskId: "weekly_explore_10",
      taskType: "weekly",
      title: "周行十里",
      targetValue: 10,
      rewardSnapshot: { spirit_stone: "500", action_points: 10 },
      resetKey: weeklyResetKey,
    },
    {
      taskId: "chapter_unlock_ji",
      taskType: "chapter",
      title: "塔裂冀州",
      targetValue: 1,
      initialProgress: 1,
      rewardSnapshot: { spirit_stone: "100" },
      resetKey: "permanent",
    },
    {
      taskId: "chapter_first_30_minutes",
      taskType: "chapter",
      title: "冀州初定",
      targetValue: 1,
      rewardSnapshot: {
        spirit_stone: "260",
        action_points: 3,
        items: [
          { item_id: "low_herb", count: 2 },
          { item_id: "raw_iron", count: 2 },
        ],
      },
      resetKey: "permanent",
    },
  ];
}

export function createInitialTaskRows(playerId: string): Prisma.PlayerTaskStateCreateManyInput[] {
  return getTaskDefinitions().map((definition) => {
    const progressValue = definition.initialProgress ?? 0;

    return {
      taskStateId: `task_state_${randomUUID()}`,
      playerId,
      taskId: definition.taskId,
      taskType: definition.taskType,
      title: definition.title,
      targetValue: definition.targetValue,
      progressValue,
      status: progressValue >= definition.targetValue ? "completed" : "in_progress",
      resetKey: definition.resetKey,
      rewardSnapshot: definition.rewardSnapshot,
    };
  });
}

export function getDailyResetKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getWeeklyResetKey(date = new Date()): string {
  const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayOffset = Math.floor((date.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.floor((dayOffset + firstDay.getUTCDay()) / 7) + 1;
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
