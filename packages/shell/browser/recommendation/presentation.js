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
    sources: recommendation.route.metadata.source,
    lastVerified: recommendation.route.metadata.lastVerified,
  },
  ships: recommendation.ships.map((build) => ({
    role: build.role,
    ship: {
      id: build.ship.id,
      name: build.ship.name,
      level: build.ship.level,
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
    estimatedFuelCost: recommendation.metrics.estimatedFuelCost,
    estimatedAmmoCost: recommendation.metrics.estimatedAmmoCost,
    estimatedResourceGain: recommendation.metrics.estimatedResourceGain,
    estimatedNetResourceGain: recommendation.metrics.estimatedNetResourceGain,
    resourceTarget: recommendation.metrics.resourceTarget,
    landingCraftCount: recommendation.metrics.landingCraftCount,
    drumCount: recommendation.metrics.drumCount,
  },
  score: { total: recommendation.score.total },
  reasons: recommendation.reasons,
  warnings: recommendation.warnings,
})

export const toRecommendationRendererResult = (result) =>
  result.status === 'success'
    ? {
        ...result,
        recommendations: result.recommendations.map(summarizeRecommendation),
      }
    : result
