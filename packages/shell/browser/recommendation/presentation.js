import { calculateBuildSpeed } from '@kancolle-assistant/recommendation-core'

const HIDDEN_RENDERER_MESSAGE_CODES = new Set([
  'EQUIPMENT_INSTANCES_UNIQUE',
  'HEURISTIC_COMBAT_SCORE',
  'KC3_COMBAT_EVALUATION_APPLIED',
])

const summarizeMessages = (messages) =>
  messages.filter((message) => !HIDDEN_RENDERER_MESSAGE_CODES.has(message.code))

const summarizeEquipment = (gear) =>
  gear
    ? {
        id: gear.id,
        name: gear.name,
        iconTypeId: gear.iconTypeId,
        improvement: gear.improvement,
        proficiency: gear.proficiency,
      }
    : null

const summarizeRecommendation = (recommendation) => ({
  title: recommendation.title,
  route: {
    id: recommendation.route.id,
    name: recommendation.route.name,
    nodes: recommendation.route.nodes,
    phase: recommendation.route.phase,
    confidence: recommendation.route.metadata.confidence,
    description: recommendation.route.description,
    sources: recommendation.route.metadata.guideSources ?? recommendation.route.metadata.source,
    lastVerified: recommendation.route.metadata.lastVerified,
  },
  ships: recommendation.ships.map((build) => ({
    role: build.role,
    ship: {
      id: build.ship.id,
      name: build.ship.name,
      level: build.ship.level,
      speed: build.ship.speed,
      finalSpeed: calculateBuildSpeed(build),
      slotSizes: build.ship.slotSizes,
    },
    equipment: build.equipment.map(summarizeEquipment),
    expansionSlot: summarizeEquipment(build.expansionSlot),
  })),
  metrics: {
    airPower: recommendation.metrics.airPower,
    airPowerRequired: recommendation.metrics.airPowerRequired,
    airPowerMinimum: recommendation.metrics.airPowerMinimum,
    los33: recommendation.metrics.los33,
    losRequired: recommendation.metrics.losRequired,
    losMinimum: recommendation.metrics.losMinimum,
    openingAswCount: recommendation.metrics.openingAswCount,
    openingAswRequired: recommendation.metrics.openingAswRequired,
    openingAswMinimum: recommendation.metrics.openingAswMinimum,
    estimatedFuelCost: recommendation.metrics.estimatedFuelCost,
    estimatedAmmoCost: recommendation.metrics.estimatedAmmoCost,
    estimatedResourceGain: recommendation.metrics.estimatedResourceGain,
    estimatedNetResourceGain: recommendation.metrics.estimatedNetResourceGain,
    resourceTarget: recommendation.metrics.resourceTarget,
    landingCraftCount: recommendation.metrics.landingCraftCount,
    drumCount: recommendation.metrics.drumCount,
    finalSpeedClass: recommendation.metrics.finalSpeedClass,
  },
  reasons: summarizeMessages(recommendation.reasons),
  warnings: summarizeMessages(recommendation.warnings),
})

export const toRecommendationRendererResult = (result) =>
  result.status === 'success'
    ? {
        ...result,
        recommendations: result.recommendations.map(summarizeRecommendation),
      }
    : result
