type Recommendation = {
  title: string;
  reason: string;
  estimated_price: number;
};

type RankingContext = {
  budget: number;
  interests: string[];
};

export function scoreRecommendation(
  recommendation: Recommendation,
  context: RankingContext,
): number {
  let score = 0;

  if (recommendation.estimated_price <= context.budget) {
    score += 50;
  } else {
    const overBudget = recommendation.estimated_price - context.budget;
    score -= Math.min(40, Math.floor(overBudget / 10));
  }

  const reason = recommendation.reason.toLowerCase();
  const interestMatches = context.interests.filter((interest) =>
    reason.includes(interest.toLowerCase()),
  ).length;
  score += interestMatches * 20;

  if (recommendation.title.length > 4) {
    score += 5;
  }

  return score;
}

export function rankRecommendations(
  recommendations: Recommendation[],
  context: RankingContext,
): Recommendation[] {
  return [...recommendations].sort((a, b) => {
    const scoreDiff =
      scoreRecommendation(b, context) - scoreRecommendation(a, context);
    if (scoreDiff !== 0) return scoreDiff;
    return a.estimated_price - b.estimated_price;
  });
}
