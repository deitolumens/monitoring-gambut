"use client";

import { Radio, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeStatus } from "@/lib/types";

interface StatusHeaderProps {
  node: NodeStatus;
}

export function StatusHeader({ node }: StatusHeaderProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Radio className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Monitoring Station</p>
          <h2 className="text-xl font-semibold tracking-tight">{node.label}</h2>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "relative flex h-2.5 w-2.5",
              node.mqttConnected ? "text-accent" : "text-destructive"
            )}
          >
            {node.mqttConnected && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                node.mqttConnected ? "bg-accent" : "bg-destructive"
              )}
            />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">MQTT</p>
            <p
              className={cn(
                "text-sm font-medium",
                node.mqttConnected ? "text-accent" : "text-destructive"
              )}
            >
              {node.mqttConnected ? "Connected" : "Disconnected"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Last Update</p>
            <p className="text-sm font-medium">
              {node.lastUpdate === "—"
                ? "—"
                : new Date(node.lastUpdate).toLocaleString("en-US", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
