import type {
  DepthLevel,
  NodeId,
  NodeStatus,
  SoilReading,
  TimeSeriesPoint,
} from "./types";

export const NODES: NodeStatus[] = [
  {
    id: "A",
    label: "Node A",
    active: true,
    mqttConnected: true,
    lastUpdate: "2026-09-08T14:32:00Z",
  },
  {
    id: "B",
    label: "Node B",
    active: false,
    mqttConnected: false,
    lastUpdate: "—",
  },
  {
    id: "C",
    label: "Node C",
    active: false,
    mqttConnected: false,
    lastUpdate: "—",
  },
];

export const DEPTHS: DepthLevel[] = [50, 100, 150];

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function getCurrentReadings(nodeId: NodeId): SoilReading[] {
  const base = nodeId === "A" ? 0 : nodeId === "B" ? 1000 : 2000;
  const now = new Date();

  return DEPTHS.map((depth, i) => {
    const r = seededRandom(base + i * 17);
    let moisture: number;
    if (depth === 50) moisture = 45 + r * 20;
    else if (depth === 100) moisture = 55 + r * 18;
    else moisture = 68 + r * 15;

    return {
      timestamp: now.toISOString(),
      nodeId,
      depth,
      moisture: Math.round(moisture * 10) / 10,
    };
  });
}

export function getTimeSeriesData(nodeId: NodeId, hours = 24): TimeSeriesPoint[] {
  const base = nodeId === "A" ? 0 : nodeId === "B" ? 1000 : 2000;
  const now = new Date();
  const data: TimeSeriesPoint[] = [];

  for (let i = hours - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hh = time.getHours().toString().padStart(2, "0");
    const mm = time.getMinutes().toString().padStart(2, "0");
    const seed = base + i;
    const wave = Math.sin((i / hours) * Math.PI * 2) * 5;

    data.push({
      timestamp: time.toISOString(),
      timeLabel: `${hh}:${mm}`,
      depth50: Math.round((50 + wave + seededRandom(seed) * 8) * 10) / 10,
      depth100: Math.round((60 + wave * 0.6 + seededRandom(seed + 1) * 6) * 10) / 10,
      depth150: Math.round((72 + wave * 0.3 + seededRandom(seed + 2) * 4) * 10) / 10,
    });
  }

  return data;
}

export function getHistoricalData(nodeId: NodeId, count = 48): SoilReading[] {
  const base = nodeId === "A" ? 0 : nodeId === "B" ? 1000 : 2000;
  const now = new Date();
  const data: SoilReading[] = [];

  for (let i = 0; i < count; i++) {
    const time = new Date(now.getTime() - i * 30 * 60 * 1000);
    for (const depth of DEPTHS) {
      const r = seededRandom(base + i * 3 + depth);
      let moisture: number;
      if (depth === 50) moisture = 45 + r * 25;
      else if (depth === 100) moisture = 55 + r * 20;
      else moisture = 68 + r * 16;

      data.push({
        timestamp: time.toISOString(),
        nodeId,
        depth,
        moisture: Math.round(moisture * 10) / 10,
      });
    }
  }

  return data;
}

export function exportToCsv(data: SoilReading[], filename: string) {
  const headers = ["Timestamp", "Node ID", "Depth (cm)", "Moisture (%)"];
  const rows = data.map((d) => [
    new Date(d.timestamp).toISOString(),
    d.nodeId,
    d.depth.toString(),
    d.moisture.toString(),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function formatTimestamp(iso: string): string {
  if (iso === "—") return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function getMoistureColor(moisture: number): string {
  if (moisture < 30) return "#d4a574";
  if (moisture < 50) return "#8ab061";
  if (moisture < 70) return "#4a9d9e";
  return "#1e6b8a";
}

export function getMoistureLabel(moisture: number): string {
  if (moisture < 30) return "Dry";
  if (moisture < 50) return "Moderate";
  if (moisture < 70) return "Wet";
  return "Saturated";
}
