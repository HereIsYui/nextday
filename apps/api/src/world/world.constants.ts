import type {
  TerritoryNodeStatus,
  TerritoryNodeType,
  WorldTerrainType,
  WorldTileType,
} from "@nextday/shared";
import { provinceConfigs } from "../game/game.constants";

export const worldConfigVersion = "world_city_era_r1_09_continent_8888";
export const worldSeasonId = "season_city_era_001";
export const worldSeasonName = "九州城池纪元先遣季";
export const recommendedBirthProvinceId = "ji";
export const worldTotalBlockCount = 8888;
export const towerBlockCountPerProvince = 16;

const birthProvinceIds = new Set(provinceConfigs.map((province) => province.provinceId));

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

export interface ProvinceBlockPlan {
  provinceId: string;
  blockCount: number;
  width: number;
  height: number;
  shape: ProvinceShapeProfile;
  role: string;
  terrainWeights: Record<WorldTerrainType, number>;
}

interface ProvinceShapeProfile {
  bottomTrim: number;
  leftInsetBottom: number;
  leftInsetTop: number;
  ripple: number;
  topTrim: number;
}

export const provinceBlockPlans: ProvinceBlockPlan[] = [
  {
    blockCount: 900,
    height: 30,
    provinceId: "ji",
    role: "新手、北境、城防教学",
    shape: { bottomTrim: 5, leftInsetBottom: 1, leftInsetTop: 3, ripple: 2, topTrim: 2 },
    terrainWeights: { desert: 6, forest: 18, mountain: 22, plain: 42, swamp: 12 },
    width: 30,
  },
  {
    blockCount: 648,
    height: 24,
    provinceId: "yan",
    role: "宗门、礼法、协防",
    shape: { bottomTrim: 2, leftInsetBottom: 4, leftInsetTop: 1, ripple: 2, topTrim: 5 },
    terrainWeights: { desert: 6, forest: 20, mountain: 12, plain: 48, swamp: 14 },
    width: 27,
  },
  {
    blockCount: 704,
    height: 22,
    provinceId: "qing",
    role: "潮汐、水脉、丹材",
    shape: { bottomTrim: 6, leftInsetBottom: 2, leftInsetTop: 0, ripple: 2, topTrim: 2 },
    terrainWeights: { desert: 5, forest: 20, mountain: 10, plain: 30, swamp: 35 },
    width: 32,
  },
  {
    blockCount: 760,
    height: 20,
    provinceId: "xu",
    role: "古战场、前线争夺",
    shape: { bottomTrim: 4, leftInsetBottom: 2, leftInsetTop: 2, ripple: 2, topTrim: 4 },
    terrainWeights: { desert: 20, forest: 10, mountain: 24, plain: 34, swamp: 12 },
    width: 38,
  },
  {
    blockCount: 1056,
    height: 32,
    provinceId: "yang",
    role: "商路、水网、资源流通",
    shape: { bottomTrim: 1, leftInsetBottom: 5, leftInsetTop: 0, ripple: 3, topTrim: 7 },
    terrainWeights: { desert: 5, forest: 28, mountain: 8, plain: 30, swamp: 29 },
    width: 33,
  },
  {
    blockCount: 1296,
    height: 36,
    provinceId: "jing",
    role: "泽林、灵植、秘境",
    shape: { bottomTrim: 4, leftInsetBottom: 1, leftInsetTop: 4, ripple: 3, topTrim: 3 },
    terrainWeights: { desert: 4, forest: 38, mountain: 14, plain: 20, swamp: 24 },
    width: 36,
  },
  {
    blockCount: 756,
    height: 27,
    provinceId: "yu",
    role: "九州中枢、州府密集",
    shape: { bottomTrim: 4, leftInsetBottom: 2, leftInsetTop: 2, ripple: 2, topTrim: 4 },
    terrainWeights: { desert: 6, forest: 18, mountain: 10, plain: 52, swamp: 14 },
    width: 28,
  },
  {
    blockCount: 1368,
    height: 36,
    provinceId: "liang",
    role: "山川地脉、矿脉防御",
    shape: { bottomTrim: 2, leftInsetBottom: 1, leftInsetTop: 6, ripple: 3, topTrim: 8 },
    terrainWeights: { desert: 14, forest: 14, mountain: 52, plain: 12, swamp: 8 },
    width: 38,
  },
  {
    blockCount: 1400,
    height: 35,
    provinceId: "yong",
    role: "古都圣迹、终局资源",
    shape: { bottomTrim: 8, leftInsetBottom: 4, leftInsetTop: 0, ripple: 3, topTrim: 2 },
    terrainWeights: { desert: 34, forest: 8, mountain: 34, plain: 18, swamp: 6 },
    width: 40,
  },
];

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
  terrainType: WorldTerrainType;
  terrainLabel: string;
  terrainEffects: string[];
  landmarkGroupId: string | null;
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
  purchaseBaseCost: number;
  nodes: TerritoryNodeConfig[];
}

