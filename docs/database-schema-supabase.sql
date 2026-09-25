-- ============================================================
-- Peatland Soil Moisture Monitoring — Supabase Schema
-- Run this in Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- Table: nodes
-- Represents each physical IoT node (A, B, C)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.nodes (
  id          TEXT         PRIMARY KEY,
  label       TEXT         NOT NULL DEFAULT '',
  location    TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT FALSE,
  mqtt_topic  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Table: sensor_readings
-- One row per individual depth measurement
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sensor_readings (
  id          BIGSERIAL    PRIMARY KEY,
  node_id     TEXT         NOT NULL REFERENCES public.nodes(id),
  depth_cm    INTEGER      NOT NULL,
  moisture    DOUBLE PRECISION NOT NULL,
  raw_value   INTEGER,
  received_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  measured_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_depth CHECK (depth_cm IN (50, 100, 150)),
  CONSTRAINT valid_moisture CHECK (moisture >= 0 AND moisture <= 100)
);

ALTER TABLE public.sensor_readings
  ALTER COLUMN measured_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_readings_node_time
  ON public.sensor_readings (node_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_node_depth_time
  ON public.sensor_readings (node_id, depth_cm, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_measured_at
  ON public.sensor_readings (measured_at DESC);

-- Dashboard source. Replace moisture with calibrated expressions when
-- per-sensor calibration coefficients are available.
CREATE OR REPLACE VIEW public.v_sensor_terkalibrasi
WITH (security_invoker = true)
AS
SELECT
  id,
  node_id,
  depth_cm,
  moisture,
  raw_value,
  measured_at,
  received_at
FROM public.sensor_readings;

-- The dashboard polls the API, so Supabase Realtime is not required.

-- ESP32 writes through the Supabase REST API with the public anon key.
-- Keep validation in the database and never embed the service role key in firmware.
ALTER TABLE public.sensor_readings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ESP32 can insert sensor readings" ON public.sensor_readings;
CREATE POLICY "ESP32 can insert sensor readings"
  ON public.sensor_readings FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    depth_cm IN (50, 100, 150)
    AND moisture >= 0
    AND moisture <= 100
  );

ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Dashboard can read nodes" ON public.nodes;
CREATE POLICY "Dashboard can read nodes"
  ON public.nodes FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Dashboard can read sensor readings" ON public.sensor_readings;
CREATE POLICY "Dashboard can read sensor readings"
  ON public.sensor_readings FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================
-- Table: mqtt_connection_log
-- Tracks MQTT broker connection events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mqtt_connection_log (
  id          BIGSERIAL    PRIMARY KEY,
  node_id     TEXT         REFERENCES public.nodes(id),
  event       TEXT         NOT NULL,
  message     TEXT,
  logged_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Seed initial node records
-- ============================================================
INSERT INTO public.nodes (id, label, is_active, mqtt_topic, location) VALUES
  ('A', 'Node A', TRUE,  'peatland/nodeA/data', 'Lahan Gambut Sector 1'),
  ('B', 'Node B', TRUE,  'peatland/nodeB/data', 'Lahan Gambut Sector 2'),
  ('C', 'Node C', TRUE,  'peatland/nodeC/data', 'Lahan Gambut Sector 3')
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  is_active = EXCLUDED.is_active,
  mqtt_topic = EXCLUDED.mqtt_topic,
  location = EXCLUDED.location;
