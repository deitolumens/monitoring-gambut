import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data: nodes, error: nodesError } = await supabaseAdmin
    .from("nodes")
    .select("*")
    .order("id", { ascending: true });

  if (nodesError) {
    return NextResponse.json(
      { error: nodesError.message },
      { status: 500 }
    );
  }

  const { data: readings, error: readingsError } = await supabaseAdmin
    .from("sensor_readings")
    .select("node_id, measured_at")
    .order("measured_at", { ascending: false })
    .limit(100);

  if (readingsError) {
    console.error("[API/nodes] Failed to fetch readings:", readingsError.message);
  }

  const latestReadingByNode = new Map<string, string>();
  for (const reading of readings ?? []) {
    if (!latestReadingByNode.has(reading.node_id)) {
      latestReadingByNode.set(reading.node_id, reading.measured_at);
    }
  }

  const now = new Date();
  const result = (nodes ?? []).map((n) => {
    const latest = latestReadingByNode.get(n.id);
    const latestDate = latest ? new Date(latest) : null;
    const diffMin = latestDate
      ? (now.getTime() - latestDate.getTime()) / (60 * 1000)
      : Infinity;
    const mqttConnected = diffMin < 5;
    let lastUpdate = "—";

    if (latest && diffMin < 5) {
      lastUpdate = latest;
    }

    return {
      id: n.id,
      label: n.label ?? n.id,
      active: n.is_active,
      mqttConnected,
      lastUpdate,
    };
  });

  return NextResponse.json({ nodes: result });
}