interface ProvinceCoordinate {
  column: number;
  rowStart: number;
  rowWidth: number;
  x: number;
  y: number;
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
  blockCount: number;
  towerBlockCount: number;
  role: string;
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
    const plan = requireProvinceBlockPlan(province.provinceId);
    const birthAvailable = birthProvinceIds.has(province.provinceId);
    const commanderyNames = commanderyNameMap[province.provinceId];
    const terrains = terrainMap[province.provinceId];

    return {
      birthAvailable,
      blockCount: plan.blockCount,
      cityOccupancyRate: Math.max(0.18, 0.42 - provinceIndex * 0.025),
      commanderies: commanderyNames.map((name, commanderyIndex) => ({
        birthAvailable: birthAvailable && commanderyIndex === 0,
        commanderyId: `${province.provinceId}_commandery_${commanderyIndex + 1}`,
        congestion: commanderyIndex === 0 ? "low" : commanderyIndex === 1 ? "medium" : "high",
        name,
        provinceId: province.provinceId,
        recommendedBirth:
          province.provinceId === recommendedBirthProvinceId && commanderyIndex === 0,
        resourceTheme: province.resources,
        safetyLevel: Math.max(1, 5 - commanderyIndex - Math.floor(provinceIndex / 3)),
        terrain: terrains[commanderyIndex],
      })),
      congestion: provinceIndex < 2 ? "low" : provinceIndex < 4 ? "medium" : "high",
      dominantSectName: provinceIndex < 4 ? `${province.name}同盟` : null,
      mapFocus: `${province.name}拥有 ${plan.blockCount} 个区块，${plan.role}，九塔占据 4×4 战略区域。`,
      name: province.name,
      passControlCount: provinceIndex < 4 ? 1 : 0,
      provinceId: province.provinceId,
      recommendedBirth: province.provinceId === recommendedBirthProvinceId,
      role: plan.role,
      seasonState: "preseason",
      spiritVeinControlRate: Math.max(0.16, 0.38 - provinceIndex * 0.02),
      theme: province.theme,
      towerBlockCount: towerBlockCountPerProvince,
      towerName: province.towerName,
      towerState: provinceIndex < 2 ? "stable" : provinceIndex < 6 ? "contested" : "sealed",
      warRank: provinceIndex + 1,
      warScore: 1200 - provinceIndex * 65,
    };
  },
);

const worldProvinceCoordinates = buildWorldProvinceCoordinates();

export const worldTileConfigs: MapTileConfig[] = worldProvinceConfigs.flatMap(
  (province, provinceIndex) =>
    generateProvinceTiles(
      province,
      provinceIndex,
      worldProvinceCoordinates.get(province.provinceId) ?? [],
    ),
);

if (worldTileConfigs.length !== worldTotalBlockCount) {
  throw new Error(`九州区块总数配置错误：${worldTileConfigs.length}/${worldTotalBlockCount}`);
}

export function getTerrainLabel(terrainType: WorldTerrainType): string {
  const labels: Record<WorldTerrainType, string> = {
    desert: "沙漠",
    forest: "森林",
    mountain: "山地",
    plain: "平原",
    swamp: "沼泽",
  };
  return labels[terrainType];
}

export function getTerrainEffects(terrainType: WorldTerrainType): string[] {
  const effects: Record<WorldTerrainType, string[]> = {
    desert: ["阵砂", "火晶", "遗迹碎片", "商路风险收益"],
    forest: ["灵木", "兽材", "药草", "驻防隐蔽"],
    mountain: ["灵石矿", "矿材", "炼器材料", "城防材料"],
    plain: ["主城扩建", "建筑位", "仓储", "粮草承载"],
    swamp: ["灵草", "泽晶", "水脉材料", "行军减速"],
  };
  return effects[terrainType];
}

export function isBirthPlainTile(tile: MapTileConfig): boolean {
  return (
    tile.terrainType === "plain" &&
    tile.tileType === "wild" &&
    tile.dangerLevel <= 1 &&
    tile.ownerProvinceId === null &&
    !tile.landmarkGroupId
  );
}

export function getWorldTilesByProvince(provinceId: string): MapTileConfig[] {
  return worldTileConfigs.filter((tile) => tile.provinceId === provinceId);
}

export function findWorldTile(tileId: string): MapTileConfig | undefined {
  return worldTileConfigs.find((tile) => tile.tileId === tileId);
}

export function areAdjacentWorldTiles(left: MapTileConfig, right: MapTileConfig): boolean {
  if (left.provinceId !== right.provinceId) {
    return false;
  }

  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) === 1;
}

export function worldBlockTileId(provinceId: string, x: number, y: number): string {
  return blockTileId(provinceId, x, y);
}

