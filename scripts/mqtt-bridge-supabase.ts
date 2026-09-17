import mqtt from "mqtt";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const MQTT_URL =
  process.env.MQTT_URL ??
  "wss://5983d80f70534c6b89c3343d2a478e3a.s1.eu.hivemq.cloud:8884/mqtt";
const MQTT_USERNAME = process.env.MQTT_USERNAME ?? "";
const MQTT_PASSWORD = process.env.MQTT_PASSWORD ?? "";
const MQTT_TOPIC = process.env.MQTT_TOPIC ?? "peatland/+/data";
const MQTT_REJECT_UNAUTHORIZED = process.env.MQTT_REJECT_UNAUTHORIZED !== "false";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    "Missing bridge configuration. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface MqttReading {
  nodeId: string;
  depth: number;
  moisture: number;
  rawValue?: number;
  timestamp?: string;
}

function nodeIdFromTopic(topic: string): string | undefined {
  const match = topic.match(/(?:^|\/)(node)?([a-z0-9]+)(?:\/|$)/i);
  if (!match) return undefined;
  return match[2].toUpperCase();
}

function normalizeReadings(data: unknown, topic: string): MqttReading[] {
  if (typeof data !== "object" || data === null) return [];

  const value = data as Record<string, unknown>;
  const nodeId = String(
    value.nodeId ?? value.node_id ?? nodeIdFromTopic(topic) ?? ""
  ).toUpperCase();
  const timestamp = typeof value.timestamp === "string" ? value.timestamp : undefined;

  if (typeof value.depth === "number" && typeof value.moisture === "number") {
    return [{
      nodeId,
      depth: value.depth,
      moisture: value.moisture,
      rawValue: typeof value.rawValue === "number" ? value.rawValue : undefined,
      timestamp,
    }];
  }

  const readings = Array.isArray(value.readings) ? value.readings : [];
  return readings.flatMap((reading) => {
    if (typeof reading !== "object" || reading === null) return [];
    const item = reading as Record<string, unknown>;
    if (typeof item.depth !== "number" || typeof item.moisture !== "number") {
      return [];
    }
    return [{
      nodeId,
      depth: item.depth,
      moisture: item.moisture,
      rawValue: typeof item.rawValue === "number" ? item.rawValue : undefined,
      timestamp,
    }];
  });
}

async function insertReadings(readings: MqttReading[]): Promise<void> {
  const rows = readings.map((reading) => ({
    node_id: reading.nodeId,
    depth_cm: reading.depth,
    moisture: reading.moisture,
    raw_value: reading.rawValue ?? null,
    measured_at: reading.timestamp ? new Date(reading.timestamp).toISOString() : new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("sensor_readings")
    .insert(rows);

  if (error) {
    throw new Error(`[SUPABASE] Insert error: ${error.message}`);
  }
}

function validateReading(reading: MqttReading): boolean {
  return (
    /^[A-Z0-9_-]+$/.test(reading.nodeId) &&
    [50, 100, 150].includes(reading.depth) &&
    Number.isFinite(reading.moisture) &&
    reading.moisture >= 0 &&
    reading.moisture <= 100 &&
    (!reading.timestamp || !Number.isNaN(Date.parse(reading.timestamp)))
  );
}

async function logMqttEvent(
  nodeId: string | null,
  event: string,
  message: string
): Promise<void> {
  try {
    await supabase.from("mqtt_connection_log").insert({
      node_id: nodeId,
      event,
      message,
    });
  } catch (err) {
    console.error("[SUPABASE] Failed to log MQTT event:", err);
  }
}

const client = mqtt.connect(MQTT_URL, {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  rejectUnauthorized: MQTT_REJECT_UNAUTHORIZED,
  reconnectPeriod: 5000,
  connectTimeout: 15000,
  clean: true,
});

client.on("connect", () => {
  console.log("[MQTT] Connected to broker at", MQTT_URL);
  client.subscribe(MQTT_TOPIC, (err) => {
    if (err) {
      console.error("[MQTT] Subscribe error:", err);
    } else {
      console.log("[MQTT] Subscribed to topic:", MQTT_TOPIC);
    }
  });
  logMqttEvent(null, "connect", "Bridge connected to MQTT broker");
});

client.on("message", async (topic: string, message: Buffer) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`[MQTT] Received on ${topic}:`, JSON.stringify(payload));

    const readings = normalizeReadings(payload, topic).filter(validateReading);
    if (readings.length === 0) {
      console.warn("[MQTT] Invalid payload, skipping:", payload);
      return;
    }

    await insertReadings(readings);
    for (const reading of readings) {
      console.log(
        `[SUPABASE] Stored: Node ${reading.nodeId} | ${reading.depth}cm | ${reading.moisture}%`
      );
    }
  } catch (err) {
    console.error("[MQTT] Error processing message:", err);
  }
});

client.on("error", (err) => {
  console.error("[MQTT] Error:", err.message);
  logMqttEvent(null, "error", err.message);
});

client.on("offline", () => {
  console.warn("[MQTT] Client went offline");
  logMqttEvent(null, "disconnect", "Bridge went offline");
});

client.on("reconnect", () => {
  console.log("[MQTT] Attempting reconnect...");
});

async function shutdown() {
  console.log("\n[BRIDGE] Shutting down...");
  client.end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
