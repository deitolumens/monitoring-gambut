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
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "48", 10) || 48, 1), 200);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

  const countPromise = supabaseAdmin
    .from(CALIBRATED_READINGS_SOURCE)
    .select("*", { count: "exact", head: true })
    .eq("node_id", nodeId);

  const dataPromise = supabaseAdmin
    .from(CALIBRATED_READINGS_SOURCE)
    .select("node_id, depth_cm, moisture, raw_value, measured_at, received_at")
    .eq("node_id", nodeId)
    .order("measured_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const [{ count }, dataResult] = await Promise.all([countPromise, dataPromise]);

  if (dataResult.error) {
    return NextResponse.json(
      { error: dataResult.error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      data: (dataResult.data ?? []).map((row) => ({
        nodeId: row.node_id,
        depth: row.depth_cm,
        moisture: row.moisture,
        rawValue: row.raw_value,
        timestamp: row.received_at ?? row.measured_at,
      })),
      total: count ?? 0,
      limit,
      offset,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