function generateProvinceTiles(
  province: WorldProvinceConfig,
  provinceIndex: number,
  coordinates: ProvinceCoordinate[],
) {
  const plan = requireProvinceBlockPlan(province.provinceId);
  const birthPlainCoordinates = buildBirthPlainCoordinates(coordinates);
  const terrainLayout = buildTerrainLayout(
    province.provinceId,
    plan,
    birthPlainCoordinates,
    coordinates,
  );
  const towerOrigin = findLandmarkOrigin(coordinates, 4, 4, 0.66, 0.48);
  const capitalOrigin = findLandmarkOrigin(coordinates, 2, 2, 0.5, 0.72);
  const passCoordinate = findNearestCoordinate(coordinates, 0.08, 0.36);

  return coordinates.map(({ x, y }): MapTileConfig => {
    const commandery = province.commanderies[getCommanderyIndexForCoordinate(coordinates, x)];
    const isTower = inRect(x, y, towerOrigin.x, towerOrigin.y, 4, 4);
    const isCapital = inRect(x, y, capitalOrigin.x, capitalOrigin.y, 2, 2);
    const isPass = !isTower && !isCapital && x === passCoordinate.x && y === passCoordinate.y;
    const coordinateKey = toCoordinateKey(x, y);
    const terrainType = terrainLayout.get(coordinateKey) ?? "plain";
    const isBirthPlain = birthPlainCoordinates.has(coordinateKey);
    const strategic = buildStrategicTileConfig({
      capitalName: capitalNameMap[province.provinceId],
      commanderyId: commandery.commanderyId,
      isCapital,
      isPass,
      isTower,
      passName: passNameMap[province.provinceId],
      province,
      provinceIndex,
      terrainType,
      towerName: province.towerName,
      x,
      y,
    });

    if (strategic) {
      return strategic;
    }

    const dangerLevel = getBaseDangerLevel(provinceIndex, terrainType, x, y, plan, isBirthPlain);
    const tileId = blockTileId(province.provinceId, x, y);
    const nodeType = getResourceNodeType(terrainType);

    return {
      commanderyId: commandery.commanderyId,
      controllable: true,
      dangerLevel,
      labels: [getTerrainLabel(terrainType), isBirthPlain ? "安全出生池" : "可购买"],
      landmarkGroupId: null,
      nodes: [
        createNode({
          defenseSummary: dangerLevel <= 1 ? "仅有零散野兽，不影响新手建城。" : "有野怪镜像驻守。",
          nodeName: `${province.name}${getResourceNodeName(nodeType, terrainType)}`,
          nodeType,
          occupiable: true,
          ownerProvinceId: null,
          productionSummary: terrainProductionSummary(terrainType),
          protected: false,
          province,
          status: "idle",
          tileId,
        }),
      ],
      occupiable: true,
      ownerProvinceId: null,
      protected: false,
      provinceId: province.provinceId,
      purchaseBaseCost: getPurchaseBaseCost(terrainType, dangerLevel),
      stateSummary: isBirthPlain
        ? `${getTerrainLabel(terrainType)}安全区块，可作为随机主城出生池。`
        : `${getTerrainLabel(terrainType)}区块，${terrainProductionSummary(terrainType)}。`,
      status: "wild",
      terrainEffects: getTerrainEffects(terrainType),
      terrainLabel: getTerrainLabel(terrainType),
      terrainType,
      tileId,
      tileName: `${commandery.name}${getTerrainLabel(terrainType)} ${x + 1}-${y + 1}`,
      tileType: terrainType === "plain" ? "wild" : "resource",
      travelSeconds: getTravelSeconds(terrainType, dangerLevel, provinceIndex),
      x,
      y,
    };
  });
}

