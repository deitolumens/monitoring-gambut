"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { NodeId, NodeStatus } from "@/lib/types";

interface NodeSelectorProps {
  nodes: NodeStatus[];
  selectedNodeId: NodeId;
  onSelect: (id: NodeId) => void;
}

export function NodeSelector({ nodes, selectedNodeId, onSelect }: NodeSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const selected = nodes.find((n) => n.id === selectedNodeId) ?? nodes[0];

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-muted-foreground">Select Node</label>
      <div className="flex flex-wrap gap-2">
        {nodes.map((node) => (
          <button
            key={node.id}
            onClick={() => onSelect(node.id)}
            className={cn(
              "relative rounded-md border px-4 py-2 text-sm font-medium transition-all",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
              node.id === selectedNodeId
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card hover:bg-accent/10 hover:border-primary/30",
              !node.active && "opacity-60"
            )}
          >
            {node.label}
            {!node.active && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                (soon)
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// Dropdown variant for compact spaces
export function NodeSelectorDropdown({
  nodes,
  selectedNodeId,
  onSelect,
}: NodeSelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = nodes.find((n) => n.id === selectedNodeId) ?? nodes[0];

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center justify-between gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium",
          "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        )}
      >
        {selected.label}
        <svg className="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
            {nodes.map((node) => (
              <button
                key={node.id}
                onClick={() => {
                  onSelect(node.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-3 py-2 text-sm",
                  node.id === selectedNodeId
                    ? "bg-accent/20 font-medium"
                    : "hover:bg-accent/10"
                )}
              >
                {node.label}
                {!node.active && (
                  <span className="text-xs text-muted-foreground">(soon)</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
