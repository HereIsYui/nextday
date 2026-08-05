import { createHash, randomUUID } from "node:crypto";
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
    longTermGoal: "推进宗门任务并为礼法塔提供支援",
    towerEffect: "影响宗门任务、仓库额度和礼法塔支援效率",
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
    recommendedAction: "古战场巡游",
    resources: ["战魂铁", "血晶", "战备符"],
    lowLevelEntry: "战魂采集、古阵巡查、战场残魂清理",
    longTermGoal: "积累战魂材料并推进戈阳塔净化",
    towerEffect: "影响古战场探索、战备材料和战魂事件",
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

export interface ExploreEnemyConfig {
  provinceId: string;
  enemyId: string;
  enemyName: string;
  enemyPower: number;
  skillName: string;
  flavor: string;
  traits: string[];
}

export interface ExploreLootConfig {
  itemId: string;
  name: string;
  sourceHint: string;
  usageHint: string;
}

export const exploreEnemyPools: Record<string, ExploreEnemyConfig[]> = {
  ji: createExploreEnemyPool("ji", 90, [
    ["gudiao", "蛊雕", 0, "裂喉啼", "北境山道盘旋的凶禽。"],
    ["shanxiao", "山魈", -8, "碎石扑", "玄铁矿坡附近出没的低阶妖影。"],
    ["tieyu_yaoqin", "铁羽妖禽", 6, "铁羽掠击", "羽翎沾着玄铁尘的妖禽。"],
    ["xuanbei_wolf", "玄背狼", -4, "群嚎", "常沿旧驿道追逐灵气。"],
    ["wuyan_lizard", "乌岩蜥", 4, "岩尾扫", "伏在黑石缝中的冷血妖蜥。"],
    ["ta_shadow", "塔影残魇", 10, "塔影压身", "玄铁塔裂缝里渗出的残念。"],
    ["lingcao_mantis", "灵草螳", -10, "镰臂斩", "守着低阶灵草的虫妖。"],
    ["bei_mist_fox", "北雾狐", 2, "雾尾惑心", "借晨雾遮身的小妖狐。"],
    ["kuangnu", "矿奴残魂", 8, "怨镐击", "旧矿坑中未散的执念。"],
    ["heishi_boar", "黑石豚", -6, "蛮撞", "拱翻灵田边石埂的山兽。"],
  ]),
  yan: createExploreEnemyPool("yan", 180, [
    ["liwen_ling", "礼纹灵", -8, "礼纹缠身", "旧礼阵中游离的纹灵。"],
    ["zhen_sha_spirit", "阵砂魄", 2, "砂阵回旋", "阵砂凝成的小型阵魄。"],
    ["zheng", "狰", 0, "五尾裂风", "兖州山林中的狞兽。"],
    ["ritual_paper_demon", "祭纸妖", -12, "纸刃翻飞", "废庙祭纸沾灵化妖。"],
    ["bronze_bell_wight", "铜钟魅", 12, "钟鸣震魄", "礼器残片汇成的魅影。"],
    ["oath_shadow", "盟誓影", 8, "誓锁", "旧盟约留下的束缚残影。"],
    ["ink_scale_serpent", "墨鳞蛇", -4, "墨毒噬", "盘在礼书残卷旁的毒蛇。"],
    ["rite_guard", "礼阵守卫", 15, "礼阵反击", "守护废弃礼阵的机关灵。"],
    ["feather_scribe", "羽笔妖", -6, "符笔点睛", "宗门旧札中生出的笔灵。"],
    ["broken_halberd_soul", "断戟魂", 6, "戟影横扫", "兵礼冲突中残留的魂影。"],
  ]),
  qing: createExploreEnemyPool("qing", 240, [
    ["xuangui", "旋龟", 0, "潮甲回震", "潮汐灵脉旁的龟妖。"],
    ["luoyu_young", "蠃鱼幼妖", -12, "水翼拍击", "浅湾里跃出的鱼妖幼体。"],
    ["haichao_serpent", "海潮蛇", 8, "潮毒缠绕", "随潮水潜入灵田的蛇妖。"],
    ["salt_mist_wraith", "盐雾魅", -6, "盐雾蚀骨", "海岱雾气中凝出的魅影。"],
    ["coral_imp", "珊瑚小妖", 4, "珊刺突袭", "附在碎珊瑚上的小妖。"],
    ["tide_shell_guard", "潮贝守卫", 14, "贝甲合击", "守着潮汐草的贝甲妖。"],
    ["blue_scale_ray", "青鳞魟", 10, "青鳞电尾", "水脉中滑行的灵魟。"],
    ["danfire_crab", "丹火蟹", 18, "丹火钳", "丹火材料旁烘出的蟹妖。"],
    ["foam_sprite", "浪沫灵", -10, "浪沫迷踪", "浪尖碎沫成形的小灵。"],
    ["mirror_tide_demon", "镜潮妖", 20, "镜潮返照", "海妖镜像中溢出的妖影。"],
  ]),
  xu: createExploreEnemyPool("xu", 300, [
    ["kui", "夔", 0, "独足震雷", "古战场雷声中现身的独足兽。"],
    ["battle_soul", "战场残魂", -10, "残刃穿心", "徘徊在旧战壕里的魂影。"],
    ["blood_crystal_hound", "血晶犬", 8, "血晶啮", "啃食血晶长大的妖犬。"],
    ["rust_armor", "锈甲傀", -4, "锈甲撞击", "残甲与怨气拼合的傀影。"],
    ["drum_wraith", "战鼓魅", 12, "鼓震心魄", "破鼓里留存的战意。"],
    ["spear_shadow", "枪影妖", 6, "枪影贯阵", "残枪映出的妖影。"],
    ["warhorse_ghost", "铁骑幽骸", 16, "铁蹄踏阵", "旧骑阵未散的幽骸。"],
    ["blood_moth", "血晶蛾", -8, "血粉迷目", "血晶矿旁扑飞的妖蛾。"],
    ["banner_spirit", "残旗灵", 4, "旗风乱神", "破碎战旗上附着的灵。"],
    ["guyang_phantom", "戈阳塔影", 20, "塔戈压阵", "戈阳塔裂隙投下的虚影。"],
  ]),
  yang: createExploreEnemyPool("yang", 390, [
    ["feiyi", "肥遗", 0, "双首火息", "商路外游弋的双首蛇妖。"],
    ["trade_road_bandit_spirit", "商路劫灵", -10, "劫火飞刃", "劫道怨气化成的灵。"],
    ["liuguang_moth", "琉光蛾", 6, "琉粉迷光", "琉光塔附近的幻色妖蛾。"],
    ["spiritwood_ape", "灵木猿", -6, "灵木重拳", "灵木林里蛮力惊人的猿妖。"],
    ["coin_toad", "商票蟾", 8, "铜舌卷", "吞食商票灵气的蟾妖。"],
    ["caravan_shadow", "商队影", 12, "驼铃摄魂", "失踪商队留下的影子。"],
    ["field_rat_demon", "灵田鼠妖", -14, "噬根", "偷啃灵田根脉的小妖。"],
    ["jade_lantern_wisp", "玉灯鬼火", 10, "灯焰摇魂", "夜市玉灯里蹿出的鬼火。"],
    ["river_silk_serpent", "水绸蛇", 4, "水绸缚", "河港丝绸灵气凝成的蛇妖。"],
    ["tax_seal_golem", "税印石傀", 18, "税印镇压", "旧税印与石魄合成的傀。"],
  ]),
  jing: createExploreEnemyPool("jing", 430, [
    ["bashe", "巴蛇幼影", 0, "吞林影", "泽林深处游过的巨蛇幼影。"],
    ["yaoteng", "妖藤", -8, "藤蔓绞缚", "缠住采药路的低阶妖藤。"],
    ["wood_mother_seed", "木母孢", 12, "孢雾催眠", "万木秘境外溢的孢子。"],
    ["marsh_deer_spirit", "泽鹿灵", -12, "鹿角挑灵", "受污染后惊走的泽鹿灵。"],
    ["mire_croc", "泥沼鳄", 8, "沼尾横扫", "潜伏在泽泥里的鳄妖。"],
    ["vine_mask", "藤面魅", 4, "藤面惑心", "藤叶拼成的人面魅影。"],
    ["spirit_plant_guard", "灵植守卫", 14, "灵枝反刺", "守护灵植的木灵守卫。"],
    ["green_firefly_swarm", "青萤群", -6, "萤火灼息", "成群吞吐灵火的青萤。"],
    ["root_puppet", "根须傀", 16, "根须裂地", "树根与旧骨缠成的傀影。"],
    ["wanmu_echo", "万木回声", 20, "林涛压顶", "万木塔深处传来的回声。"],
  ]),
  yu: createExploreEnemyPool("yu", 560, [
    ["kui_niu", "夔牛", 0, "雷蹄震衡", "中州阵眼旁的雷兽。"],
    ["axis_stone_spirit", "阵眼石灵", -10, "阵眼压身", "天衡石里孕出的石灵。"],
    ["balance_wraith", "天衡魅", 8, "衡尺裂魂", "失衡阵法里浮出的魅影。"],
    ["faction_banner_shadow", "阵营旗影", -6, "旗影分光", "仙魔旗帜投下的残影。"],
    ["central_plains_tiger", "中州虎妖", 12, "虎啸破阵", "盘踞中枢山口的虎妖。"],
    ["core_eye", "阵核眼", 16, "阵光灼目", "阵眼核心溢出的灵眼。"],
    ["oath_scale_demon", "誓鳞妖", 4, "誓鳞反噬", "阵营誓约染出的鳞妖。"],
    ["jade_scale_lion", "玉衡狮", 20, "玉衡咆哮", "镇守天衡旧道的狮兽。"],
    ["dust_monk", "尘相僧影", -8, "尘印", "旧中州寺观残留的法相。"],
    ["split_path_shadow", "分道路影", 18, "岔路迷魂", "仙魔分流前的心魔路影。"],
  ]),
  liang: createExploreEnemyPool("liang", 690, [
    ["qiongqi", "穷奇影", 0, "恶风裂甲", "镇岳山脉间游荡的凶影。"],
    ["mountain_copper_beast", "山铜兽", -10, "铜角撞", "吞食山铜矿渣的妖兽。"],
    ["earth_vein_worm", "地脉蠕虫", 8, "地脉翻涌", "啃噬地脉节点的虫妖。"],
    ["stone_giant", "镇岳石巨", 18, "巨掌崩岩", "镇岳塔外苏醒的石巨。"],
    ["ore_bat", "矿洞蝠", -14, "刺耳回声", "矿洞深处成群的妖蝠。"],
    ["body_trial_shadow", "炼体试影", 12, "铁骨冲撞", "炼体试炼留下的镜影。"],
    ["ridge_serpent", "山脊蛇", -4, "盘岭噬", "绕着山脊潜伏的蛇妖。"],
    ["fault_wraith", "断层魅", 16, "断层撕裂", "山体断层中吹出的魅。"],
    ["heavy_armor_golem", "重甲岩傀", 22, "岩甲碾压", "防御法宝残片聚成的傀。"],
    ["quarry_soul", "采石魂", 6, "石凿怨击", "旧采石场不散的执念。"],
  ]),
  yong: createExploreEnemyPool("yong", 820, [
    ["jiuying", "九婴残首", 0, "九息啼火", "太初裂隙中露出的残首。"],
    ["holy_relic_wraith", "圣遗魅", -10, "圣辉蚀心", "圣遗残卷旁游荡的魅。"],
    ["taichu_shadow", "太初魔影", 18, "太初暗涌", "太初塔下积聚的魔影。"],
    ["ancient_city_guard", "古都禁卫", 8, "禁卫横戈", "古都遗址中复醒的守卫。"],
    ["relic_serpent", "残卷蛇", -6, "卷鳞绞", "盘在残卷堆里的蛇妖。"],
    ["saint_mark_golem", "圣痕石傀", 16, "圣痕镇落", "圣痕与石魄结成的傀。"],
    ["final_seal_imp", "封印小魔", -14, "封印反啮", "终局封印边缘钻出的小魔。"],
    ["sunken_bell_spirit", "沉钟灵", 10, "古钟回响", "古都地底沉钟里的灵。"],
    ["white_bone_scribe", "白骨书吏", 4, "骨简飞刺", "守着古籍残页的骨影。"],
    ["ninefold_flame", "九重焰", 22, "九焰压境", "九婴残息聚成的火影。"],
  ]),
};

