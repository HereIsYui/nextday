export const storyConfigVersion = "story_p2_1_v1";
export const storyRulesetVersion = "ruleset_p2_1_v1";
export const storyCollectionConfigVersion = "collection_p2_1_v1";

export interface StoryFragmentConfig {
  fragmentId: string;
  title: string;
  body: string;
  fragmentType: "opening" | "choice" | "battle_ref" | "ending";
  unlockHint: string;
}

export interface StoryScrollConfig {
  scrollId: string;
  title: string;
  subtitle: string;
  chapterId: number;
  unlockCondition: string;
  sourceTypes: string[];
  battleTypes: string[];
  fragments: StoryFragmentConfig[];
  fallbackText: string;
}

export const storyScrollConfigs: StoryScrollConfig[] = [
  {
    scrollId: "story_scroll_ch01_xuantie_first_seal",
    title: "玄铁初鸣",
    subtitle: "初入冀州，第一次听见塔下裂隙的回声。",
    chapterId: 1,
    unlockCondition: "创建角色并进入冀州",
    sourceTypes: ["explore", "tower", "journal"],
    battleTypes: ["explore"],
    fallbackText: "卷轴残页尚未归档，暂以修行摘要代替。",
    fragments: [
      {
        fragmentId: "ch01_opening",
        title: "入州",
        body: "你在冀州边驿醒来，风里有铁锈味。远处玄铁塔静默如山，塔影压着裂隙，像一枚未合的伤口。",
        fragmentType: "opening",
        unlockHint: "进入冀州后解锁",
      },
      {
        fragmentId: "ch01_first_explore",
        title: "草径",
        body: "第一次探索留下了脚印、药草与战斗痕迹。战报不只记录输赢，也记录你为何能继续往前走。",
        fragmentType: "battle_ref",
        unlockHint: "完成一次探索后引用最近战报",
      },
      {
        fragmentId: "ch01_first_choice",
        title: "奇遇",
        body: "路边的选择并不宏大，却会改变今日的修行节奏。你开始学会在收益之外辨认因果。",
        fragmentType: "choice",
        unlockHint: "处理探索奇遇后解锁",
      },
      {
        fragmentId: "ch01_ending",
        title: "塔前",
        body: "当玄铁塔的赤芒被镇下一线，冀州的夜色终于有了可以喘息的缝隙。",
        fragmentType: "ending",
        unlockHint: "完成玄铁塔行动后解锁",
      },
    ],
  },
  {
    scrollId: "story_scroll_ch02_cave_and_furnace",
    title: "炉烟与洞府",
    subtitle: "丹炉起火，洞府有了第一缕属于你的烟。",
    chapterId: 1,
    unlockCondition: "完成炼丹、炼器或洞府收取",
    sourceTypes: ["alchemy", "forge", "cave", "journal"],
    battleTypes: [],
    fallbackText: "洞府账册尚未写满，暂以生产记录摘要代替。",
    fragments: [
      {
        fragmentId: "ch02_opening",
        title: "炉火",
        body: "丹炉并不总给人想要的结果，但每一次成丹或返还，都让材料的脾性更清楚一些。",
        fragmentType: "opening",
        unlockHint: "读取生产记录后解锁",
      },
      {
        fragmentId: "ch02_craft",
        title: "器胚",
        body: "法宝未必惊天动地，第一件合手的器物已经足够让下一场战斗多一分把握。",
        fragmentType: "choice",
        unlockHint: "炼器或装备后解锁",
      },
      {
        fragmentId: "ch02_ending",
        title: "归处",
        body: "洞府并非退路，而是你每次回身整理所得、再出门时的起点。",
        fragmentType: "ending",
        unlockHint: "洞府收取后解锁",
      },
    ],
  },
  {
    scrollId: "story_scroll_ch03_era_shadow",
    title: "纪元微光",
    subtitle: "个人战报终将汇入本服史册，成为下一纪元可回看的注脚。",
    chapterId: 2,
    unlockCondition: "章节 2 后解锁",
    sourceTypes: ["rank", "event", "tower", "faction"],
    battleTypes: ["boss", "pvp", "tower"],
    fallbackText: "本纪元仍在书写，史官先留下空白。",
    fragments: [
      {
        fragmentId: "ch03_opening",
        title: "史官",
        body: "当排行榜、宗门和九塔的记录被整理入册，个人的一日修行才有了时代的轮廓。",
        fragmentType: "opening",
        unlockHint: "章节 2 后解锁",
      },
      {
        fragmentId: "ch03_conflict",
        title: "争衡",
        body: "Boss、PVP 与九塔战报会被压缩成关键句，留下胜负原因，而不是让数字淹没故事。",
        fragmentType: "battle_ref",
        unlockHint: "产生多人战报后引用",
      },
      {
        fragmentId: "ch03_ending",
        title: "留名",
        body: "纪元史册只保存可公开的荣誉与节点，敏感审计仍留在后台，不进入玩家卷轴。",
        fragmentType: "ending",
        unlockHint: "生成纪元史册后解锁",
      },
    ],
  },
];

export const sensitiveStoryTerms = ["订单", "IP", "UA", "风控", "GM", "审计", "后台"];
