/**
 * The phone's charts.
 *
 * The owner, 2026-10-02: every money screen was "khali text ar number", on
 * the console and here. These are the console's charts (`apps/web/src/
 * components/charts.tsx`) drawn with views rather than SVG: an SVG library
 * is native code, and native code means a new install for every phone; this
 * arrives with the next update.
 *
 * The meanings are shared — `color.chart`, from `@rh/shared` — so green is
 * paid and amber is still to pay on both. Each chart can be read without
 * touching it, and a tap on a column says that column's figures in words.
 */
import { useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { compactNumber, niceMax, percentOf } from "@rh/shared";
import { Text } from "./text";
import { color, radius, space } from "./tokens";

export interface Series {
  key: string;
  label: string;
  color: string;
}

export interface Datum {
  label: string;
  /** longer, for when the column is chosen — "September 2026" under "Sep" */
  title?: string;
  values: Record<string, number>;
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((i) => (
        <View key={i.label} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: i.color }]} />
          <Text step="caption" tone="body" numberOfLines={1}>
            {i.value ? `${i.label} ${i.value}` : i.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Columns, stacked, one per period. A tap chooses one and its figures are
 * read out above the chart; `active` is the one chosen to begin with.
 */
export function Columns({
  data,
  series,
  height = 160,
  format = compactNumber,
  formatFull = format,
  active,
  onPick,
  marker,
}: {
  data: Datum[];
  series: Series[];
  height?: number;
  format?: (n: number) => string;
  formatFull?: (n: number) => string;
  active?: number;
  onPick?: (index: number) => void;
  marker?: { key: string; label: string; color: string };
}) {
  const [chosen, setChosen] = useState<number | undefined>(active);
  const totals = data.map((d) => series.reduce((s, x) => s + Math.max(0, d.values[x.key] ?? 0), 0));
  const top = niceMax(
    Math.max(0, ...totals, ...(marker ? data.map((d) => d.values[marker.key] ?? 0) : [])),
  );
  const pick = chosen ?? active;
  const d = pick !== undefined ? data[pick] : undefined;

  return (
    <View style={styles.gap}>
      {d ? (
        <View style={styles.readout} accessibilityLiveRegion="polite">
          <Text step="small" weight="bold" tone="title" numberOfLines={1}>
            {d.title ?? d.label}
          </Text>
          <View style={styles.readoutRows}>
            {[...series, ...(marker ? [marker] : [])].map((s) => (
              <View key={s.key} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: s.color }]} />
                <Text step="caption" tone="body" tabular numberOfLines={1}>
                  {`${s.label} ${formatFull(d.values[s.key] ?? 0)}`}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View style={[styles.columns, { height: height + 20 }]}>
        <View style={[styles.axis, { height }]}>
          <Text step="caption" tone="muted" tabular numberOfLines={1}>
            {format(top)}
          </Text>
          <Text step="caption" tone="muted" tabular numberOfLines={1}>
            {format(top / 2)}
          </Text>
          <Text step="caption" tone="muted" tabular numberOfLines={1}>
            0
          </Text>
        </View>
        <View style={styles.plot}>
          <View style={[styles.grid, { height }]} pointerEvents="none">
            <View style={styles.gridLine} />
            <View style={styles.gridLine} />
            <View style={[styles.gridLine, styles.baseLine]} />
          </View>
          {data.map((datum, i) => {
            const on = pick === i;
            const shown = series.filter((s) => (datum.values[s.key] ?? 0) > 0);
            const markAt = marker ? datum.values[marker.key] ?? 0 : 0;
            return (
              <Pressable
                key={datum.label + i}
                style={[styles.slot, on ? styles.slotOn : null]}
                accessibilityRole="button"
                accessibilityLabel={`${datum.title ?? datum.label}: ${series
                  .map((s) => `${s.label} ${formatFull(datum.values[s.key] ?? 0)}`)
                  .join(", ")}`}
                onPress={() => {
                  setChosen(i);
                  onPick?.(i);
                }}
              >
                <View style={[styles.stack, { height }]}>
                  {marker && markAt > 0 ? (
                    <View
                      style={[
                        styles.marker,
                        { bottom: (markAt / top) * height - 1, backgroundColor: marker.color },
                      ]}
                    />
                  ) : null}
                  <View style={styles.bar}>
                    {[...shown].reverse().map((s, k) => (
                      <View
                        key={s.key}
                        style={{
                          height: ((datum.values[s.key] ?? 0) / top) * height,
                          backgroundColor: s.color,
                          borderTopLeftRadius: k === 0 ? radius.sm : 0,
                          borderTopRightRadius: k === 0 ? radius.sm : 0,
                        }}
                      />
                    ))}
                  </View>
                </View>
                <Text step="caption" tone={on ? "title" : "muted"} weight={on ? "bold" : "regular"} numberOfLines={1}>
                  {datum.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** One bar split into the parts of a whole, with what each part is. */
export function SplitBar({
  parts,
  total,
  format = compactNumber,
  height = 14,
  legend = true,
}: {
  parts: { label: string; value: number; color: string }[];
  total?: number;
  format?: (n: number) => string;
  height?: number;
  legend?: boolean;
}) {
  const whole = Math.max(total ?? 0, parts.reduce((s, p) => s + Math.max(0, p.value), 0));
  return (
    <View style={styles.gap}>
      <View style={[styles.track, { height }]}>
        {whole > 0
          ? parts.map((p) =>
              p.value > 0 ? (
                <View key={p.label} style={{ flex: p.value / whole, backgroundColor: p.color }} />
              ) : null,
            )
          : null}
        {whole > 0 ? (
          <View style={{ flex: Math.max(0, 1 - parts.reduce((s, p) => s + Math.max(0, p.value), 0) / whole) }} />
        ) : null}
      </View>
      {legend ? <Legend items={parts.map((p) => ({ label: p.label, color: p.color, value: format(p.value) }))} /> : null}
    </View>
  );
}

/** Ranked bars, the biggest first, each with its figure. */
export function BarList({
  rows,
  format = compactNumber,
  barColor = color.chart.money.paid.solid,
  limit,
}: {
  rows: { label: string; value: number; sub?: string; color?: string }[];
  format?: (n: number) => string;
  barColor?: string;
  limit?: number;
}) {
  const shown = (limit ? rows.slice(0, limit) : rows).filter((r) => r.value > 0);
  const max = Math.max(1, ...shown.map((r) => r.value));
  if (shown.length === 0) {
    return (
      <Text step="small" tone="muted" numberOfLines={1}>
        Nothing to show yet.
      </Text>
    );
  }
  return (
    <View style={styles.gap}>
      {shown.map((r, i) => (
        <View key={r.label + i} style={styles.barRow} accessible accessibilityLabel={`${r.label}: ${format(r.value)}`}>
          <View style={styles.barHead}>
            <Text step="small" tone="body" numberOfLines={1} style={styles.shrink}>
              {r.label}
            </Text>
            {r.sub ? (
              <Text step="caption" tone="muted" numberOfLines={1} style={styles.flex}>
                {r.sub}
              </Text>
            ) : (
              <View style={styles.flex} />
            )}
            <Text step="small" weight="bold" tone="title" tabular numberOfLines={1}>
              {format(r.value)}
            </Text>
          </View>
          <View style={styles.thinTrack}>
            <View style={{ width: `${(r.value / max) * 100}%`, backgroundColor: r.color ?? barColor, borderRadius: radius.pill }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Shares of a whole: one bar across, and each part with its percent. */
export function Shares({
  parts,
  format = compactNumber,
}: {
  parts: { label: string; value: number; color: string }[];
  format?: (n: number) => string;
}) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  return (
    <View style={styles.gap}>
      <SplitBar parts={parts} legend={false} height={18} />
      {parts.map((p) => (
        <View key={p.label} style={styles.shareRow}>
          <View style={[styles.swatch, { backgroundColor: p.color }]} />
          <Text step="small" tone="body" numberOfLines={1} style={styles.flex}>
            {p.label}
          </Text>
          <Text step="small" weight="bold" tone="title" tabular numberOfLines={1}>
            {format(p.value)}
          </Text>
          <Text step="caption" tone="muted" tabular style={styles.percent} numberOfLines={1}>
            {`${percentOf(p.value, total)}%`}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A timeline grid: names down the side, periods across, each cell coloured
 * by what happened in it. The names stay put while the periods scroll.
 */
export function TimelineGrid<C>({
  columns,
  rows,
  cell,
  onPick,
  activeColumn,
}: {
  columns: string[];
  rows: { key: string; label: string; sub?: string; cells: C[] }[];
  cell: (c: C, row: number, col: number) => { fill: string; ink: string; text?: string; label: string; dashed?: boolean };
  onPick?: (row: number, col: number) => void;
  activeColumn?: number;
}) {
  const scroller = useRef<ScrollView>(null);
  /** opened on the chosen period, a few columns in — January is rarely the question */
  const startAt = activeColumn !== undefined ? Math.max(0, (activeColumn - 3) * (CELL + 4)) : 0;
  return (
    <View style={styles.timeline}>
      <View style={styles.names}>
        <View style={styles.headCell} />
        {rows.map((r) => (
          <View key={r.key} style={styles.nameCell}>
            <Text step="small" weight="medium" tone="title" numberOfLines={1}>
              {r.label}
            </Text>
            {r.sub ? (
              <Text step="caption" tone="muted" numberOfLines={1}>
                {r.sub}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.flex}
        onContentSizeChange={() => scroller.current?.scrollTo({ x: startAt, animated: false })}
      >
        <View>
          <View style={styles.cellsRow}>
            {columns.map((c, i) => (
              <View key={c + i} style={styles.headCell}>
                <Text step="caption" tone={activeColumn === i ? "title" : "muted"} weight={activeColumn === i ? "bold" : "regular"} numberOfLines={1}>
                  {c}
                </Text>
              </View>
            ))}
          </View>
          {rows.map((r, ri) => (
            <View key={r.key} style={styles.cellsRow}>
              {r.cells.map((c, ci) => {
                const look = cell(c, ri, ci);
                return (
                  <Pressable
                    key={ci}
                    accessibilityRole={onPick ? "button" : undefined}
                    accessibilityLabel={look.label}
                    disabled={!onPick}
                    onPress={() => onPick?.(ri, ci)}
                    style={[
                      styles.cell,
                      { backgroundColor: look.fill },
                      look.dashed ? styles.dashed : null,
                      activeColumn === ci ? styles.cellOn : null,
                    ]}
                  >
                    {look.text ? (
                      <Text step="caption" weight="bold" tabular style={{ color: look.ink }} numberOfLines={1}>
                        {look.text}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** A figure with what it is, a word under it, and a coloured edge for what it means. */
export function Kpi({
  label,
  value,
  sub,
  tint,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  tint: string;
  children?: ReactNode;
}) {
  return (
    <View style={[styles.kpi, { borderLeftColor: tint }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text step="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Text step="title" weight="bold" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: tint }}>
        {value}
      </Text>
      {sub ? (
        <Text step="caption" tone="muted" numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const CELL = 40;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  gap: { gap: space.sm },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: space.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  readout: {
    backgroundColor: color.ink[50],
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.xs,
  },
  readoutRows: { flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: 2 },
  columns: { flexDirection: "row" },
  axis: { width: 36, justifyContent: "space-between", alignItems: "flex-end", paddingRight: space.xs },
  plot: { flex: 1, flexDirection: "row" },
  grid: { position: "absolute", left: 0, right: 0, top: 0, justifyContent: "space-between" },
  gridLine: { height: 1, backgroundColor: color.ink[100] },
  baseLine: { backgroundColor: color.line },
  slot: { flex: 1, alignItems: "center", gap: 4, borderRadius: radius.sm },
  slotOn: { backgroundColor: color.ink[100] },
  stack: { width: "100%", justifyContent: "flex-end", alignItems: "center" },
  bar: { width: "62%", maxWidth: 26, overflow: "hidden" },
  marker: { position: "absolute", left: "12%", right: "12%", height: 3, borderRadius: 2, zIndex: 2 },
  track: {
    flexDirection: "row",
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: color.ink[100],
  },
  thinTrack: {
    height: 8,
    flexDirection: "row",
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: color.ink[100],
  },
  barRow: { gap: 4 },
  barHead: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  shareRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  percent: { width: 36, textAlign: "right" },
  timeline: { flexDirection: "row" },
  names: { width: 112 },
  headCell: { height: 22, width: CELL + 4, justifyContent: "center", alignItems: "center" },
  nameCell: { height: CELL + 4, justifyContent: "center", paddingRight: space.xs },
  cellsRow: { flexDirection: "row" },
  cell: {
    width: CELL,
    height: CELL,
    margin: 2,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  dashed: { borderWidth: 1, borderStyle: "dashed", borderColor: color.ink[300] },
  cellOn: { borderWidth: 2, borderColor: color.ink[900] },
  kpi: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderLeftWidth: 4,
    borderRadius: radius.md,
    padding: space.md,
    gap: 2,
  },
});