export function selectExploreEnemy(
  provinceId: string,
  seed: string,
  battleIndex: number,
): ExploreEnemyConfig | undefined {
  const pool = exploreEnemyPools[provinceId];
  if (!pool?.length) {
    return undefined;
  }

  const startIndex = stableIndex(`${provinceId}:${seed}`, pool.length);
  return pool[(startIndex + battleIndex) % pool.length];
}

export const exploreLootPools: Record<string, ExploreLootConfig[]> = {
  ji: [
    createExploreLoot(
      "low_herb",
      "凝露草",
      "冀州山道的灵草踪迹",
      "与洞府灵髓露搭配，可尝试炼制首炉修为丹",
    ),
    createExploreLoot("raw_iron", "玄铁砂", "玄铁塔影下的矿坡", "炼制低阶法宝"),
    createExploreLoot("pill_dust", "丹尘", "废炉残火旁的粉尘", "补足炼丹失败返还"),
    createExploreLoot("tower_sigil", "镇塔符", "玄铁塔裂隙边缘", "提交九塔镇封"),
  ],
  yan: [
    createExploreLoot("sect_token", "宗门令", "兖州礼阵残纹", "宗门建设和师门任务"),
    createExploreLoot("array_sand", "阵砂", "旧礼阵阵眼", "宗门阵法和协防"),
    createExploreLoot("tower_sigil", "镇塔符", "礼法塔外的誓纹", "提交九塔镇封"),
    createExploreLoot("pill_dust", "丹尘", "废庙丹炉余灰", "炼丹补材"),
  ],
  qing: [
    createExploreLoot("alch_moon_dew_herb", "月露草", "海岱潮汐草滩", "摸索蕴灵类丹药"),
    createExploreLoot("pill_dust", "丹尘", "丹火蟹巢旁的火粉", "炼丹补材"),
    createExploreLoot("battle_mark", "战备符", "潮生塔镜潮余波", "九塔补给与战备整理"),
    createExploreLoot("spirit_wood", "灵木", "海岱水脉旁的灵枝", "内天地和洞府培养"),
  ],
  xu: [
    createExploreLoot("forge_star_iron", "星纹铁", "古战场锈甲残片", "摸索低阶法宝"),
    createExploreLoot("battle_mark", "战备符", "旧战旗残纹", "九塔补给与战备整理"),
    createExploreLoot("artifact_soul", "器魂", "断兵残魂", "法宝淬炼和分解循环"),
    createExploreLoot("tower_sigil", "镇塔符", "戈阳塔影裂隙", "提交九塔镇封"),
  ],
  yang: [
    createExploreLoot("forge_void_silk", "空冥丝", "琉光商路的残帛", "摸索符箓类法宝"),
    createExploreLoot("spirit_wood", "灵木", "扬州灵木林", "内天地派驻和洞府培养"),
    createExploreLoot("array_sand", "阵砂", "商队旧阵盘", "宗门阵法和协防"),
    createExploreLoot("inscription_rune", "铭纹砂", "琉光塔下的铭纹残砂", "法宝铭刻"),
  ],
  jing: [
    createExploreLoot("spirit_wood", "灵木", "荆州泽林深处", "内天地派驻和洞府培养"),
    createExploreLoot("alch_sunfire_petal", "赤阳花", "万木秘境外缘", "摸索突破辅助丹药"),
    createExploreLoot("inner_seed", "洞天种子", "万木孢雾凝结处", "内天地生灵培养"),
    createExploreLoot("pill_dust", "丹尘", "灵植守卫残粉", "炼丹补材"),
  ],
  yu: [
    createExploreLoot("array_sand", "阵砂", "天衡阵眼砂痕", "宗门阵法和协防"),
    createExploreLoot("battle_mark", "战备符", "中州旗影残纹", "九塔补给与阵营事务"),
    createExploreLoot("law_dust", "法则尘", "中州阵核余辉", "内天地法则经验"),
    createExploreLoot("tower_sigil", "镇塔符", "天衡塔衡尺裂痕", "提交九塔镇封"),
  ],
  liang: [
    createExploreLoot("raw_iron", "玄铁砂", "镇岳山脉矿脉", "炼器和淬炼"),
    createExploreLoot("earth_vein_stone", "地脉石", "梁州地脉断层", "内天地支援和洞府升级"),
    createExploreLoot("artifact_soul", "器魂", "炼体试影残核", "法宝淬炼和分解循环"),
    createExploreLoot("inscription_rune", "铭纹砂", "镇岳石巨外壳", "法宝铭刻"),
  ],
  yong: [
    createExploreLoot("taichu_stone", "太初石", "太初塔裂隙", "终局封印和内天地支援"),
    createExploreLoot("law_dust", "法则尘", "圣遗残境余辉", "内天地法则经验"),
    createExploreLoot("tower_sigil", "镇塔符", "终局封印边缘", "提交九塔镇封"),
    createExploreLoot("battle_mark", "战备符", "古都禁卫遗痕", "终局九塔补给"),
  ],
};