function buildStrategicTileConfig(input: {
  capitalName: string;
  commanderyId: string;
  isCapital: boolean;
  isPass: boolean;
  isTower: boolean;
  passName: string;
  province: WorldProvinceConfig;
  provinceIndex: number;
  terrainType: WorldTerrainType;
  towerName: string;
  x: number;
  y: number;
}): MapTileConfig | null {
  const tileId = blockTileId(input.province.provinceId, input.x, input.y);

  if (input.isTower) {
    const contested = input.province.towerState === "contested";
    return createStrategicTile({
      commanderyId: input.commanderyId,
      dangerLevel: 6 + Math.floor(input.provinceIndex / 2),
      labels: ["九塔奇观", "4×4", getTerrainLabel(input.terrainType)],
      landmarkGroupId: `${input.province.provinceId}_tower`,
      nodeName: input.towerName,
      nodeType: "tower",
      ownerProvinceId: contested ? null : input.province.provinceId,
      province: input.province,
      purchaseBaseCost: 0,
      stateSummary: `${input.towerName}占据 4×4 战略区块，后续影响州级增益与魔潮压力。`,
      status: contested ? "contested" : "occupied",
      terrainType: input.terrainType,
      tileId,
      tileName: `${input.towerName}塔域 ${input.x + 1}-${input.y + 1}`,
      tileType: "tower",
      travelSeconds: 520 + input.provinceIndex * 30,
      x: input.x,
      y: input.y,
    });
  }

  if (input.isCapital) {
    return createStrategicTile({
      commanderyId: input.commanderyId,
      dangerLevel: 7 + Math.floor(input.provinceIndex / 2),
      labels: ["州府", "赛季目标", getTerrainLabel(input.terrainType)],
      landmarkGroupId: `${input.province.provinceId}_capital`,
      nodeName: input.capitalName,
      nodeType: "capital",
      ownerProvinceId: input.province.provinceId,
      province: input.province,
      protected: true,
      purchaseBaseCost: 0,
      stateSummary: "州府是赛季治理核心，当前只开放地图预览，后续接入周结争夺。",
      status: "locked",
      terrainType: input.terrainType,
      tileId,
      tileName: `${input.capitalName}城区 ${input.x + 1}-${input.y + 1}`,
      tileType: "capital",
      travelSeconds: 600 + input.provinceIndex * 35,
      x: input.x,
      y: input.y,
    });
  }

  if (input.isPass) {
    const occupied = input.province.passControlCount > 0;
    return createStrategicTile({
      commanderyId: input.commanderyId,
      dangerLevel: 5 + Math.floor(input.provinceIndex / 2),
      labels: ["关隘", "州战路线", getTerrainLabel(input.terrainType)],
      landmarkGroupId: `${input.province.provinceId}_pass`,
      nodeName: input.passName,
      nodeType: "pass",
      ownerProvinceId: occupied ? input.province.provinceId : null,
      province: input.province,
      purchaseBaseCost: 0,
      stateSummary: "关隘决定行军线路和州战入口，是宗门集结的天然目标。",
      status: occupied ? "occupied" : "contested",
      terrainType: input.terrainType,
      tileId,
      tileName: `${input.passName} ${input.x + 1}-${input.y + 1}`,
      tileType: "pass",
      travelSeconds: 420 + input.provinceIndex * 30,
      x: input.x,
      y: input.y,
    });
  }

  return null;
}

function createStrategicTile(input: {
  commanderyId: string;
  dangerLevel: number;
  labels: string[];
  landmarkGroupId: string;
  nodeName: string;
  nodeType: TerritoryNodeType;
  ownerProvinceId: string | null;
  province: WorldProvinceConfig;
  protected?: boolean;
  purchaseBaseCost: number;
  stateSummary: string;
  status: MapTileConfig["status"];
  terrainType: WorldTerrainType;
  tileId: string;
  tileName: string;
  tileType: WorldTileType;
  travelSeconds: number;
  x: number;
  y: number;
}): MapTileConfig {
  return {
    commanderyId: input.commanderyId,
    controllable: true,
    dangerLevel: input.dangerLevel,
    labels: input.labels,
    landmarkGroupId: input.landmarkGroupId,
    nodes: [
      createNode({
        defenseSummary: "需要宗门或州盟组织驻防。",
        nodeName: input.nodeName,
        nodeType: input.nodeType,
        occupiable: input.tileType !== "capital",
        ownerProvinceId: input.ownerProvinceId,
        productionSummary:
          input.tileType === "tower"
            ? "控制后影响本州灵脉、魔潮和赛季叙事。"
            : "控制后影响州内治理、税收和行军效率。",
        protected: input.protected ?? false,
        province: input.province,
        status:
          input.status === "locked"
            ? "locked"
            : input.status === "contested"
              ? "contested"
              : "occupied",
        tileId: input.tileId,
      }),
    ],
    occupiable: input.tileType !== "capital",
    ownerProvinceId: input.ownerProvinceId,
    protected: input.protected ?? false,
    provinceId: input.province.provinceId,
    purchaseBaseCost: input.purchaseBaseCost,
    stateSummary: input.stateSummary,
    status: input.status,
    terrainEffects: getTerrainEffects(input.terrainType),
    terrainLabel: getTerrainLabel(input.terrainType),
    terrainType: input.terrainType,
    tileId: input.tileId,
    tileName: input.tileName,
    tileType: input.tileType,
    travelSeconds: input.travelSeconds,
    x: input.x,
    y: input.y,
  };
}

function createNode(input: {
  province: WorldProvinceConfig;
  tileId: string;
  nodeType: TerritoryNodeType;
  nodeName: string;
  status: TerritoryNodeStatus;
  occupiable: boolean;
  protected: boolean;
  productionSummary: string;
  defenseSummary: string;
  ownerProvinceId?: string | null;
}): TerritoryNodeConfig {
  return {
    contestable: !input.protected,
    defenseSummary: input.defenseSummary,
    level: getNodeLevel(input.nodeType),
    nodeId: `${input.tileId}_${input.nodeType}`,
    nodeName: input.nodeName,
    nodeType: input.nodeType,
    occupiable: input.occupiable,
    ownerProvinceId: input.ownerProvinceId ?? input.province.provinceId,
    productionSummary: input.productionSummary,
    protected: input.protected,
    status: input.status,
    tileId: input.tileId,
  };
}

