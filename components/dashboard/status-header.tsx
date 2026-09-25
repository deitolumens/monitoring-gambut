"use client";

import { Database } from "lucide-react";
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
          <Database className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Monitoring Station</p>
          <h2 className="text-xl font-semibold tracking-tight">{node.label}</h2>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "relative flex h-2.5 w-2.5",
              node.supabaseConnected ? "text-accent" : "text-destructive"
            )}
          >
            {node.supabaseConnected && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                node.supabaseConnected ? "bg-accent" : "bg-destructive"
              )}
            />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Latest data</p>
            <p
              className={cn(
                "text-sm font-medium",
                node.supabaseConnected ? "text-accent" : "text-destructive"
              )}
            >
              {node.supabaseConnected ? "Online" : "No recent data"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
