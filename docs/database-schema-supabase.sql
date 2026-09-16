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
  measured_at TIMESTAMPTZ  NOT NULL,

  CONSTRAINT valid_depth CHECK (depth_cm IN (50, 100, 150)),
  CONSTRAINT valid_moisture CHECK (moisture >= 0 AND moisture <= 100)
);

CREATE INDEX IF NOT EXISTS idx_readings_node_time
  ON public.sensor_readings (node_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_node_depth_time
  ON public.sensor_readings (node_id, depth_cm, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_measured_at
  ON public.sensor_readings (measured_at DESC);

-- Enable Realtime for sensor_readings (for live dashboard updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.sensor_readings;

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
  ('B', 'Node B', FALSE, 'peatland/nodeB/data', 'Lahan Gambut Sector 2'),
  ('C', 'Node C', FALSE, 'peatland/nodeC/data', 'Lahan Gambut Sector 3')
ON CONFLICT (id) DO NOTHING;
