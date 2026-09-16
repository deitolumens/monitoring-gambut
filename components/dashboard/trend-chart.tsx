"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";
import type { TimeSeriesPoint } from "@/lib/types";
import { Button } from "@/components/ui/button";
import type { ChartRange } from "@/hooks/use-soil-data";

interface TrendChartProps {
  data: TimeSeriesPoint[];
  chartRange: ChartRange;
  onChartRangeChange: (range: ChartRange) => void;
}

const CHART_COLORS = {
  depth50: "hsl(var(--chart-1))",
  depth100: "hsl(var(--chart-2))",
  depth150: "hsl(var(--chart-3))",
};

const CHART_RANGES: ChartRange[] = [1, 4, 12, 24];

export function TrendChart({ data, chartRange, onChartRangeChange }: TrendChartProps) {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold tracking-tight">Moisture Trend Analytics</h3>
        </div>
        <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-1" aria-label="Chart time range">
          {CHART_RANGES.map((range) => (
            <Button
              key={range}
              type="button"
              size="sm"
              variant={chartRange === range ? "default" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => onChartRangeChange(range)}
              aria-pressed={chartRange === range}
            >
              {range}h
            </Button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="timeLabel"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            label={{
              value: "Moisture (%)",
              angle: -90,
              position: "insideLeft",
              style: {
                fontSize: "11px",
                fill: "hsl(var(--muted-foreground))",
              },
            }}
            domain={[0, 100]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
              color: "hsl(var(--popover-foreground))",
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: "4px" }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="depth50"
            name="50 cm"
            stroke={CHART_COLORS.depth50}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="depth100"
            name="100 cm"
            stroke={CHART_COLORS.depth100}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="depth150"
            name="150 cm"
            stroke={CHART_COLORS.depth150}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