export function selectExploreLoot(
  provinceId: string,
  seed: string,
  battleIndex: number,
  enemyId: string,
): ExploreLootConfig {
  const pool = exploreLootPools[provinceId] ?? exploreLootPools.ji;
  const index = stableIndex(`${provinceId}:${seed}:${battleIndex}:${enemyId}:loot`, pool.length);
  return pool[index] ?? pool[0];
}

export function getExploreEnemyTraits(enemyId: string): string[] {
  return findExploreEnemy(enemyId)?.traits ?? [];
}

export function getExploreLootHint(provinceId: string, itemId: string): string | null {
  const loot = getExploreLootConfig(provinceId, itemId);
  return loot ? `${loot.name}来自${loot.sourceHint}，可用于${loot.usageHint}。` : null;
}

export function getExploreLootConfig(
  provinceId: string,
  itemId: string,
): ExploreLootConfig | undefined {
  const loot = exploreLootPools[provinceId]?.find((item) => item.itemId === itemId);
  return loot;
}

export function buildExploreBattleHint(input: {
  result: "win" | "lose";
  enemyName: string;
  enemyTraits: string[];
  loot?: ExploreLootConfig;
}): string {
  const traitText = input.enemyTraits.length ? input.enemyTraits.join("、") : "普通";
  if (input.result === "lose") {
    return `${input.enemyName}偏向${traitText}，本次未能压制；可先服丹、炼器或调整技能预设后再来。`;
  }

  if (input.loot) {
    return `${input.enemyName}偏向${traitText}，已按自动策略压制；${input.loot.name}可用于${input.loot.usageHint}。`;
  }

  return `${input.enemyName}偏向${traitText}，已按自动策略压制。`;
}

