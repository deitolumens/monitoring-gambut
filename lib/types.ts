export type DepthLevel = 50 | 100 | 150;

export type NodeId = "A" | "B" | "C";

export const NODE_IDS: readonly NodeId[] = ["A", "B", "C"];

export function isNodeId(value: string | null): value is NodeId {
  return value !== null && NODE_IDS.includes(value as NodeId);
}

export interface SoilReading {
  timestamp: string;
  nodeId: NodeId;
  depth: DepthLevel;
  moisture: number;
  rawValue?: number;
}

export interface NodeStatus {
  id: NodeId;
  label: string;
  active: boolean;
  supabaseConnected: boolean;
  lastReadingAt: string | null;
}

export interface DepthReading {
  depth: DepthLevel;
  moisture: number;
}

export interface TimeSeriesPoint {
  timestamp: string;
  timeLabel: string;
  depth50?: number;
  depth100?: number;
  depth150?: number;
}
