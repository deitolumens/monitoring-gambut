"use client";

import { ArrowDown, ArrowUp, CircleAlert, Droplets, Radio, Waves } from "lucide-react";
import { getMoistureColor } from "@/lib/mock-data";
import type { NodeId, SoilReading } from "@/lib/types";

interface SystemInsightsProps {
  readings: SoilReading[];
}

const NODE_IDS: NodeId[] = ["A", "B", "C"];
const DEPTHS = [50, 100, 150] as const;

function readingAt(readings: SoilReading[], nodeId: NodeId, depth: number) {
  return readings.find((reading) => reading.nodeId === nodeId && reading.depth === depth);
}

function formatDelta(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

export function SystemInsights({ readings }: SystemInsightsProps) {
  const available = readings.length;
  const completeNodes = NODE_IDS.filter((nodeId) =>
    DEPTHS.every((depth) => readingAt(readings, nodeId, depth))
  ).length;

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Field synthesis
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Nine-sensor picture</h2>
        </div>
        <p className="text-right text-xs text-muted-foreground">
          {available}/9 readings received · {completeNodes}/3 nodes complete
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Live sensor matrix</h3>
            </div>
            <span className="text-xs text-muted-foreground">moisture only</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[430px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 font-medium">Node</th>
                  {DEPTHS.map((depth) => (
                    <th key={depth} className="pb-3 font-medium">{depth} cm</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NODE_IDS.map((nodeId) => (
                  <tr key={nodeId} className="border-b last:border-0">
                    <th className="py-4 text-left font-semibold">{nodeId}</th>
                    {DEPTHS.map((depth) => {
                      const reading = readingAt(readings, nodeId, depth);
                      const color = reading ? getMoistureColor(reading.moisture) : "hsl(var(--muted-foreground))";
                      return (
                        <td key={depth} className="py-4">
                          {reading ? (
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                              <span className="font-semibold">{reading.moisture.toFixed(1)}%</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Waiting</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <FlowInterpretation readings={readings} />
      </div>
    </section>
  );
}

function FlowInterpretation({ readings }: { readings: SoilReading[] }) {
  const profiles = NODE_IDS.map((nodeId) => {
    const surface = readingAt(readings, nodeId, 50)?.moisture;
    const deep = readingAt(readings, nodeId, 150)?.moisture;
    const delta = surface !== undefined && deep !== undefined ? deep - surface : null;
    return { nodeId, delta };
  });
  const validProfiles = profiles.filter((profile) => profile.delta !== null);
  const meanDelta = validProfiles.length
    ? validProfiles.reduce((sum, profile) => sum + (profile.delta ?? 0), 0) / validProfiles.length
    : null;
  const threshold = 8;
  const direction = meanDelta === null
    ? "waiting"
    : meanDelta > threshold
      ? "upward"
      : meanDelta < -threshold
        ? "downward"
        : "balanced";

  const summary = {
    waiting: "Waiting for a complete depth profile",
    upward: "Deeper layer is wetter than the surface",
    downward: "Surface layer is wetter than the deeper layer",
    balanced: "Moisture is broadly balanced by depth",
  }[direction];

  return (
    <div className="rounded-lg border bg-[#eaf3ef] p-5 shadow-sm dark:bg-emerald-950/20">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Waves className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
          <h3 className="font-semibold">Hydrology read</h3>
        </div>
        <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:bg-black/20 dark:text-emerald-200">
          inferred
        </span>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/70 dark:bg-black/20">
          {direction === "upward" ? <ArrowUp className="h-8 w-8 text-emerald-700" /> : direction === "downward" ? <ArrowDown className="h-8 w-8 text-emerald-700" /> : <Droplets className="h-8 w-8 text-emerald-700" />}
        </div>
        <div>
          <p className="text-xl font-semibold">{direction === "waiting" ? "No flow signal" : direction === "balanced" ? "Low gradient" : `${direction === "upward" ? "Upward" : "Downward"} gradient`}</p>
          <p className="mt-1 text-sm text-emerald-900/70 dark:text-emerald-100/70">{summary}</p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {profiles.map(({ nodeId, delta }) => (
          <div key={nodeId} className="flex items-center justify-between border-t border-emerald-900/10 pt-3 text-sm dark:border-emerald-100/10">
            <span className="font-medium">Node {nodeId} · 50 → 150 cm</span>
            <span className="font-mono font-semibold">{delta === null ? "—" : formatDelta(delta)}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex gap-2 border-t border-emerald-900/10 pt-4 text-xs leading-relaxed text-emerald-950/70 dark:border-emerald-100/10 dark:text-emerald-50/70">
        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>This is a moisture-gradient indicator, not a direct flow-speed measurement. Confirm with rainfall, groundwater level, and soil-hydraulic data.</p>
      </div>
    </div>
  );
}