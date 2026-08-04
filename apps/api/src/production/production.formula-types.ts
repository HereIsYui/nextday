/**
 * 生产领域的对外契约统一由共享包维护。
 *
 * 保留此模块仅用于兼容生产模块内部的既有导入路径。
 */
export type {
  DiscoveredAlchemyCraftResponse,
  DiscoveredForgeCraftResponse,
  DiscoveredPillUseResponse,
  FormulaCraftResponse,
  FormulaResultTemplate,
  PillEffectKind,
  ProductionCraftRequest,
  ProductionFormulaKind,
  ProductionFormulaListQuery,
  ProductionFormulaListResponse,
  ProductionFormulaResponse,
  ProductionFormulaState,
  ProductionFormulaVisibility,
  ProductionMaterialInput,
  SaveProductionFormulaRequest,
} from "@nextday/shared";
