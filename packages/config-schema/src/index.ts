export interface ConfigEnvelope<TConfig = unknown> {
  config_type: string;
  config_version: string;
  ruleset_version?: string;
  reward_config_version?: string;
  payload: TConfig;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateConfigEnvelope(config: Partial<ConfigEnvelope>): ConfigValidationResult {
  const errors: string[] = [];

  if (!config.config_type) {
    errors.push("缺少 config_type");
  }

  if (!config.config_version) {
    errors.push("缺少 config_version");
  }

  if (config.payload === undefined) {
    errors.push("缺少 payload");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