function createExploreEnemyPool(
  provinceId: string,
  basePower: number,
  seeds: Array<[string, string, number, string, string]>,
): ExploreEnemyConfig[] {
  return seeds.map(([id, name, powerOffset, skillName, flavor]) => ({
    enemyId: `${provinceId}_${id}`,
    enemyName: name,
    enemyPower: Math.max(1, basePower + powerOffset),
    flavor,
    provinceId,
    skillName,
    traits: inferEnemyTraits(id, powerOffset, skillName, flavor),
  }));
}

function createExploreLoot(
  itemId: string,
  name: string,
  sourceHint: string,
  usageHint: string,
): ExploreLootConfig {
  return { itemId, name, sourceHint, usageHint };
}

function findExploreEnemy(enemyId: string): ExploreEnemyConfig | undefined {
  for (const pool of Object.values(exploreEnemyPools)) {
    const enemy = pool.find((item) => item.enemyId === enemyId);
    if (enemy) {
      return enemy;
    }
  }

  return undefined;
}

function inferEnemyTraits(
  id: string,
  powerOffset: number,
  skillName: string,
  flavor: string,
): string[] {
  const traits = new Set<string>();
  const text = `${id} ${skillName} ${flavor}`;

  if (powerOffset >= 14 || /guard|golem|armor|stone|shell|甲|守卫|石|傀|钟/.test(text)) {
    traits.add("高防");
  }
  if (powerOffset <= -8 || /fox|moth|sprite|bat|imp|影|狐|蛾|灵|魅|小妖/.test(text)) {
    traits.add("灵敏");
  }
  if (/毒|蛇|serpent|雾|孢|dust|wraith|魅/.test(text)) {
    traits.add("毒蚀");
  }
  if (/雷|电|fire|火|焰|潮|水|storm|tide/.test(text)) {
    traits.add("术法");
  }
  if (/塔|阵|seal|衡|誓|法|ritual|array/.test(text)) {
    traits.add("阵痕");
  }
  if (!traits.size) {
    traits.add(powerOffset >= 6 ? "强攻" : "均衡");
  }

  return [...traits].slice(0, 2);
}

function stableIndex(seed: string, modulo: number): number {
  return createHash("sha256").update(seed).digest().readUInt32BE(0) % modulo;
}

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
    prerequisiteHint: "探索进行中可能出现。",
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
    prerequisiteHint: "低阶州域连续探索途中小概率出现。",
    routeStepHint: "适合在第一次探索途中补修为或丹材。",
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
    prerequisiteHint: "任何普通探索途中都可能出现。",
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
