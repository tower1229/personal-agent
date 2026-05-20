const documentQueryStopwords = new Set([
  "根据",
  "知识",
  "识库",
  "知识库",
  "文档",
  "资料",
  "保存",
  "什么",
  "是什"
]);

export function tokenizeRagQuery(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
  const cjkTokens = tokens.flatMap((token) => {
    const cjkChars = Array.from(token.matchAll(/\p{Script=Han}/gu)).map(
      (match) => match[0]
    );

    if (cjkChars.length < 2) {
      return [];
    }

    const grams: string[] = [];

    for (let index = 0; index < cjkChars.length - 1; index += 1) {
      grams.push(`${cjkChars[index]}${cjkChars[index + 1]}`);
    }

    return grams;
  });

  return Array.from(new Set([...tokens, ...cjkTokens])).filter(
    (token) => !documentQueryStopwords.has(token)
  );
}
