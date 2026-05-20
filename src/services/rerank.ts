export interface RerankCandidate {
  content: string;
  sourceTitle: string;
  headingPath?: string[];
  score: number;
  keywordScore: number;
  vectorScore: number;
  createdAt?: Date;
}

export interface RerankedChunk<TCandidate extends RerankCandidate>
  extends RerankCandidate {
  rerankScore: number;
  rerankReasons: string[];
  candidate: TCandidate;
}

function roundScore(score: number): number {
  return Math.round(score * 10_000) / 10_000;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(score, 1));
}

export function tokenizeRerankQuery(query: string): string[] {
  return tokenizeRagQuery(query);
}

function includesToken(text: string, token: string): boolean {
  return text.toLowerCase().includes(token.toLowerCase());
}

function coverageScore(text: string, tokens: string[]): number {
  if (!tokens.length) {
    return 0;
  }

  const matched = tokens.filter((token) => includesToken(text, token)).length;
  return matched / tokens.length;
}

function exactPhraseScore(query: string, content: string): number {
  const phrase = query.trim().toLowerCase();

  if (phrase.length < 3) {
    return 0;
  }

  return content.toLowerCase().includes(phrase) ? 1 : 0;
}

function recencyScore(createdAt: Date | undefined, now: Date): number {
  if (!createdAt) {
    return 0;
  }

  const ageMs = now.getTime() - createdAt.getTime();

  if (ageMs <= 0) {
    return 1;
  }

  const ageDays = ageMs / 86_400_000;
  return clampScore(1 - ageDays / 30);
}

export function rerankDocumentChunks<TCandidate extends RerankCandidate>(input: {
  query: string;
  candidates: TCandidate[];
  now?: Date;
}): Array<TCandidate & { rerankScore: number; rerankReasons: string[] }> {
  const tokens = tokenizeRerankQuery(input.query);
  const now = input.now ?? new Date();

  return input.candidates
    .map((candidate) => {
      const headingText = (candidate.headingPath ?? []).join(" ");
      const keywordCoverage = coverageScore(candidate.content, tokens);
      const titleMatch = coverageScore(candidate.sourceTitle, tokens);
      const headingMatch = coverageScore(headingText, tokens);
      const phraseMatch = exactPhraseScore(input.query, candidate.content);
      const recent = recencyScore(candidate.createdAt, now);
      const hasLexicalEvidence =
        keywordCoverage > 0 ||
        titleMatch > 0 ||
        headingMatch > 0 ||
        phraseMatch > 0;
      const baseScoreWeight = hasLexicalEvidence ? 0.55 : 0.2;
      const rerankScore = roundScore(
        clampScore(
          candidate.score * baseScoreWeight +
            phraseMatch * 0.12 +
            titleMatch * 0.12 +
            headingMatch * 0.08 +
            keywordCoverage * 0.1 +
            recent * 0.03
        )
      );
      const rerankReasons = [
        `hybridScore=${roundScore(candidate.score)}`,
        `keywordCoverage=${roundScore(keywordCoverage)}`,
        titleMatch > 0 ? `titleMatch=${roundScore(titleMatch)}` : null,
        headingMatch > 0 ? `headingPathMatch=${roundScore(headingMatch)}` : null,
        phraseMatch > 0 ? "exactPhraseMatch" : null,
        recent > 0 ? `recency=${roundScore(recent)}` : null
      ].filter((reason): reason is string => Boolean(reason));

      return {
        ...candidate,
        rerankScore,
        rerankReasons
      };
    })
    .sort((left, right) => {
      const scoreDelta = right.rerankScore - left.rerankScore;

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return right.score - left.score;
    });
}
import { tokenizeRagQuery } from "./ragText.js";
