import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";
export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const CALIBRATED_READINGS_SOURCE = "v_sensor_terkalibrasi";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    "Missing Supabase server configuration. Set SUPABASE_URL and SUPABASE_SERVICE_KEY."
  );
}

export const supabaseAdmin: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

export function supabaseBrowser(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: true, persistSession: true },
  });
}

export interface SoilReadingRow {
  id: number;
  node_id: string;
  depth_cm: number;
  moisture: number;
  raw_value: number | null;
  received_at: string;
  measured_at: string;
}

export interface NodeRow {
  id: string;
  label: string | null;
  location: string | null;
  is_active: boolean;
  mqtt_topic: string | null;
  created_at: string;
}

export interface MqttConnectionLogRow {
  id: number;
  node_id: string | null;
  event: string;
  message: string | null;
  logged_at: string;
}
