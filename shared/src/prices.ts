// Yahoo Finance v8 chart API — no key, just a browser User-Agent. Endpoints verified 6/12.
// Used by the keeper (LiveAPISource) and the replay fixture builder (weeklyCloses).
const UA = { "User-Agent": "Mozilla/5.0" };
const YF = "https://query1.finance.yahoo.com/v8/finance/chart";

/** Yahoo symbol for a ticker. S&P 500 = ^GSPC, URL-encoded as %5EGSPC. */
export const yahooSymbol = (t: string) =>
  t === "SP500" || t === "^GSPC" ? "%5EGSPC" : t;

/** Latest price for one ticker. */
export async function livePrice(ticker: string): Promise<number> {
  const res = await fetch(`${YF}/${yahooSymbol(ticker)}`, { headers: UA });
  const json = await res.json();
  return json.chart.result[0].meta.regularMarketPrice as number;
}

/** Latest prices for many tickers (the batch endpoint is locked, so call sequentially). */
export async function livePrices(tickers: readonly string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tickers) out[t] = await livePrice(t);
  return out;
}

/** Weekly closes for a ticker over [period1, period2] unix seconds — builds the replay fixture. */
export async function weeklyCloses(ticker: string, period1: number, period2: number): Promise<number[]> {
  const url = `${YF}/${yahooSymbol(ticker)}?period1=${period1}&period2=${period2}&interval=1wk`;
  const res = await fetch(url, { headers: UA });
  const json = await res.json();
  return json.chart.result[0].indicators.quote[0].close as number[];
}