function getBaseDangerLevel(
  provinceIndex: number,
  terrainType: WorldTerrainType,
  x: number,
  y: number,
  plan: ProvinceBlockPlan,
  isBirthPlain: boolean,
): number {
  if (isBirthPlain) {
    return 1;
  }

  const distanceScore = Math.floor(
    (x + y) / Math.max(4, Math.floor((plan.width + plan.height) / 8)),
  );
  const terrainRisk: Record<WorldTerrainType, number> = {
    desert: 2,
    forest: 1,
    mountain: 2,
    plain: 0,
    swamp: 2,
  };
  return Math.min(8, 2 + Math.floor(provinceIndex / 3) + distanceScore + terrainRisk[terrainType]);
}

function buildTerrainLayout(
  provinceId: string,
  plan: ProvinceBlockPlan,
  birthPlainCoordinates: Set<string>,
  coordinates: ProvinceCoordinate[],
): Map<string, WorldTerrainType> {
  const terrainTypes: WorldTerrainType[] = ["plain", "swamp", "forest", "mountain", "desert"];
  const targetCounts = allocateTerrainCounts(plan);
  const layout = new Map<string, WorldTerrainType>();
  const remaining = { ...targetCounts };

  for (const coordinate of birthPlainCoordinates) {
    layout.set(coordinate, "plain");
    remaining.plain -= 1;
  }

  const anchors = new Map(
    terrainTypes.map((terrain) => [
      terrain,
      createTerrainAnchors(provinceId, coordinates, terrain),
    ]),
  );
  const candidates = coordinates
    .filter(({ x, y }) => !birthPlainCoordinates.has(toCoordinateKey(x, y)))
    .sort((left, right) => {
      const leftHash = stableHash(`${provinceId}:order:${left.x}:${left.y}`);
      const rightHash = stableHash(`${provinceId}:order:${right.x}:${right.y}`);
      return leftHash - rightHash;
    });

  for (const coordinate of candidates) {
    const terrain = terrainTypes
      .filter((item) => remaining[item] > 0)
      .sort((left, right) => {
        const leftScore = terrainScore(
          provinceId,
          left,
          coordinate.x,
          coordinate.y,
          anchors.get(left) ?? [],
        );
        const rightScore = terrainScore(
          provinceId,
          right,
          coordinate.x,
          coordinate.y,
          anchors.get(right) ?? [],
        );
        return leftScore - rightScore;
      })[0];
    if (!terrain) {
      throw new Error(`地形配额分配失败：${provinceId}`);
    }
    layout.set(toCoordinateKey(coordinate.x, coordinate.y), terrain);
    remaining[terrain] -= 1;
  }

  return layout;
}

function allocateTerrainCounts(plan: ProvinceBlockPlan): Record<WorldTerrainType, number> {
  const terrainTypes: WorldTerrainType[] = ["plain", "swamp", "forest", "mountain", "desert"];
  const entries = terrainTypes.map((terrain) => {
    const exact = (plan.blockCount * plan.terrainWeights[terrain]) / 100;
    return { terrain, count: Math.floor(exact), remainder: exact % 1 };
  });
  let remaining = plan.blockCount - entries.reduce((total, entry) => total + entry.count, 0);
  for (const entry of [...entries].sort((left, right) => right.remainder - left.remainder)) {
    if (remaining <= 0) break;
    entry.count += 1;
    remaining -= 1;
  }
  return Object.fromEntries(entries.map((entry) => [entry.terrain, entry.count])) as Record<
    WorldTerrainType,
    number
  >;
}

function buildBirthPlainCoordinates(coordinates: ProvinceCoordinate[]): Set<string> {
  const centers: Array<[number, number]> = [
    [0.16, 0.23],
    [0.5, 0.68],
    [0.82, 0.3],
  ];
  const birthCoordinates = new Set<string>();
  for (const [ratioX, ratioY] of centers) {
    for (const coordinate of coordinates
      .slice()
      .sort(
        (left, right) =>
          coordinateDistance(left, ratioX, ratioY, coordinates) -
          coordinateDistance(right, ratioX, ratioY, coordinates),
      )
      .slice(0, 25)) {
      birthCoordinates.add(toCoordinateKey(coordinate.x, coordinate.y));
    }
  }
  return birthCoordinates;
}

