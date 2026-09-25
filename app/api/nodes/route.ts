import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { NodeId } from "@/lib/types";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

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

  const { data: recentReadings, error: readingsError } = await supabaseAdmin
    .from("v_sensor_terkalibrasi")
    .select("node_id, received_at")
    .gte("received_at", new Date(Date.now() - ONLINE_WINDOW_MS).toISOString())
    .order("received_at", { ascending: false });

  if (readingsError) {
    return NextResponse.json(
      { error: readingsError.message },
      { status: 500 }
    );
  }

  const lastReadingByNode = new Map<string, string>();
  for (const reading of recentReadings ?? []) {
    if (!lastReadingByNode.has(reading.node_id)) {
      lastReadingByNode.set(reading.node_id, reading.received_at);
    }
  }

  const result = (nodes ?? []).map((n) => {
    const lastReadingAt = lastReadingByNode.get(n.id) ?? null;
    return {
      id: n.id as NodeId,
      label: n.label ?? n.id,
      active: n.is_active,
      supabaseConnected:
        lastReadingAt !== null &&
        Date.now() - new Date(lastReadingAt).getTime() <= ONLINE_WINDOW_MS,
      lastReadingAt,
    };
  });

  return NextResponse.json({ nodes: result });
}
