# Integrasi MQTT & Supabase — Sistem Monitoring Lahan Gambut

Dokumentasi lengkap untuk menghubungkan data sensor kelembaban tanah dari broker MQTT (HiveMQ Cloud) ke database Supabase PostgreSQL, dan menampilkannya di dashboard Next.js.

---

## 1. Arsitektur Sistem

```
  ┌──────────────┐     MQTT/WSS      ┌───────────────┐     INSERT      ┌──────────────┐
  │  IoT Node    │ ──────────────►   │   MQTT Bridge │ ─────────────►  │  Supabase    │
  │  (ESP32/     │   pub: topic      │   (Node.js)   │   sensor_       │  PostgreSQL  │
  │   ESP8266)   │                   │   subscriber  │   readings      │              │
  └──────────────┘                   └───────────────┘                  └──────┬───────┘
        │                                                                     │
        │  3 capacitive sensors                                              │ SELECT
        │  (50cm, 100cm, 150cm)                                             │
        │                                                                     ▼
        │                                                             ┌──────────────┐
        │                                                             │  Next.js     │
        │                                                             │  Dashboard   │
        │                                                             │  (polling    │
        │                                                             │   30 detik)  │
        └─────────────────────────────────────────────────────────────► └──────────────┘
        │   (opsional: MQTT over WSS langsung di browser)
        └─────────────────────────────────────────────────────────────► Supabase Realtime
```

**Alur data:**

1. **IoT Node** (ESP32/ESP8266) membaca 3 sensor kapasitif pada kedalaman 50cm, 100cm, dan 150cm.
2. Node mempublish data JSON ke topik MQTT broker HiveMQ Cloud melalui koneksi WebSocket Secure (WSS).
3. **MQTT Bridge** (skrip Node.js) berlangganan ke topik MQTT, menerima setiap pesan, dan menyimpannya ke tabel `sensor_readings` di Supabase.
4. **Dashboard Next.js** melakukan polling ke API route setiap 30 detik untuk menampilkan data real-time, grafik tren, dan tabel historis.

---

## 2. Konfigurasi MQTT Broker (HiveMQ Cloud)

### 2.1. Kredensial Broker

| Parameter       | Nilai |
|----------------|-------|
| **Broker URL**  | `wss://5983d80f70534c6b89c3343d2a478e3a.s1.eu.hivemq.cloud:8884` |
| **Protocol**    | MQTT over WebSocket Secure (WSS) |
| **Port**        | 8884 |
| **Username**    | *(dari HiveMQ Cloud dashboard)* |
| **Password**    | *(dari HiveMQ Cloud dashboard)* |

### 2.2. Struktur Topik MQTT

```
peatland/nodeA/data   →  Node A mengirim data sensor
peatland/nodeB/data   →  Node B mengirim data sensor
peatland/nodeC/data   →  Node C mengirim data sensor
```

Bridge berlangganan ke wildcard `peatland/+/data` untuk menerima dari semua node sekaligus.

### 2.3. Format Pesan MQTT (JSON)

```json
{
  "nodeId": "A",
  "depth": 50,
  "moisture": 62.3,
  "rawValue": 740,
  "timestamp": "2026-09-08T14:32:00Z"
}
```

| Field        | Tipe   | Wajib | Keterangan |
|-------------|--------|-------|------------|
| `nodeId`    | string | Ya    | Identitas node: "A", "B", atau "C" |
| `depth`     | number | Ya    | Kedalaman sensor dalam cm: 50, 100, atau 150 |
| `moisture`  | number | Ya    | Persentase kelembaban 0–100 |
| `rawValue`  | number | Tidak | Nilai mentah dari ADC sensor (opsional) |
| `timestamp` | string | Tidak | Waktu pengukuran dalam format ISO 8601 |

---

## 3. Konfigurasi Database (Supabase)

### 3.1. Membuat Project di Supabase

