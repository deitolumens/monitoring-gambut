"use client";

import { useMemo, useState } from "react";
import { StatusHeader } from "./status-header";
import { NodeSelector } from "./node-selector";
import { VerticalProfile } from "./vertical-profile";
import { TrendChart } from "./trend-chart";
import { DataTable } from "./data-table";
import { ChartRange, useSoilData } from "@/hooks/use-soil-data";
import { exportToCsv, formatTimestamp, getMoistureColor } from "@/lib/mock-data";
import type { NodeId } from "@/lib/types";

export function Dashboard() {
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId>("A");
  const [chartRange, setChartRange] = useState<ChartRange>(24);

  const {
    nodes,
    currentReadings,
    timeSeriesData,
    historicalData,
    loading,
    error,
    refetch,
  } = useSoilData(selectedNodeId, chartRange);

  const node = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? nodes[0] ?? null,
    [nodes, selectedNodeId]
  );

  if (loading && nodes.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">Loading dashboard...</p>
          <p className="text-sm text-muted-foreground mt-2">
            Loading data from Supabase
          </p>
        </div>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">No node data available</p>
          <button
            onClick={refetch}
            className="mt-2 text-sm underline text-primary"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={2}>
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight sm:text-lg">
                Peatland Soil Moisture Monitor
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                IoT-based monitoring for lahan gambut — multi-depth capacitive sensing
              </p>
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-destructive text-xs">
              <span>{error}</span>
              <button onClick={refetch} className="underline">
                Retry
              </button>
            </div>
          )}
          <NodeSelector
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            onSelect={setSelectedNodeId}
          />
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <StatusHeader node={node} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <VerticalProfile readings={currentReadings} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <StatCard
              label="Average Moisture"
              value={
                currentReadings.length > 0
                  ? `${(
                      currentReadings.reduce((sum, r) => sum + r.moisture, 0) /
                      currentReadings.length
                    ).toFixed(1)}%`
                  : "—"
              }
              description="Across all depths"
              color="hsl(var(--primary))"
            />
            <StatCard
              label="Surface (50cm)"
              value={`${currentReadings.find((r) => r.depth === 50)?.moisture.toFixed(1) ?? "—"}%`}
              description="Shallow peat layer"
              color="hsl(var(--chart-1))"
            />
            <StatCard
              label="Mid (100cm)"
              value={`${currentReadings.find((r) => r.depth === 100)?.moisture.toFixed(1) ?? "—"}%`}
              description="Mid peat layer"
              color="hsl(var(--chart-2))"
            />
            <StatCard
              label="Deep (150cm)"
              value={`${currentReadings.find((r) => r.depth === 150)?.moisture.toFixed(1) ?? "—"}%`}
              description="Deep peat layer"
              color="hsl(var(--chart-3))"
            />
          </div>
        </div>

        <TrendChart
          data={timeSeriesData}
          chartRange={chartRange}
          onChartRangeChange={setChartRange}
        />

        <DataTable
          data={historicalData}
          nodeId={selectedNodeId}
          exportToCsv={exportToCsv}
          formatTimestamp={formatTimestamp}
          getMoistureColor={getMoistureColor}
        />

        <footer className="border-t pt-6 text-center text-xs text-muted-foreground">
          <p>Peatland Soil Moisture Monitoring System — Academic Thesis Project</p>
          <p className="mt-1">
            Data source: Supabase · Sensors: Capacitive (3 depths)
          </p>
        </footer>
      </main>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  description: string;
  color: string;
}

function StatCard({ label, value, description, color }: StatCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-1 flex items-center gap-2">
        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
