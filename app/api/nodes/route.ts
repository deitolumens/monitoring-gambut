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

  const result = (nodes ?? []).map((n) => {
    return {
      id: n.id,
      label: n.label ?? n.id,
      active: n.is_active,
      supabaseConnected: true,
    };
  });

  return NextResponse.json({ nodes: result });
}
