export type QuoteVerification = {
  exact: boolean;
  startOffset: number;
  endOffset: number;
};

export function verifyExactQuote(
  content: string,
  quote: string,
  baseOffset = 0,
): QuoteVerification {
  const localStart = quote.length >= 3 ? content.indexOf(quote) : -1;
  return {
    exact: localStart >= 0,
    startOffset: localStart >= 0 ? baseOffset + localStart : baseOffset,
    endOffset:
      localStart >= 0 ? baseOffset + localStart + quote.length : baseOffset,
  };
}
