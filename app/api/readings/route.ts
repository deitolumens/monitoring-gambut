import { NextRequest, NextResponse } from "next/server";
import {
  CALIBRATED_READINGS_SOURCE,
  supabaseAdmin,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 1000;

type TimeseriesRow = {
  measured_at: string;
  received_at: string;
  depth_cm: number;
  moisture: number;
};

async function fetchTimeseries(
  nodeId: string,
  since: string
): Promise<{ data: TimeseriesRow[]; error: Error | null }> {
  const rows: TimeseriesRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from(CALIBRATED_READINGS_SOURCE)
      .select("measured_at, received_at, depth_cm, moisture")
      .eq("node_id", nodeId)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) return { data: [], error };

    rows.push(...((data ?? []) as TimeseriesRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  rows.sort(
    (first, second) =>
      new Date(first.received_at).getTime() - new Date(second.received_at).getTime()
  );

  return { data: rows, error: null };
}

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
    .select("node_id, depth_cm, moisture, measured_at, received_at")
    .eq("node_id", nodeId)
    .order("received_at", { ascending: false })
    .limit(100);

  const timeseriesPromise = fetchTimeseries(nodeId, since);

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

  return NextResponse.json(
    {
      latest: latestResult.data ?? [],
      timeseries: timeseriesResult.data.map((row) => ({
        measured_at: row.received_at ?? row.measured_at,
        depth_cm: row.depth_cm,
        moisture: row.moisture,
      })),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
