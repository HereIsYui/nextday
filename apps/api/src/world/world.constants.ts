import type { TerritoryNodeStatus, TerritoryNodeType, WorldTileType } from "@nextday/shared";
import { provinceConfigs } from "../game/game.constants";

export const worldConfigVersion = "world_city_era_r1_001";
export const worldSeasonId = "season_city_era_001";
export const worldSeasonName = "九州城池纪元先遣季";
export const recommendedBirthProvinceId = "ji";

const birthProvinceIds = new Set(["ji", "yan", "qing", "xu"]);

const commanderyNameMap: Record<string, [string, string, string]> = {
  ji: ["常山郡", "北河郡", "玄铁郡"],
  yan: ["曲阜郡", "东平郡", "礼阵郡"],
  qing: ["海岱郡", "潮生郡", "临海郡"],
  xu: ["彭城郡", "戈阳郡", "古战郡"],
  yang: ["广陵郡", "琉光郡", "灵商郡"],
  jing: ["江陵郡", "万木郡", "云梦郡"],
  yu: ["洛衡郡", "天衡郡", "中枢郡"],
  liang: ["巴山郡", "镇岳郡", "地脉郡"],
  yong: ["长安郡", "太初郡", "圣遗郡"],
};

const terrainMap: Record<string, [string, string, string]> = {
  ji: ["北境平原", "旧河谷地", "玄铁山麓"],
  yan: ["礼法丘陵", "宗门田畴", "古阵台地"],
  qing: ["海岱潮岸", "潮汐滩涂", "临海礁湾"],
  xu: ["古战平原", "戈阳军镇", "残魂荒原"],
  yang: ["商路水网", "琉光市镇", "灵木河港"],
  jing: ["泽林湿地", "万木秘境", "云梦药泽"],
  yu: ["中州平畴", "天衡阵眼", "九州中枢"],
  liang: ["山川险道", "镇岳山脉", "地脉矿谷"],
  yong: ["古都平原", "太初遗迹", "圣迹残境"],
};

const passNameMap: Record<string, string> = {
  ji: "北河关",
  yan: "礼阵关",
  qing: "潮门关",
  xu: "戈阳关",
  yang: "琉光渡",
  jing: "云梦隘",
  yu: "天衡门",
  liang: "镇岳关",
  yong: "太初关",
};

const capitalNameMap: Record<string, string> = {
  ji: "冀州府",
  yan: "兖州府",
  qing: "青州府",
  xu: "徐州府",
  yang: "扬州府",
  jing: "荆州府",
  yu: "豫州府",
  liang: "梁州府",
  yong: "雍州府",
};

export interface WorldCommanderyConfig {
  commanderyId: string;
  provinceId: string;
  name: string;
  terrain: string;
  birthAvailable: boolean;
  recommendedBirth: boolean;
  congestion: "low" | "medium" | "high";
  resourceTheme: string[];
  safetyLevel: number;
}

export interface TerritoryNodeConfig {
  nodeId: string;
  tileId: string;
  nodeType: TerritoryNodeType;
  nodeName: string;
  level: number;
  status: TerritoryNodeStatus;
  occupiable: boolean;
  contestable: boolean;
  protected: boolean;
  productionSummary: string;
  defenseSummary: string;
  ownerProvinceId: string | null;
}

export interface MapTileConfig {
  tileId: string;
  provinceId: string;
  commanderyId: string;
  tileType: WorldTileType;
  tileName: string;
  x: number;
  y: number;
  status: "peace" | "wild" | "occupied" | "contested" | "protected" | "locked";
  controllable: boolean;
  occupiable: boolean;
  protected: boolean;
  dangerLevel: number;
  travelSeconds: number;
  labels: string[];
  stateSummary: string;
  ownerProvinceId: string | null;
  nodes: TerritoryNodeConfig[];
}

