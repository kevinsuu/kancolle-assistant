// Compatibility boundary for shell consumers; domain rules live in recommendation-core.
export {
  QUEST_RECOMMENDATION_RANKING_VERSION,
  QUEST_CHAPTER_KEYS,
  extractNormalMapIds,
  questChapterKeyFromMapIds,
  classifyQuestRewards,
  rankQuestRecommendations,
} from '@kancolle-assistant/recommendation-core'
