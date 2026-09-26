import { useEffect, useState, useCallback, useRef } from "react";
import type { NodeId, NodeStatus, SoilReading, TimeSeriesPoint } from "@/lib/types";

interface ReadingsResponse {
  readings: Array<{
    depth: number;
    moisture?: number;
    raw_value?: number;
    measured_at?: string;
  }>;
}

interface ReadingsDataResponse {
  latest: Array<{ node_id: string; depth_cm: number; moisture: number; measured_at: string; received_at?: string }>;
  timeseries: Array<{ measured_at: string; depth_cm: number; moisture: number }>;
}

interface HistoryResponse {
  data: SoilReading[];
  total: number;
  limit: number;
  offset: number;
}

export type ChartRange = 4 | 12 | 24;

const POLL_INTERVAL_MS = 30_000;
const CHART_DATA_HOURS = 72;

function mapToSoilReading(
  nodeId: NodeId,
  depth: number,
  moisture: number,
  measuredAt: string,
  rawValue?: number
): SoilReading {
  return {
    timestamp: measuredAt,
    nodeId,
    depth: depth as SoilReading["depth"],
    moisture,
    rawValue,
  };
}

export function useSoilData(selectedNodeId: NodeId, chartRange: ChartRange) {
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [currentReadings, setCurrentReadings] = useState<SoilReading[]>([]);
  const [allCurrentReadings, setAllCurrentReadings] = useState<SoilReading[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesPoint[]>([]);
  const [historicalData, setHistoricalData] = useState<SoilReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const cacheBust = Date.now();

      const [nodesRes, liveRes, timeseriesRes, historyRes, ...allLiveResponses] = await Promise.all([
        fetch(`/api/nodes?t=${cacheBust}`, { cache: "no-store" }),
        fetch(`/api/readings/live?node=${selectedNodeId}&t=${cacheBust}`, { cache: "no-store" }),
        fetch(`/api/readings?node=${selectedNodeId}&hours=${CHART_DATA_HOURS}&t=${cacheBust}`, {
          cache: "no-store",
        }),
        fetch(`/api/readings/history?node=${selectedNodeId}&limit=48&offset=0&t=${cacheBust}`, {
          cache: "no-store",
        }),
        ...(["A", "B", "C"] as NodeId[]).map((nodeId) =>
          fetch(`/api/readings/live?node=${nodeId}&t=${cacheBust}`, { cache: "no-store" })
        ),
      ]);

      const failedResponse = [
        nodesRes,
        liveRes,
        timeseriesRes,
        historyRes,
      ].find((response) => !response.ok);
      if (failedResponse) {
        let message = `Request failed (${failedResponse.status})`;
        try {
          const body = await failedResponse.json();
          if (typeof body.error === "string") message = body.error;
        } catch {
          // Keep the HTTP status when the response is not JSON.
        }
        throw new Error(message);
      }

      const nodesJson = await nodesRes.json();
      setNodes(nodesJson.nodes ?? []);

      const liveJson: ReadingsResponse = await liveRes.json();
      const readings: SoilReading[] = (liveJson.readings ?? [])
        .filter((r) => r.moisture !== undefined)
        .map((r) =>
          mapToSoilReading(
            selectedNodeId,
            r.depth,
            r.moisture ?? 0,
            r.measured_at ?? new Date().toISOString(),
            r.raw_value
          )
        );
      setCurrentReadings(readings);

      const allLiveJson = await Promise.all(
        allLiveResponses.map((response) => response.json())
      );
      setAllCurrentReadings(
        allLiveJson.flatMap((json, index) => {
          const nodeId = (["A", "B", "C"] as NodeId[])[index];
          return (json.readings ?? [])
            .filter((reading: { moisture?: number }) => reading.moisture !== undefined)
            .map((reading: { depth: number; moisture: number; raw_value?: number; measured_at?: string }) =>
              mapToSoilReading(
                nodeId,
                reading.depth,
                reading.moisture,
                reading.measured_at ?? new Date().toISOString(),
                reading.raw_value
              )
            );
        })
      );

      const timeseriesJson: ReadingsDataResponse = await timeseriesRes.json();
      const points: TimeSeriesPoint[] = (timeseriesJson.timeseries ?? []).map((t) => {
          const d = new Date(t.measured_at);
          const hh = d.getHours().toString().padStart(2, "0");
          const mm = d.getMinutes().toString().padStart(2, "0");
          const dateLabel = `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
            .toString()
            .padStart(2, "0")}`;
          return {
            timestamp: t.measured_at,
            timeLabel: `${dateLabel} ${hh}:${mm}`,
            depth50: t.depth_cm === 50 ? t.moisture : undefined,
            depth100: t.depth_cm === 100 ? t.moisture : undefined,
            depth150: t.depth_cm === 150 ? t.moisture : undefined,
          };
      });

      const grouped: Record<string, TimeSeriesPoint> = {};
      for (const p of points) {
        if (!grouped[p.timestamp]) {
          grouped[p.timestamp] = {
            timestamp: p.timestamp,
            timeLabel: p.timeLabel,
            depth50: undefined,
            depth100: undefined,
            depth150: undefined,
          };
        }
        if (p.depth50 !== undefined) grouped[p.timestamp].depth50 = p.depth50;
        if (p.depth100 !== undefined) grouped[p.timestamp].depth100 = p.depth100;
        if (p.depth150 !== undefined) grouped[p.timestamp].depth150 = p.depth150;
      }
      setTimeSeriesData(Object.values(grouped));

      const historyJson: HistoryResponse = await historyRes.json();
      setHistoricalData(historyJson.data ?? []);
    } catch (err) {
      console.error("[Dashboard] Fetch error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [selectedNodeId]);

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
    allCurrentReadings,
    timeSeriesData,
    historicalData,
    loading,
    error,
    refetch: fetchData,
  };
}
