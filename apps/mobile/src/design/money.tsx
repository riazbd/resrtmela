/**
 * Money, which is never a bare number.
 *
 * The console learned the cost of that: a public endpoint that omitted the
 * currency printed "Tk" on every figure, including for a resort that does
 * not use taka. The formatting itself is `@rh/shared`'s `formatMoney` — the
 * same function the console calls, so the two clients cannot round
 * differently or disagree about where the symbol goes.
 *
 * The active resort's currency and locale arrive through a context, set once
 * when the resort is chosen. A screen passes `format` only when it is showing
 * something in a currency that is not the active resort's, which so far is
 * nothing.
 */
import { createContext, useContext } from "react";
import { formatMoney, type MoneyFormat } from "@rh/shared";
import { Text, type OwnTextProps } from "./text";

const MoneyFormatContext = createContext<MoneyFormat>({});

/** Set when the active resort changes; `AuthProvider` already reports that. */
export const MoneyFormatProvider = MoneyFormatContext.Provider;

export function useMoneyFormat(): MoneyFormat {
  return useContext(MoneyFormatContext);
}

export interface MoneyProps extends Omit<OwnTextProps, "children" | "tabular"> {
  /** `null` is nothing owed, which is a zero and not a blank. */
  amount: number | string | null | undefined;
  /** Only when this is not the active resort's money. */
  format?: MoneyFormat;
  /** Whole taka, for a figure where the paisa are noise. */
  decimals?: number;
}

export function Money({ amount, format, decimals, ...rest }: MoneyProps) {
  const active = useMoneyFormat();
  const use = format ?? active;
  return (
    // tabular always: a column of amounts whose digits are different widths
    // is a ragged edge, which is the thing a dense screen exists to avoid
    <Text tabular {...rest}>
      {formatMoney(amount, decimals === undefined ? use : { ...use, decimals })}
    </Text>
  );
}