export interface WorldProvinceConfig {
  provinceId: string;
  name: string;
  theme: string;
  towerName: string;
  birthAvailable: boolean;
  recommendedBirth: boolean;
  congestion: "low" | "medium" | "high";
  seasonState: "preseason" | "active" | "settling";
  mapFocus: string;
  commanderies: WorldCommanderyConfig[];
  warScore: number;
  warRank: number;
  cityOccupancyRate: number;
  spiritVeinControlRate: number;
  passControlCount: number;
  towerState: "sealed" | "stable" | "contested" | "polluted";
  dominantSectName: string | null;
}

export const worldProvinceConfigs: WorldProvinceConfig[] = provinceConfigs.map(
  (province, provinceIndex) => {
    const birthAvailable = birthProvinceIds.has(province.provinceId);
    const commanderyNames = commanderyNameMap[province.provinceId];
    const terrains = terrainMap[province.provinceId];

    return {
      provinceId: province.provinceId,
      name: province.name,
      theme: province.theme,
      towerName: province.towerName,
      birthAvailable,
      recommendedBirth: province.provinceId === recommendedBirthProvinceId,
      congestion: provinceIndex < 2 ? "low" : provinceIndex < 4 ? "medium" : "high",
      seasonState: "preseason",
      mapFocus: `${province.name}以${province.resources.join("、")}为核心资源，适合作为城池扩张的第一层地图。`,
      commanderies: commanderyNames.map((name, commanderyIndex) => ({
        commanderyId: `${province.provinceId}_commandery_${commanderyIndex + 1}`,
        provinceId: province.provinceId,
        name,
        terrain: terrains[commanderyIndex],
        birthAvailable: birthAvailable && commanderyIndex === 0,
        recommendedBirth:
          province.provinceId === recommendedBirthProvinceId && commanderyIndex === 0,
        congestion: commanderyIndex === 0 ? "low" : commanderyIndex === 1 ? "medium" : "high",
        resourceTheme: province.resources,
        safetyLevel: Math.max(1, 5 - commanderyIndex - Math.floor(provinceIndex / 3)),
      })),
      warScore: 1200 - provinceIndex * 65,
      warRank: provinceIndex + 1,
      cityOccupancyRate: Math.max(0.18, 0.42 - provinceIndex * 0.025),
      spiritVeinControlRate: Math.max(0.16, 0.38 - provinceIndex * 0.02),
      passControlCount: provinceIndex < 4 ? 1 : 0,
      towerState: provinceIndex < 2 ? "stable" : provinceIndex < 6 ? "contested" : "sealed",
      dominantSectName: provinceIndex < 4 ? `${province.name}同盟` : null,
    };
  },
);

