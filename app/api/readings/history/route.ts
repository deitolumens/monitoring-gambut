import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const nodeId = searchParams.get("node") ?? "A";
  const limit = parseInt(searchParams.get("limit") ?? "48", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const countPromise = supabaseAdmin
    .from("sensor_readings")
    .select("*", { count: "exact", head: true })
    .eq("node_id", nodeId);

  const dataPromise = supabaseAdmin
    .from("sensor_readings")
    .select("node_id, depth_cm, moisture, measured_at")
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

  return NextResponse.json({
    data: (dataResult.data ?? []).map((row) => ({
      nodeId: row.node_id,
      depth: row.depth_cm,
      moisture: row.moisture,
      timestamp: row.measured_at,
    })),
    total: count ?? 0,
    limit,
    offset,
  });
}
