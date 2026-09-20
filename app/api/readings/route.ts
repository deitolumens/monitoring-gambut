import { NextRequest, NextResponse } from "next/server";
import {
  CALIBRATED_READINGS_SOURCE,
  supabaseAdmin,
} from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const nodeId = searchParams.get("node") ?? "A";
  const requestedHours = Number(searchParams.get("hours") ?? "24");
  const hours = Number.isFinite(requestedHours)
    ? Math.min(Math.max(requestedHours, 1), 168)
    : 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const latestPromise = supabaseAdmin
    .from(CALIBRATED_READINGS_SOURCE)
    .select("node_id, depth_cm, moisture, measured_at")
    .eq("node_id", nodeId)
    .order("measured_at", { ascending: false })
    .limit(100);

  const timeseriesPromise = supabaseAdmin
    .from(CALIBRATED_READINGS_SOURCE)
    .select("measured_at, depth_cm, moisture")
    .eq("node_id", nodeId)
    .gte("measured_at", since)
    .order("measured_at", { ascending: true });

  const [latestResult, timeseriesResult] = await Promise.all([
    latestPromise,
    timeseriesPromise,
  ]);

  if (latestResult.error) {
    return NextResponse.json(
      { error: latestResult.error.message },
      { status: 500 }
    );
  }

  if (timeseriesResult.error) {
    return NextResponse.json(
      { error: timeseriesResult.error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    latest: latestResult.data ?? [],
    timeseries: timeseriesResult.data ?? [],
  });
}
