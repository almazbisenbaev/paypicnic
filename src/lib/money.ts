const SCALE = 1_000_000n;

export function parseAmount(value: string): bigint {
  if (!/^(0|[1-9]\d{0,6})(\.\d{1,6})?$/.test(value)) {
    throw new Error("Enter an amount with up to 6 decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  const units = BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0"));
  if (units <= 0n || units > 1_000_000n * SCALE)
    throw new Error(
      "The amount must be between 0.000001 and 1,000,000 test USDC.",
    );
  return units;
}

export function splitAmount(
  total: bigint,
  firstPercent: number,
): [bigint, bigint] {
  if (!Number.isInteger(firstPercent) || firstPercent < 1 || firstPercent > 99)
    throw new Error("Each teammate needs a share between 1% and 99%.");
  const first = (total * BigInt(firstPercent)) / 100n;
  const second = total - first;
  if (first === 0n || second === 0n)
    throw new Error("The amount is too small to give both teammates a share.");
  return [first, second];
}

export function formatUnits(units: bigint | string): string {
  const value = BigInt(units);
  const fraction = (value % SCALE)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return `${(value / SCALE).toLocaleString("en-US")}.${fraction}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}
