"use client";

import { useEffect, useState } from "react";
import {
  Brush,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { RotateCcw, TrendingUp, ZoomIn, ZoomOut } from "lucide-react";
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

const CHART_RANGES: ChartRange[] = [4, 12, 24];

export function TrendChart({ data, chartRange, onChartRangeChange }: TrendChartProps) {
  const [zoom, setZoom] = useState({ startIndex: 0, endIndex: Math.max(data.length - 1, 0) });
  const maxMoisture = data.reduce((maximum, point) => {
    return Math.max(
      maximum,
      point.depth50 ?? 0,
      point.depth100 ?? 0,
      point.depth150 ?? 0
    );
  }, 0);
  const roundedMaximum = Math.ceil(maxMoisture / 10) * 10;
  const yAxisMaximum = Math.min(
    100,
    Math.max(40, roundedMaximum + (maxMoisture % 10 === 0 ? 20 : 10))
  );

  useEffect(() => {
    setZoom({ startIndex: 0, endIndex: Math.max(data.length - 1, 0) });
  }, [chartRange, data.length]);

  const visiblePointCount = zoom.endIndex - zoom.startIndex + 1;
  const canZoomIn = visiblePointCount > 2;
  const canZoomOut = zoom.startIndex > 0 || zoom.endIndex < data.length - 1;

  const handleZoomIn = () => {
    if (!canZoomIn) return;
    const nextStart = Math.ceil(zoom.startIndex + visiblePointCount * 0.25);
    const nextEnd = Math.floor(zoom.endIndex - visiblePointCount * 0.25);
    setZoom({
      startIndex: Math.min(nextStart, nextEnd),
      endIndex: Math.max(nextEnd, nextStart),
    });
  };

  const handleZoomOut = () => {
    if (!canZoomOut) return;
    const padding = Math.max(1, Math.ceil(visiblePointCount * 0.5));
    setZoom({
      startIndex: Math.max(0, zoom.startIndex - padding),
      endIndex: Math.min(data.length - 1, zoom.endIndex + padding),
    });
  };

  const resetZoom = () => {
    setZoom({ startIndex: 0, endIndex: Math.max(data.length - 1, 0) });
  };

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold tracking-tight">Moisture Trend Analytics</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
                {range} jam
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1" aria-label="Chart zoom controls">
            <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={handleZoomOut} disabled={!canZoomOut} aria-label="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={handleZoomIn} disabled={!canZoomIn} aria-label="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={resetZoom} disabled={!canZoomOut} aria-label="Reset zoom">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
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
            domain={[0, yAxisMaximum]}
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
          <Brush
            dataKey="timeLabel"
            height={24}
            stroke="hsl(var(--primary))"
            travellerWidth={10}
            startIndex={zoom.startIndex}
            endIndex={zoom.endIndex}
            onChange={(nextZoom) => {
              if (nextZoom.startIndex !== undefined && nextZoom.endIndex !== undefined) {
                setZoom({ startIndex: nextZoom.startIndex, endIndex: nextZoom.endIndex });
              }
            }}
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
