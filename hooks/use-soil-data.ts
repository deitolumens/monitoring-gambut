import { useEffect, useState, useCallback, useRef } from "react";
import type { NodeId, NodeStatus, SoilReading, TimeSeriesPoint } from "@/lib/types";

interface ReadingsResponse {
  readings: Array<{
    depth: number;
    moisture?: number;
    measured_at?: string;
  }>;
}

interface ReadingsDataResponse {
  latest: Array<{ node_id: string; depth_cm: number; moisture: number; measured_at: string }>;
  timeseries: Array<{ measured_at: string; depth_cm: number; moisture: number }>;
}

interface HistoryResponse {
  data: SoilReading[];
  total: number;
  limit: number;
  offset: number;
}

export type ChartRange = 1 | 4 | 12 | 24;

const POLL_INTERVAL_MS = 30_000;

function mapToSoilReading(
  nodeId: NodeId,
  depth: number,
  moisture: number,
  measuredAt: string
): SoilReading {
  return {
    timestamp: measuredAt,
    nodeId,
    depth: depth as SoilReading["depth"],
    moisture,
  };
}

export function useSoilData(selectedNodeId: NodeId, chartRange: ChartRange) {
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [currentReadings, setCurrentReadings] = useState<SoilReading[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesPoint[]>([]);
  const [historicalData, setHistoricalData] = useState<SoilReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      const [nodesRes, liveRes, timeseriesRes, historyRes] = await Promise.all([
        fetch("/api/nodes"),
        fetch(`/api/readings/live?node=${selectedNodeId}`),
        fetch(`/api/readings?node=${selectedNodeId}&hours=${chartRange}`),
        fetch(`/api/readings/history?node=${selectedNodeId}&limit=48&offset=0`),
      ]);

      if (nodesRes.ok) {
        const nodesJson = await nodesRes.json();
        setNodes(nodesJson.nodes ?? []);
      }

      if (liveRes.ok) {
        const json: ReadingsResponse = await liveRes.json();
        const readings: SoilReading[] = (json.readings ?? [])
          .filter((r) => r.moisture !== undefined)
          .map((r) =>
            mapToSoilReading(
              selectedNodeId,
              r.depth,
              r.moisture ?? 0,
              r.measured_at ?? new Date().toISOString()
            )
          );
        setCurrentReadings(readings);
      }

      if (timeseriesRes.ok) {
        const json: ReadingsDataResponse = await timeseriesRes.json();
        const points: TimeSeriesPoint[] = (json.timeseries ?? []).map((t) => {
          const d = new Date(t.measured_at);
          const hh = d.getUTCHours().toString().padStart(2, "0");
          const mm = d.getUTCMinutes().toString().padStart(2, "0");
          return {
            timestamp: t.measured_at,
            timeLabel: `${hh}:${mm}`,
            depth50: t.depth_cm === 50 ? t.moisture : undefined,
            depth100: t.depth_cm === 100 ? t.moisture : undefined,
            depth150: t.depth_cm === 150 ? t.moisture : undefined,
          };
        });

        const grouped: Record<string, TimeSeriesPoint> = {};
        for (const p of points) {
          if (!grouped[p.timeLabel]) {
            grouped[p.timeLabel] = {
              timestamp: p.timestamp,
              timeLabel: p.timeLabel,
              depth50: undefined,
              depth100: undefined,
              depth150: undefined,
            };
          }
          if (p.depth50 !== undefined) grouped[p.timeLabel].depth50 = p.depth50;
          if (p.depth100 !== undefined) grouped[p.timeLabel].depth100 = p.depth100;
          if (p.depth150 !== undefined) grouped[p.timeLabel].depth150 = p.depth150;
        }
        setTimeSeriesData(Object.values(grouped));
      }

      if (historyRes.ok) {
        const json: HistoryResponse = await historyRes.json();
        setHistoricalData(json.data ?? []);
      }
    } catch (err) {
      console.error("[Dashboard] Fetch error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [chartRange, selectedNodeId]);

  useEffect(() => {
    setLoading(true);
    fetchData();

    intervalRef.current = setInterval(fetchData, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  return {
    nodes,
    currentReadings,
    timeSeriesData,
    historicalData,
    loading,
    error,
    refetch: fetchData,
  };
}