function buildProvinceCoordinates(plan: ProvinceBlockPlan): ProvinceCoordinate[] {
  const widths = Array.from({ length: plan.height }, (_, y) => {
    const progress = plan.height <= 1 ? 0.5 : y / (plan.height - 1);
    const trim = Math.round(plan.shape.topTrim * (1 - progress) + plan.shape.bottomTrim * progress);
    const ripple =
      (stableHash(`${plan.provinceId}:row-width:${y}`) % (plan.shape.ripple * 2 + 1)) -
      plan.shape.ripple;
    return Math.max(8, plan.width - trim + ripple);
  });
  let balance = plan.blockCount - widths.reduce((total, width) => total + width, 0);
  const adjustmentOrder = Array.from({ length: plan.height }, (_, y) => y).sort((left, right) => {
    const leftDistance = Math.abs(left - (plan.height - 1) / 2);
    const rightDistance = Math.abs(right - (plan.height - 1) / 2);
    return leftDistance - rightDistance || left - right;
  });

  for (let index = 0; balance !== 0; index = (index + 1) % adjustmentOrder.length) {
    const rowIndex = adjustmentOrder[index] ?? 0;
    if (balance > 0) {
      widths[rowIndex] += 1;
      balance -= 1;
    } else if ((widths[rowIndex] ?? 0) > 8) {
      widths[rowIndex] -= 1;
      balance += 1;
    }
  }

  return widths.flatMap((rowWidth, y) => {
    const progress = plan.height <= 1 ? 0.5 : y / (plan.height - 1);
    const drift = (stableHash(`${plan.provinceId}:row-start:${y}`) % 3) - 1;
    const rowStart = Math.max(
      0,
      Math.round(plan.shape.leftInsetTop * (1 - progress) + plan.shape.leftInsetBottom * progress) +
        drift,
    );
    return Array.from(
      { length: rowWidth },
      (_, column): ProvinceCoordinate => ({
        column,
        rowStart,
        rowWidth,
        x: rowStart + column,
        y,
      }),
    );
  });
}

function findLandmarkOrigin(
  coordinates: ProvinceCoordinate[],
  width: number,
  height: number,
  ratioX: number,
  ratioY: number,
): { x: number; y: number } {
  const rows = groupCoordinatesByRow(coordinates);
  const bounds = coordinateBounds(coordinates);
  const preferredY = Math.round(bounds.minY + (bounds.maxY - bounds.minY - height + 1) * ratioY);
  const preferredX = Math.round(bounds.minX + (bounds.maxX - bounds.minX - width + 1) * ratioX);
  let best: { distance: number; x: number; y: number } | null = null;

  for (let y = bounds.minY; y <= bounds.maxY - height + 1; y += 1) {
    const landmarkRows = Array.from({ length: height }, (_, offset) => rows.get(y + offset));
    if (landmarkRows.some((row) => !row?.length)) {
      continue;
    }
    const left = Math.max(...landmarkRows.map((row) => row?.[0]?.x ?? 0));
    const right = Math.min(
      ...landmarkRows.map((row) => row?.[row.length - 1]?.x ?? Number.NEGATIVE_INFINITY),
    );
    if (right - left + 1 < width) {
      continue;
    }
    const x = Math.max(left, Math.min(right - width + 1, preferredX));
    const distance = Math.abs(x - preferredX) + Math.abs(y - preferredY) * 2;
    if (!best || distance < best.distance) {
      best = { distance, x, y };
    }
  }

  if (!best) {
    throw new Error(`无法找到连续 ${width}×${height} 战略区域`);
  }
  return best;
}

function groupCoordinatesByRow(
  coordinates: ProvinceCoordinate[],
): Map<number, ProvinceCoordinate[]> {
  const rows = new Map<number, ProvinceCoordinate[]>();
  for (const coordinate of coordinates) {
    rows.set(coordinate.y, [...(rows.get(coordinate.y) ?? []), coordinate]);
  }
  return rows;
}

function buildWorldProvinceCoordinates(): Map<string, ProvinceCoordinate[]> {
  const continent = buildContinentCoordinates();
  const cells = new Map(continent.map((cell) => [toCoordinateKey(cell.x, cell.y), cell]));
  const remaining = new Set(cells.keys());
  const regions = new Map(
    worldProvinceConfigs.map((province) => [province.provinceId, [] as ProvinceCoordinate[]]),
  );
  const seeds: Record<string, [number, number]> = {
    ji: [46, 18],
    jing: [43, 72],
    liang: [16, 52],
    qing: [91, 20],
    xu: [74, 42],
    yang: [79, 70],
    yan: [67, 20],
    yong: [14, 18],
    yu: [48, 44],
  };
  const frontier = new Map(
    worldProvinceConfigs.map((province) => [province.provinceId, new Set<string>()]),
  );
  for (const province of worldProvinceConfigs) {
    const [seedX, seedY] = seeds[province.provinceId] ?? [50, 45];
    const seed = continent
      .slice()
      .sort(
        (left, right) =>
          (left.x - seedX) ** 2 +
          (left.y - seedY) ** 2 -
          ((right.x - seedX) ** 2 + (right.y - seedY) ** 2),
      )[0];
    if (!seed) throw new Error(`无法放置${province.provinceId}州种子`);
    assignContinentCell(seed, province.provinceId, remaining, regions, frontier, cells);
  }
  while (remaining.size) {
    const candidate = worldProvinceConfigs
      .map((item) => ({
        keys: [...(frontier.get(item.provinceId) ?? [])].filter((key) => remaining.has(key)),
        province: item,
      }))
      .filter(
        (item) =>
          (regions.get(item.province.provinceId)?.length ?? 0) < item.province.blockCount &&
          item.keys.length > 0,
      )
      .sort(
        (left, right) =>
          (regions.get(left.province.provinceId)?.length ?? 0) / left.province.blockCount -
          (regions.get(right.province.provinceId)?.length ?? 0) / right.province.blockCount,
      )[0];
    if (!candidate) {
      const fallbackProvince = worldProvinceConfigs
        .filter((item) => (regions.get(item.provinceId)?.length ?? 0) < item.blockCount)
        .sort(
          (left, right) =>
            (regions.get(left.provinceId)?.length ?? 0) / left.blockCount -
            (regions.get(right.provinceId)?.length ?? 0) / right.blockCount,
        )[0];
      const fallbackKey = fallbackProvince
        ? [...remaining].sort(
            (left, right) =>
              continentExpansionScore(left, fallbackProvince.provinceId, seeds) -
              continentExpansionScore(right, fallbackProvince.provinceId, seeds),
          )[0]
        : undefined;
      const fallbackCell = fallbackKey ? cells.get(fallbackKey) : undefined;
      if (!fallbackProvince || !fallbackCell) throw new Error("九州大陆分区配额错误");
      assignContinentCell(
        fallbackCell,
        fallbackProvince.provinceId,
        remaining,
        regions,
        frontier,
        cells,
      );
      continue;
    }
    const key = candidate.keys.sort(
      (left, right) =>
        continentExpansionScore(left, candidate.province.provinceId, seeds) -
        continentExpansionScore(right, candidate.province.provinceId, seeds),
    )[0];
    const cell = key ? cells.get(key) : undefined;
    if (!cell) throw new Error(`缺少${candidate.province.provinceId}州可扩张区块`);
    assignContinentCell(cell, candidate.province.provinceId, remaining, regions, frontier, cells);
  }
  return regions;
}

