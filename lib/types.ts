export type DepthLevel = 50 | 100 | 150;

export type NodeId = "A" | "B" | "C";

export interface SoilReading {
  timestamp: string;
  nodeId: NodeId;
  depth: DepthLevel;
  moisture: number;
}

export interface NodeStatus {
  id: NodeId;
  label: string;
  active: boolean;
  mqttConnected: boolean;
  lastUpdate: string;
}

export interface DepthReading {
  depth: DepthLevel;
  moisture: number;
}

export interface TimeSeriesPoint {
  timestamp: string;
  timeLabel: string;
  depth50: number;
  depth100: number;
  depth150: number;
}
