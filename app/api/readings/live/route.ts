import { NextRequest, NextResponse } from "next/server";
import {
  CALIBRATED_READINGS_SOURCE,
  supabaseAdmin,
} from "@/lib/supabase";
import { isNodeId } from "@/lib/types";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const nodeId = searchParams.get("node") ?? "A";
  if (!isNodeId(nodeId)) {
    return NextResponse.json({ error: "Invalid node. Use A, B, or C." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from(CALIBRATED_READINGS_SOURCE)
    .select("node_id, depth_cm, moisture, raw_value, measured_at, received_at")
    .eq("node_id", nodeId)
    .order("measured_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const grouped = new Map<number, { moisture: number; raw_value: number | null; measured_at: string }>();
  for (const row of data ?? []) {
    if (!grouped.has(row.depth_cm)) {
      grouped.set(row.depth_cm, {
        moisture: row.moisture,
        raw_value: row.raw_value,
        measured_at: row.received_at ?? row.measured_at,
      });
    }
  }

  const result = [50, 100, 150].map((depth) => ({
    depth,
    ...grouped.get(depth),
  }));

  return NextResponse.json(
    { readings: result },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
