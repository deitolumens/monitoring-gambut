-- ============================================================
-- Peatland Soil Moisture Monitoring — Neon.tech Schema
-- Run this in your Neon.tech SQL Editor or psql connection.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Table: nodes
-- Represents each physical IoT node (A, B, C)
-- ============================================================
CREATE TABLE IF NOT EXISTS nodes (
  id          VARCHAR(10)  PRIMARY KEY,          -- e.g. 'A', 'B', 'C'
  label       VARCHAR(50)  NOT NULL DEFAULT '',  -- e.g. 'Node A'
  location    VARCHAR(200),
  is_active   BOOLEAN      NOT NULL DEFAULT FALSE,
  mqtt_topic  VARCHAR(200),                      -- e.g. 'peatland/nodeA/data'
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Table: sensor_readings
-- One row per individual depth measurement
-- ============================================================
CREATE TABLE IF NOT EXISTS sensor_readings (
  id          BIGSERIAL    PRIMARY KEY,
  node_id     VARCHAR(10)  NOT NULL REFERENCES nodes(id),
  depth_cm    INTEGER      NOT NULL,             -- 50, 100, 150
  moisture    DOUBLE PRECISION NOT NULL,         -- percentage 0–100
  raw_value   INTEGER,                           -- raw analog reading (optional)
  received_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),-- when the DB received it
  measured_at TIMESTAMPTZ  NOT NULL,             -- when the sensor took the reading

  CONSTRAINT valid_depth CHECK (depth_cm IN (50, 100, 150)),
  CONSTRAINT valid_moisture CHECK (moisture >= 0 AND moisture <= 100)
);

-- Indexes for fast dashboard queries
CREATE INDEX IF NOT EXISTS idx_readings_node_time
  ON sensor_readings (node_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_node_depth_time
  ON sensor_readings (node_id, depth_cm, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_measured_at
  ON sensor_readings (measured_at DESC);

-- ============================================================
-- Table: mqtt_connection_log
-- Tracks MQTT broker connection events for status display
-- ============================================================
CREATE TABLE IF NOT EXISTS mqtt_connection_log (
  id          BIGSERIAL    PRIMARY KEY,
  node_id     VARCHAR(10)  REFERENCES nodes(id),
  event       VARCHAR(20)  NOT NULL,             -- 'connect', 'disconnect', 'error'
  message     TEXT,
  logged_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Seed initial node records
-- ============================================================
INSERT INTO nodes (id, label, is_active, mqtt_topic, location) VALUES
  ('A', 'Node A', TRUE,  'peatland/nodeA/data', 'Lahan Gambut Sector 1'),
  ('B', 'Node B', FALSE, 'peatland/nodeB/data', 'Lahan Gambut Sector 2'),
  ('C', 'Node C', FALSE, 'peatland/nodeC/data', 'Lahan Gambut Sector 3')
ON CONFLICT (id) DO NOTHING;