function buildContinentCoordinates(): ProvinceCoordinate[] {
  const height = 92;
  const widths = Array.from(
    { length: height },
    (_, y) =>
      104 -
      Math.round(Math.abs(y / (height - 1) - 0.48) * 18) +
      ((stableHash(`continent:${y}`) % 5) - 2),
  );
  let balance = worldTotalBlockCount - widths.reduce((total, width) => total + width, 0);
  for (let index = 0; balance !== 0; index = (index + 1) % widths.length) {
    if (balance > 0) {
      widths[index] += 1;
      balance -= 1;
    } else if ((widths[index] ?? 0) > 70) {
      widths[index] -= 1;
      balance += 1;
    }
  }
  return widths.flatMap((rowWidth, y) => {
    const start = Math.max(
      0,
      Math.round(Math.abs(y / (height - 1) - 0.48) * 12) +
        ((stableHash(`continent-start:${y}`) % 3) - 1),
    );
    return Array.from({ length: rowWidth }, (_, column) => ({
      column,
      rowStart: start,
      rowWidth,
      x: start + column,
      y,
    }));
  });
}

function assignContinentCell(
  cell: ProvinceCoordinate,
  provinceId: string,
  remaining: Set<string>,
  regions: Map<string, ProvinceCoordinate[]>,
  frontier: Map<string, Set<string>>,
  cells: Map<string, ProvinceCoordinate>,
) {
  remaining.delete(toCoordinateKey(cell.x, cell.y));
  regions.get(provinceId)?.push(cell);
  for (const key of coordinateNeighbors(cell.x, cell.y))
    if (remaining.has(key) && cells.has(key)) frontier.get(provinceId)?.add(key);
}

function coordinateNeighbors(x: number, y: number): string[] {
  return [
    toCoordinateKey(x + 1, y),
    toCoordinateKey(x - 1, y),
    toCoordinateKey(x, y + 1),
    toCoordinateKey(x, y - 1),
  ];
}

function continentExpansionScore(
  key: string,
  provinceId: string,
  seeds: Record<string, [number, number]>,
): number {
  const [x, y] = key.split(":").map(Number);
  const [seedX, seedY] = seeds[provinceId] ?? [50, 45];
  return (x - seedX) ** 2 + (y - seedY) ** 2 + (stableHash(`${provinceId}:${key}`) % 17) / 100;
}

function coordinateBounds(coordinates: ProvinceCoordinate[]) {
  return {
    minX: Math.min(...coordinates.map((item) => item.x)),
    maxX: Math.max(...coordinates.map((item) => item.x)),
    minY: Math.min(...coordinates.map((item) => item.y)),
    maxY: Math.max(...coordinates.map((item) => item.y)),
  };
}

function coordinateDistance(
  coordinate: ProvinceCoordinate,
  ratioX: number,
  ratioY: number,
  coordinates: ProvinceCoordinate[],
): number {
  const bounds = coordinateBounds(coordinates);
  return (
    (coordinate.x - (bounds.minX + (bounds.maxX - bounds.minX) * ratioX)) ** 2 +
    (coordinate.y - (bounds.minY + (bounds.maxY - bounds.minY) * ratioY)) ** 2
  );
}

function findNearestCoordinate(
  coordinates: ProvinceCoordinate[],
  ratioX: number,
  ratioY: number,
): ProvinceCoordinate {
  return (
    coordinates
      .slice()
      .sort(
        (left, right) =>
          coordinateDistance(left, ratioX, ratioY, coordinates) -
          coordinateDistance(right, ratioX, ratioY, coordinates),
      )[0] ?? coordinates[0]!
  );
}