export const worldTileConfigs: MapTileConfig[] = worldProvinceConfigs.flatMap(
  (province, provinceIndex) => {
    const [birthCommandery, resourceCommandery, strategicCommandery] = province.commanderies;
    const xOffset = provinceIndex * 8;
    const resourceNodeType = getResourceNodeType(province.provinceId);

    return [
      {
        tileId: `${province.provinceId}_birth_land`,
        provinceId: province.provinceId,
        commanderyId: birthCommandery.commanderyId,
        tileType: "main_city",
        tileName: `${birthCommandery.name}新手城址`,
        x: xOffset,
        y: 0,
        status: "protected",
        controllable: false,
        occupiable: false,
        protected: true,
        dangerLevel: 1,
        travelSeconds: 0,
        labels: ["出生地", "主城保护"],
        stateSummary: province.birthAvailable
          ? "可在此建立主城，主城不会被永久夺走。"
          : "本季暂不开放出生，可作为后续争夺区观察。",
        ownerProvinceId: province.provinceId,
        nodes: [
          createNode({
            province,
            tileId: `${province.provinceId}_birth_land`,
            nodeType: "main_city",
            nodeName: `${province.name}主城基址`,
            level: 1,
            status: "protected",
            occupiable: false,
            contestable: false,
            protected: true,
            productionSummary: "提供城主府、仓库和新手恢复路径。",
            defenseSummary: "主城保护生效，不会永久易主。",
          }),
        ],
      },
      {
        tileId: `${province.provinceId}_wild_road`,
        provinceId: province.provinceId,
        commanderyId: birthCommandery.commanderyId,
        tileType: "wild",
        tileName: `${birthCommandery.name}荒野外缘`,
        x: xOffset + 1,
        y: 1,
        status: "wild",
        controllable: true,
        occupiable: true,
        protected: false,
        dangerLevel: 2 + Math.floor(provinceIndex / 3),
        travelSeconds: 120 + provinceIndex * 15,
        labels: ["清野", "低风险"],
        stateSummary: "适合第一支队伍清理妖兽，占下后形成城外缓冲地。",
        ownerProvinceId: null,
        nodes: [
          createNode({
            province,
            tileId: `${province.provinceId}_wild_road`,
            nodeType: "vein",
            nodeName: `${province.name}外缘灵脉`,
            level: 1,
            status: "idle",
            occupiable: true,
            contestable: true,
            protected: false,
            productionSummary: "提供少量灵石与州望。",
            defenseSummary: "只有野怪镜像驻守。",
            ownerProvinceId: null,
          }),
        ],
      },
      {
        tileId: `${province.provinceId}_resource_point`,
        provinceId: province.provinceId,
        commanderyId: resourceCommandery.commanderyId,
        tileType: "resource",
        tileName: `${resourceCommandery.name}${province.commanderies[0].resourceTheme[0]}产地`,
        x: xOffset + 2,
        y: 2,
        status: "occupied",
        controllable: true,
        occupiable: true,
        protected: false,
        dangerLevel: 3 + Math.floor(provinceIndex / 2),
        travelSeconds: 240 + provinceIndex * 20,
        labels: ["资源点", "可易主"],
        stateSummary: "资源点会产生持续收益，后续可被其他玩家或宗门夺取。",
        ownerProvinceId: province.provinceId,
        nodes: [
          createNode({
            province,
            tileId: `${province.provinceId}_resource_point`,
            nodeType: resourceNodeType,
            nodeName: `${province.name}${getResourceNodeName(resourceNodeType)}`,
            level: 2,
            status: "occupied",
            occupiable: true,
            contestable: true,
            protected: false,
            productionSummary: `稳定产出${province.commanderies[0].resourceTheme.slice(0, 2).join("、")}。`,
            defenseSummary: "有州内守军驻防，适合宗门协防教学。",
          }),
        ],
      },
      {
        tileId: `${province.provinceId}_border_pass`,
        provinceId: province.provinceId,
        commanderyId: strategicCommandery.commanderyId,
        tileType: "pass",
        tileName: passNameMap[province.provinceId],
        x: xOffset + 3,
        y: 1,
        status: province.passControlCount > 0 ? "occupied" : "contested",
        controllable: true,
        occupiable: true,
        protected: false,
        dangerLevel: 5 + Math.floor(provinceIndex / 2),
        travelSeconds: 420 + provinceIndex * 30,
        labels: ["关隘", "州战路线"],
        stateSummary: "关隘决定行军线路和州战入口，是宗门集结的天然目标。",
        ownerProvinceId: province.passControlCount > 0 ? province.provinceId : null,
        nodes: [
          createNode({
            province,
            tileId: `${province.provinceId}_border_pass`,
            nodeType: "pass",
            nodeName: passNameMap[province.provinceId],
            level: 3,
            status: province.passControlCount > 0 ? "occupied" : "contested",
            occupiable: true,
            contestable: true,
            protected: false,
            productionSummary: "控制后影响跨郡和跨州行军效率。",
            defenseSummary: "需要宗门或州盟组织驻防。",
            ownerProvinceId: province.passControlCount > 0 ? province.provinceId : null,
          }),
        ],
      },
      {
        tileId: `${province.provinceId}_capital`,
        provinceId: province.provinceId,
        commanderyId: strategicCommandery.commanderyId,
        tileType: "capital",
        tileName: capitalNameMap[province.provinceId],
        x: xOffset + 4,
        y: 3,
        status: "locked",
        controllable: true,
        occupiable: true,
        protected: true,
        dangerLevel: 7 + Math.floor(provinceIndex / 2),
        travelSeconds: 600 + provinceIndex * 35,
        labels: ["州府", "赛季目标"],
        stateSummary: "州府是赛季治理核心，当前只开放地图预览，后续接入周结争夺。",
        ownerProvinceId: province.provinceId,
        nodes: [
          createNode({
            province,
            tileId: `${province.provinceId}_capital`,
            nodeType: "capital",
            nodeName: capitalNameMap[province.provinceId],
            level: 4,
            status: "locked",
            occupiable: true,
            contestable: true,
            protected: true,
            productionSummary: "影响州内治理、税收和州战积分。",
            defenseSummary: "需要州盟级别集结，R1 只读展示。",
          }),
        ],
      },
      {
        tileId: `${province.provinceId}_tower_wonder`,
        provinceId: province.provinceId,
        commanderyId: strategicCommandery.commanderyId,
        tileType: "tower",
        tileName: province.towerName,
        x: xOffset + 5,
        y: 2,
        status: province.towerState === "contested" ? "contested" : "occupied",
        controllable: true,
        occupiable: true,
        protected: false,
        dangerLevel: 6 + Math.floor(provinceIndex / 2),
        travelSeconds: 520 + provinceIndex * 30,
        labels: ["九塔奇观", "州级增益"],
        stateSummary: "九塔从日课目标降级为州级奇观，控制状态会影响后续战略效果。",
        ownerProvinceId: province.towerState === "contested" ? null : province.provinceId,
        nodes: [
          createNode({
            province,
            tileId: `${province.provinceId}_tower_wonder`,
            nodeType: "tower",
            nodeName: province.towerName,
            level: 4,
            status: province.towerState === "contested" ? "contested" : "occupied",
            occupiable: true,
            contestable: true,
            protected: false,
            productionSummary: "控制后可影响本州灵脉、魔潮和赛季叙事。",
            defenseSummary: "适合宗门长期镇守。",
            ownerProvinceId: province.towerState === "contested" ? null : province.provinceId,
          }),
        ],
      },
    ];
  },
);