1. Buka [https://supabase.com](https://supabase.com) dan login / daftar.
2. Klik **New Project** → beri nama (mis. "peatland-monitor").
3. Pilih region terdekat (Singapore untuk Indonesia).
4. Setelah project dibuat, salin **URL** dan **anon key** dari Settings → API.
5. Salin **Service Role Key** (untuk server-side/API route saja) dari Settings → API.

### 3.2. Menjalankan Skema Database

Buka **SQL Editor** di dashboard Supabase, lalu jalankan:

```bash
# Atau langsung paste docs/database-schema-supabase.sql di SQL Editor
psql "your-supabase-connection-string" -f docs/database-schema-supabase.sql
```

Skema membuat 3 tabel:

| Tabel                  | Kegunaan |
|------------------------|----------|
| `nodes`                | Metadata setiap node (lokasi, status aktif, topik MQTT) |
| `sensor_readings`      | Data pengukuran kelembaban (satu baris per pengukuran per kedalaman) |
| `mqtt_connection_log`  | Log event koneksi MQTT bridge |

### 3.3. Konfigurasi Row Level Security (RLS)

Aktifkan RLS untuk keamanan, dan buat kebijakan untuk API route (menggunakan service role key):

```sql
-- Aktifkan RLS
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mqtt_connection_log ENABLE ROW LEVEL SECURITY;

-- Kebijakan: API route (service role) bisa baca tulis semua
CREATE POLICY "Allow full access for service role"
  ON public.nodes FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access for service role"
  ON public.sensor_readings FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access for service role"
  ON public.mqtt_connection_log FOR ALL
  USING (true) WITH CHECK (true);
```

### 3.4. Query yang Digunakan Dashboard (melalui API routes)

**Data terbaru per node per kedalaman:**
```sql
SELECT node_id, depth_cm, moisture, measured_at
FROM sensor_readings
WHERE node_id = 'A'
ORDER BY depth_cm, measured_at DESC
LIMIT 3;
```

**Data time-series 24 jam terakhir:**
```sql
SELECT measured_at, depth_cm, moisture
FROM sensor_readings
WHERE node_id = 'A'
  AND measured_at > NOW() - INTERVAL '24 hours'
ORDER BY measured_at ASC;
```

**Data historis dengan pagination:**
```sql
SELECT node_id, depth_cm, moisture, measured_at
FROM sensor_readings
WHERE node_id = 'A'
ORDER BY measured_at DESC
LIMIT 48 OFFSET 0;
```

---

## 4. MQTT Bridge Service (Menuju Supabase)

### 4.1. Instalasi

```bash
npm install mqtt @supabase/supabase-js dotenv
npm install -D tsx @types/pg
```

### 4.2. Konfigurasi Environment

Salin template dan isi kredensial asli:

```bash
cp .env.supabase.example .env
```

Edit `.env` dengan kredensial Supabase dan MQTT Anda.

### 4.3. Menjalankan Bridge

**Development:**
```bash
npx tsx scripts/mqtt-bridge-supabase.ts
```

**Production dengan PM2:**
```bash
npm install -g pm2
pm2 start "npx tsx scripts/mqtt-bridge-supabase.ts" --name mqtt-bridge
pm2 save
pm2 startup
```

### 4.4. Cara Kerja Bridge

```
1. Connect ke MQTT broker (WSS) ─────────►  HiveMQ Cloud
2. Subscribe ke topic "peatland/+/data" ─►  menerima semua node
3. Setiap pesan masuk:
   a. Parse JSON payload
   b. Validasi: nodeId, depth (50/100/150), moisture (0-100)
   c. INSERT ke tabel sensor_readings di Supabase
   d. Log ke console: "Stored: Node A | 50cm | 62.3%"
4. Jika koneksi terputus, auto-reconnect setiap 5 detik
5. Jika error, log ke mqtt_connection_log
```

---

## 5. Kode ESP32 (IoT Node) — Contoh

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>

const char* WIFI_SSID = "your_wifi_ssid";
const char* WIFI_PASS = "your_wifi_password";

const char* MQTT_HOST = "5983d80f70534c6b89c3343d2a478e3a.s1.eu.hivemq.cloud";
const int   MQTT_PORT = 8884;
const char* MQTT_USER = "your_hivemq_username";
const char* MQTT_PASS = "your_hivemq_password";
const char* NODE_ID   = "A";

const int SENSOR_50  = 34;
const int SENSOR_100 = 35;
const int SENSOR_150 = 32;

WiFiClientSecure espClient;
PubSubClient client(espClient);

void publishReading(int depth, int pin) {
  int raw = analogRead(pin);
  float moisture = map(raw, 4095, 0, 0, 100);
  moisture = constrain(moisture, 0, 100);

  StaticJsonDocument<128> doc;
  doc["nodeId"]   = NODE_ID;
  doc["depth"]    = depth;
  doc["moisture"] = round(moisture * 10) / 10.0;
  doc["rawValue"] = raw;

  char buffer[128];
  serializeJson(doc, buffer);

  String topic = "peatland/node" + String(NODE_ID) + "/data";
  client.publish(topic.c_str(), buffer);
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  espClient.setInsecure();
  client.setServer(MQTT_HOST, MQTT_PORT);
}

void loop() {
  if (!client.connected()) {
    while (!client.connect("esp32-nodeA", MQTT_USER, MQTT_PASS)) {
      delay(5000);
    }
  }
  client.loop();

  publishReading(50,  SENSOR_50);
  delay(100);
  publishReading(100, SENSOR_100);
  delay(100);
  publishReading(150, SENSOR_150);

  delay(60000);
}
```

---

## 6. Menghubungkan Dashboard ke Supabase

Dashboard menggunakan pendekatan berikut:

### 6.1. API Routes (Server-side)

API route di `app/api/` menggunakan **Service Role Key** untuk mengakses Supabase:

- `app/api/nodes/route.ts` — daftar node + status MQTT
- `app/api/readings/live/route.ts` — data terbaru per kedalaman
- `app/api/readings/route.ts` — time series 24 jam
- `app/api/readings/history/route.ts` — data historis paginated

### 6.2. Client-side Hook

`hooks/use-soil-data.ts` melakukan polling ke API route setiap 30 detik:

```typescript
const { nodes, currentReadings, timeSeriesData, historicalData, loading } = useSoilData("A");
```

### 6.3. Install Supabase Client

```bash
npm install @supabase/supabase-js
```

Sudah terinstall di `package.json`.

---

## 7. Checklist Deployment

| Langkah | Status |
|---------|--------|
| Buat akun Supabase, buat project | ☐ |
| Salin URL, anon key, service role key | ☐ |
| Jalankan `docs/database-schema-supabase.sql` di SQL Editor | ☐ |
| Konfigurasi RLS seperti di docs | ☐ |
| Isi `.env` dengan kredensial MQTT dan Supabase | ☐ |
| Install dependency bridge: `npm install mqtt @supabase/supabase-js dotenv` | ☐ |
| Jalankan bridge: `npx tsx scripts/mqtt-bridge-supabase.ts` | ☐ |
| Flash kode ESP32 ke node, verifikasi data masuk Supabase | ☐ |
| Dashboard polling API otomatis | ☐ |
| Deploy bridge ke VPS/Railway/Render | ☐ |
| Deploy Next.js dashboard ke Netlify/Vercel | ☐ |
| Set environment variables di platform hosting | ☐ |

---

## 8. Struktur File

```
docs/
├── INTEGRATION.md                ← dokumentasi sebelumnya (Neon.tech)
├── database-schema.sql           ← skema untuk Neon.tech
├── database-schema-supabase.sql  ← skema untuk Supabase
├── .env.supabase.example         ← template environment variables
└── .env.mqtt-bridge              ← template MQTT bridge env

scripts/
├── mqtt-bridge.ts                ← bridge ke Neon (legacy)
└── mqtt-bridge-supabase.ts       ← bridge ke Supabase (aktif)

app/
├── api/
│   ├── nodes/route.ts            ← endpoint node list + status
│   └── readings/
│       ├── route.ts              ← time series endpoint
│       ├── live/route.ts         ← latest readings endpoint
│       └── history/route.ts      ← paginated history endpoint

hooks/
├── use-soil-data.ts              ← polling hook untuk dashboard

lib/
├── supabase.ts                   ← Supabase client (admin + browser)
├── mock-data.ts                  ← utility functions (CSV, formatting)
└── types.ts                      ← tipe data
```

---

## 9. Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Supabase connection failed | Pastikan `SUPABASE_URL` benar, format `https://xxx.supabase.co` |
| API route returns 401 | Pastikan `SUPABASE_SERVICE_KEY` valid dan tidak dibatasi RLS |
| Data tidak muncul di dashboard | Cek bridge running, cek ESP32 publishing ke MQTT, cek tabel di Supabase SQL Editor |
| MQTT connection refused | Pastikan `wss://` dan port 8884 |
| RLS blocking API route | Service role key bypasses RLS; pastikan tidak menggunakan anon key di API route |
| Polling terlalu lambat | Kurangi `POLL_INTERVAL_MS` di `hooks/use-soil-data.ts` (saat ini 30000ms) |
| Bridge sering disconnect | Tingkatkan `connectTimeout`, cek stabilitas internet |
| Certificate error di Node.js | Set `MQTT_REJECT_UNAUTHORIZED=false` untuk dev |
| Moisture selalu 0 atau 100 | Kalibrasi ulang rumus ADC di kode ESP32 |

---

## 10. Migrasi dari Neon.tech ke Supabase

Jika sebelumnya menggunakan Neon.tech, migrasi data:

```sql
-- Export dari Neon (psql)
\copy (SELECT * FROM sensor_readings ORDER BY measured_at) TO '/tmp/readings.csv' CSV HEADER;

-- Import ke Supabase
\copy public.sensor_readings FROM '/tmp/readings.csv' CSV HEADER;
```

Atau gunakan pgAdmin/dBeaver untuk export-import antar PostgreSQL.
