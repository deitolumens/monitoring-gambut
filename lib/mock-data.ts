import type { SoilReading } from "./types";

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
    timeZone: "UTC",
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