function getCommanderyIndexForCoordinate(coordinates: ProvinceCoordinate[], x: number): 0 | 1 | 2 {
  const bounds = coordinateBounds(coordinates);
  return getCommanderyIndex(x - bounds.minX, bounds.maxX - bounds.minX + 1);
}

function createTerrainAnchors(
  provinceId: string,
  coordinates: ProvinceCoordinate[],
  terrain: WorldTerrainType,
): Array<{ x: number; y: number }> {
  const anchorCount = Math.max(3, Math.min(6, Math.round(coordinates.length / 250)));
  const bounds = coordinateBounds(coordinates);
  const slots: Array<[number, number]> = [
    [0.12, 0.14],
    [0.46, 0.16],
    [0.8, 0.2],
    [0.22, 0.52],
    [0.62, 0.56],
    [0.14, 0.84],
    [0.48, 0.82],
    [0.82, 0.78],
  ];
  const offset = stableHash(`${provinceId}:${terrain}:anchors`) % slots.length;
  return Array.from({ length: anchorCount }, (_, index) => {
    const [ratioX, ratioY] = slots[(offset + index * 2) % slots.length] ?? [0.5, 0.5];
    return {
      x: Math.round(bounds.minX + (bounds.maxX - bounds.minX) * ratioX),
      y: Math.round(bounds.minY + (bounds.maxY - bounds.minY) * ratioY),
    };
  });
}

function terrainScore(
  provinceId: string,
  terrain: WorldTerrainType,
  x: number,
  y: number,
  anchors: Array<{ x: number; y: number }>,
): number {
  const distance = Math.min(...anchors.map((anchor) => (anchor.x - x) ** 2 + (anchor.y - y) ** 2));
  return distance * 1000 + (stableHash(`${provinceId}:${terrain}:${x}:${y}`) % 300);
}

function toCoordinateKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function getCommanderyIndex(x: number, width: number): 0 | 1 | 2 {
  const ratio = x / width;
  if (ratio < 1 / 3) {
    return 0;
  }
  if (ratio < 2 / 3) {
    return 1;
  }
  return 2;
}

function inRect(x: number, y: number, left: number, top: number, width: number, height: number) {
  return x >= left && x < left + width && y >= top && y < top + height;
}

function blockTileId(provinceId: string, x: number, y: number): string {
  return `${provinceId}_block_${x}_${y}`;
}

function getPurchaseBaseCost(terrainType: WorldTerrainType, dangerLevel: number): number {
  const terrainCost: Record<WorldTerrainType, number> = {
    desert: 180,
    forest: 160,
    mountain: 220,
    plain: 120,
    swamp: 170,
  };
  return terrainCost[terrainType] + dangerLevel * 20;
}

function getTravelSeconds(
  terrainType: WorldTerrainType,
  dangerLevel: number,
  provinceIndex: number,
): number {
  const terrainSeconds: Record<WorldTerrainType, number> = {
    desert: 150,
    forest: 130,
    mountain: 180,
    plain: 100,
    swamp: 210,
  };
  return terrainSeconds[terrainType] + dangerLevel * 20 + provinceIndex * 8;
}

function getResourceNodeType(terrainType: WorldTerrainType): TerritoryNodeType {
  switch (terrainType) {
    case "forest":
      return "forest";
    case "mountain":
      return "mine";
    case "plain":
      return "farm";
    case "swamp":
      return "farm";
    default:
      return "vein";
  }
}

function getResourceNodeName(nodeType: TerritoryNodeType, terrainType: WorldTerrainType): string {
  if (terrainType === "desert") {
    return "阵砂遗迹";
  }
  if (terrainType === "swamp") {
    return "泽灵草甸";
  }

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

function terrainProductionSummary(terrainType: WorldTerrainType): string {
  const summaries: Record<WorldTerrainType, string> = {
    desert: "产出阵砂、火晶和遗迹碎片",
    forest: "产出灵木、兽材和药草",
    mountain: "产出玄铁、青曜、赤霞、白玉、紫晶等灵石矿",
    plain: "提供主城扩建空间、粮草和建筑承载",
    swamp: "产出灵草、泽晶和水脉材料",
  };
  return summaries[terrainType];
}

function getNodeLevel(nodeType: TerritoryNodeType): number {
  if (nodeType === "tower" || nodeType === "capital") {
    return 4;
  }
  if (nodeType === "pass") {
    return 3;
  }
  return 1;
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function requireProvinceBlockPlan(provinceId: string): ProvinceBlockPlan {
  const plan = provinceBlockPlans.find((item) => item.provinceId === provinceId);
  if (!plan) {
    throw new Error(`缺少州区块规划：${provinceId}`);
  }
  if (plan.width * plan.height !== plan.blockCount) {
    throw new Error(`州区块规划尺寸错误：${provinceId}`);
  }
  return plan;
}
