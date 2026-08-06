import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { ConfigEnvelope } from "@nextday/shared";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { defaultConfigEnvelopes } from "./default-configs";

@Injectable()
export class GameConfigService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getConfig(configType: string): Promise<ConfigEnvelope> {
    const defaultEnvelope = defaultConfigEnvelopes[configType];

    if (!defaultEnvelope) {
      throw new BadRequestException("不支持的配置类型");
    }

    const activeConfig = await this.prisma.configVersion.findFirst({
      where: { configType, active: true },
      orderBy: { publishedAt: "desc" },
    });

    if (activeConfig && !isLegacyBuiltinConfig(configType, activeConfig.configVersion)) {
      return {
        config_type: activeConfig.configType,
        config_version: activeConfig.configVersion,
        ruleset_version: activeConfig.rulesetVersion || defaultEnvelope.ruleset_version,
        reward_config_version:
          activeConfig.rewardConfigVersion || defaultEnvelope.reward_config_version,
        payload: activeConfig.payload as ConfigEnvelope["payload"],
      };
    }

    await this.prisma.configVersion.updateMany({
      where: { configType, active: true },
      data: { active: false },
    });

    await this.prisma.configVersion.upsert({
      where: {
        configType_configVersion: {
          configType,
          configVersion: defaultEnvelope.config_version,
        },
      },
      create: {
        configId: `config_${randomUUID()}`,
        configType,
        configVersion: defaultEnvelope.config_version,
        rulesetVersion: defaultEnvelope.ruleset_version,
        rewardConfigVersion: defaultEnvelope.reward_config_version,
        payload: defaultEnvelope.payload as Prisma.InputJsonValue,
        active: true,
      },
      update: {
        active: true,
        payload: defaultEnvelope.payload as Prisma.InputJsonValue,
      },
    });

    return defaultEnvelope;
  }
}

const legacyBuiltinConfigVersions: Record<string, string[]> = {
  battle: ["battle_m2_v1"],
  bag: ["bag_m3_v1"],
  skill: ["skill_m3_v1"],
  tower: ["tower_m4_v1"],
  world: ["world_m2_v1"],
  story_presentation: ["story_p2_1_v1", "story_p2_2_v1"],
};

function isLegacyBuiltinConfig(configType: string, configVersion: string): boolean {
  return legacyBuiltinConfigVersions[configType]?.includes(configVersion) ?? false;
}
