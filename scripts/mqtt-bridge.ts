/**
 * MQTT-to-Database Bridge Service
 *
 * Subscribes to the HiveMQ MQTT broker over secure WebSocket (WSS),
 * receives soil moisture readings from IoT nodes, and stores them
 * in a Neon.tech PostgreSQL database.
 *
 * -----------------------------------------------------------------
 * SETUP
 *
 * 1. Install dependencies:
 *    npm install mqtt pg dotenv
 *    npm install -D tsx @types/pg
 *
 * 2. Copy .env.mqtt-bridge to .env and fill in real credentials.
 *
 * 3. Run:
 *    npx tsx scripts/mqtt-bridge.ts
 *
 * For production, run this as a persistent service (PM2, systemd,
 * Docker, or a cloud worker).
 * -----------------------------------------------------------------
 */

import mqtt from "mqtt";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// ── Configuration ──────────────────────────────────────────────

const MQTT_URL = process.env.MQTT_URL!;
const MQTT_USERNAME = process.env.MQTT_USERNAME ?? "";
const MQTT_PASSWORD = process.env.MQTT_PASSWORD ?? "";
const MQTT_TOPIC = process.env.MQTT_TOPIC ?? "peatland/+/data";
const MQTT_REJECT_UNAUTHORIZED = process.env.MQTT_REJECT_UNAUTHORIZED !== "false";

const DATABASE_URL = process.env.DATABASE_URL!;

// ── Database Connection ────────────────────────────────────────

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
});

// ── MQTT Payload Type ──────────────────────────────────────────

interface MqttPayload {
  nodeId: string;       // "A", "B", "C"
  depth: number;        // 50, 100, 150
  moisture: number;     // 0–100
  rawValue?: number;    // optional raw sensor ADC value
  timestamp?: string;   // ISO string from the device, or null
}

// ── Insert Reading into Database ───────────────────────────────

async function insertReading(payload: MqttPayload): Promise<void> {
  const measuredAt = payload.timestamp
    ? new Date(payload.timestamp)
    : new Date();

  const query = `
    INSERT INTO sensor_readings (node_id, depth_cm, moisture, raw_value, measured_at)
    VALUES ($1, $2, $3, $4, $5)
  `;

  const values = [
    payload.nodeId,
    payload.depth,
    payload.moisture,
    payload.rawValue ?? null,
    measuredAt,
  ];

  await pool.query(query, values);
}

// ── Validate Payload ───────────────────────────────────────────

function validatePayload(data: unknown): data is MqttPayload {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.nodeId === "string" &&
    typeof d.depth === "number" &&
    [50, 100, 150].includes(d.depth) &&
    typeof d.moisture === "number" &&
    d.moisture >= 0 &&
    d.moisture <= 100
  );
}

// ── Log MQTT Connection Events ─────────────────────────────────

async function logMqttEvent(
  nodeId: string | null,
  event: string,
  message: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO mqtt_connection_log (node_id, event, message) VALUES ($1, $2, $3)`,
      [nodeId, event, message]
    );
  } catch (err) {
    console.error("[DB] Failed to log MQTT event:", err);
  }
}

// ── MQTT Client Setup ──────────────────────────────────────────

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

    if (!validatePayload(payload)) {
      console.warn("[MQTT] Invalid payload, skipping:", payload);
      return;
    }

    await insertReading(payload);
    console.log(
      `[DB] Stored: Node ${payload.nodeId} | ${payload.depth}cm | ${payload.moisture}%`
    );
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

// ── Graceful Shutdown ──────────────────────────────────────────

async function shutdown() {
  console.log("\n[BRIDGE] Shutting down...");
  client.end();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