function createNode(input: {
  province: WorldProvinceConfig;
  tileId: string;
  nodeType: TerritoryNodeType;
  nodeName: string;
  level: number;
  status: TerritoryNodeStatus;
  occupiable: boolean;
  contestable: boolean;
  protected: boolean;
  productionSummary: string;
  defenseSummary: string;
  ownerProvinceId?: string | null;
}): TerritoryNodeConfig {
  return {
    nodeId: `${input.tileId}_${input.nodeType}`,
    tileId: input.tileId,
    nodeType: input.nodeType,
    nodeName: input.nodeName,
    level: input.level,
    status: input.status,
    occupiable: input.occupiable,
    contestable: input.contestable,
    protected: input.protected,
    productionSummary: input.productionSummary,
    defenseSummary: input.defenseSummary,
    ownerProvinceId: input.ownerProvinceId ?? input.province.provinceId,
  };
}

function getResourceNodeType(provinceId: string): TerritoryNodeType {
  if (provinceId === "ji" || provinceId === "liang") {
    return "mine";
  }

  if (provinceId === "yang") {
    return "forest";
  }

  if (provinceId === "qing" || provinceId === "jing") {
    return "farm";
  }

  return "vein";
}

function getResourceNodeName(nodeType: TerritoryNodeType): string {
  switch (nodeType) {
    case "farm":
      return "灵田";
    case "forest":
      return "灵木林";
    case "mine":
      return "矿山";
    default:
      return "灵脉泉";
  }
}
