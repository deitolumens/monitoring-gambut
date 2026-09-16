"use client";

import { Droplets, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMoistureColor, getMoistureLabel } from "@/lib/mock-data";
import type { SoilReading } from "@/lib/types";

interface VerticalProfileProps {
  readings: SoilReading[];
}

export function VerticalProfile({ readings }: VerticalProfileProps) {
  const sorted = [...readings].sort((a, b) => a.depth - b.depth);

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-2">
        <Layers className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold tracking-tight">Vertical Peatland Profile</h3>
      </div>

      <div className="flex gap-4">
        {/* Depth axis */}
        <div className="flex flex-col items-end justify-between py-2 text-xs font-medium text-muted-foreground">
          <span>Surface</span>
          <div className="flex flex-1 flex-col items-center justify-center gap-1 py-4">
            <div className="h-px w-3 bg-border" />
            <span>50cm</span>
            <div className="h-12 w-px bg-border" />
            <span>100cm</span>
            <div className="h-12 w-px bg-border" />
            <span>150cm</span>
            <div className="h-px w-3 bg-border" />
          </div>
          <span>Deep</span>
        </div>

        {/* Profile bars */}
        <div className="flex flex-1 flex-col gap-3">
          {sorted.map((reading) => {
            const color = getMoistureColor(reading.moisture);
            const label = getMoistureLabel(reading.moisture);
            return (
              <div
                key={reading.depth}
                className="group relative flex-1 overflow-hidden rounded-lg border border-border/60"
                style={{ minHeight: "80px" }}
              >
                {/* Background fill representing moisture level */}
                <div
                  className="absolute inset-0 transition-all duration-500"
                  style={{
                    background: `linear-gradient(to right, ${color}15, ${color}55)`,
                  }}
                />
                {/* Moisture fill bar from left */}
                <div
                  className="absolute bottom-0 left-0 h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${reading.moisture}%`,
                    backgroundColor: color,
                  }}
                />
                <div className="relative flex h-full items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full transition-colors"
                      style={{ backgroundColor: `${color}20` }}
                    >
                      <Droplets className="h-5 w-5" style={{ color }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {reading.depth} cm
                      </p>
                      <p className="text-2xl font-bold tracking-tight" style={{ color }}>
                        {reading.moisture.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className="inline-block rounded-full px-3 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: `${color}20`,
                        color,
                      }}
                    >
                      {label}
                    </span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Capacitive Sensor
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 flex items-center justify-center gap-4 border-t pt-4">
        <span className="text-xs text-muted-foreground">Moisture Scale:</span>
        <div className="flex items-center gap-2">
          <div className="flex h-2 w-32 rounded-full" style={{
            background: "linear-gradient(to right, #d4a574, #8ab061, #4a9d9e, #1e6b8a)",
          }} />
          <span className="text-xs text-muted-foreground">Dry → Saturated</span>
        </div>
      </div>
    </div>
  );
}
