const ratesMinorPerMillion: Record<string, { input: number; output: number }> =
  {
    "gpt-5.6": { input: 500, output: 3_000 },
    "gpt-5.6-sol": { input: 500, output: 3_000 },
    "gpt-5.6-terra": { input: 250, output: 1_500 },
    "gpt-5.6-luna": { input: 100, output: 600 },
  };

/** Estimated standard-processing cost in USD minor units (cents). */
export function estimateOpenAiCostMinor(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = ratesMinorPerMillion[model];
  if (!rates)
    throw new Error(`No approved cost rate is configured for model ${model}.`);
  const isLongSolRequest =
    (model === "gpt-5.6" || model === "gpt-5.6-sol") && inputTokens > 272_000;
  const inputRate = rates.input * (isLongSolRequest ? 2 : 1);
  const outputRate = rates.output * (isLongSolRequest ? 1.5 : 1);
  return Math.ceil(
    (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000,
  );
}
