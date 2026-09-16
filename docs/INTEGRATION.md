# Integrasi MQTT & Database — Sistem Monitoring Lahan Gambut

Dokumentasi lengkap untuk menghubungkan data sensor kelembaban tanah dari broker MQTT (HiveMQ Cloud) ke database Neon.tech PostgreSQL, dan menampilkannya di dashboard.

---

## 1. Arsitektur Sistem

```
 ┌──────────────┐     MQTT/WSS      ┌───────────────┐     INSERT      ┌──────────────┐
 │  IoT Node    │ ──────────────►   │   MQTT Bridge │ ─────────────►  │  Neon.tech   │
 │  (ESP32/     │   pub: topic      │   (Node.js)   │   sensor_       │  PostgreSQL  │
 │   ESP8266)   │                   │   subscriber  │   readings      │              │
 └──────────────┘                   └───────────────┘                  └──────┬───────┘
       │                                                                     │
       │  3 capacitive sensors                                                │ SELECT
       │  (50cm, 100cm, 150cm)                                                │
       │                                                                     ▼
       │                                                             ┌──────────────┐
       │                                                             │  Next.js     │
       │                                                             │  Dashboard   │
       │                                                             └──────────────┘
```

**Alur data:**

1. **IoT Node** (ESP32/ESP8266) membaca 3 sensor kapasitif pada kedalaman 50cm, 100cm, dan 150cm.
2. Node mempublish data JSON ke topik MQTT broker HiveMQ Cloud melalui koneksi WebSocket Secure (WSS).
3. **MQTT Bridge** (skrip Node.js) berlangganan ke topik MQTT, menerima setiap pesan, dan menyimpannya ke tabel `sensor_readings` di Neon.tech.
4. **Dashboard Next.js** melakukan query ke Neon.tech untuk menampilkan data real-time, grafik tren, dan tabel historis.

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

> **Catatan:** Port 8884 khusus untuk koneksi WebSocket Secure (WSS). Berbeda dengan port 8883 yang menggunakan TLS native. Browser dan Node.js menggunakan WSS untuk koneksi MQTT.

### 2.2. Struktur Topik MQTT

Gunakan topik hierarkis untuk memisahkan data per node:

```
peatland/nodeA/data   →  Node A mengirim data sensor
peatland/nodeB/data   →  Node B mengirim data sensor
peatland/nodeC/data   →  Node C mengirim data sensor
```

Bridge berlangganan ke wildcard `peatland/+/data` untuk menerima dari semua node sekaligus.

### 2.3. Format Pesan MQTT (JSON)

Setiap pesan yang dipublish oleh IoT node harus berformat JSON:

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
| `rawValue`  | number | Tidak | Nilai mentah dari ADC sensor (opsional, untuk kalibrasi) |
| `timestamp` | string | Tidak | Waktu pengukuran dalam format ISO 8601. Jika kosong, bridge menggunakan waktu server. |

---

## 3. Konfigurasi Database (Neon.tech)

### 3.1. Membuat Database di Neon.tech

1. Buka [https://neon.tech](https://neon.tech) dan login / daftar.
2. Klik **New Project** → beri nama (mis. "peatland-monitor").
3. Pilih region terdekat (Singapore untuk Indonesia).
4. Setelah project dibuat, salin **Connection String** dari dashboard.
   Format: `postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`

### 3.2. Menjalankan Skema Database

Buka **SQL Editor** di dashboard Neon.tech, atau gunakan `psql`:

```bash
psql "postgresql://user:password@ep-xxx.neon.tech/peatland?sslmode=require" -f docs/database-schema.sql
```

Skema membuat 3 tabel:

| Tabel                  | Kegunaan |
|------------------------|----------|
| `nodes`                | Metadata setiap node (lokasi, status aktif, topik MQTT) |
| `sensor_readings`      | Data pengukuran kelembaban (satu baris per pengukuran per kedalaman) |
| `mqtt_connection_log`  | Log event koneksi MQTT bridge (connect/disconnect/error) |

Tabel `sensor_readings` memiliki constraint yang memastikan:
- `depth_cm` hanya bernilai 50, 100, atau 150
- `moisture` berada di rentang 0–100
- Index pada `(node_id, measured_at DESC)` untuk query dashboard yang cepat

### 3.3. Query yang Digunakan Dashboard

**Data terbaru per node per kedalaman:**
```sql
SELECT DISTINCT ON (depth_cm)
  node_id, depth_cm, moisture, measured_at
FROM sensor_readings
WHERE node_id = 'A'
ORDER BY depth_cm, measured_at DESC;
```

**Data time-series 24 jam terakhir:**
```sql
SELECT
  measured_at,
  depth_cm,
  moisture
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
LIMIT 50 OFFSET 0;
```

---

## 4. MQTT Bridge Service

Bridge adalah program Node.js yang berjalan terus-menerus sebagai "jembatan" antara MQTT broker dan database.

### 4.1. Instalasi

```bash
npm install mqtt pg dotenv
npm install -D tsx @types/pg
```

### 4.2. Konfigurasi Environment

Salin template dan isi kredensial asli:

```bash
cp docs/.env.mqtt-bridge .env
```

Edit `.env`:
```env
MQTT_URL=wss://5983d80f70534c6b89c3343d2a478e3a.s1.eu.hivemq.cloud:8884
MQTT_USERNAME=username_anda
MQTT_PASSWORD=password_anda
MQTT_TOPIC=peatland/+/data
DATABASE_URL=postgresql://user:password@ep-xxx.neon.tech/peatland?sslmode=require
```

### 4.3. Menjalankan Bridge

**Development:**
```bash
npx tsx scripts/mqtt-bridge.ts
```

**Production dengan PM2:**
```bash
npm install -g pm2
pm2 start "npx tsx scripts/mqtt-bridge.ts" --name mqtt-bridge
pm2 save
pm2 startup
```

**Production dengan Docker:**
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm install tsx
CMD ["npx", "tsx", "scripts/mqtt-bridge.ts"]
```

```bash
docker build -t peatland-bridge .
docker run -d --name bridge --env-file .env peatland-bridge
```

### 4.4. Cara Kerja Bridge

```
1. Connect ke MQTT broker (WSS) ─────────────────►  HiveMQ Cloud
2. Subscribe ke topic "peatland/+/data" ─────────►  menerima semua node
3. Setiap pesan masuk:
   a. Parse JSON payload
   b. Validasi: nodeId, depth (50/100/150), moisture (0-100)
   c. INSERT ke tabel sensor_readings
   d. Log ke console: "Stored: Node A | 50cm | 62.3%"
4. Jika koneksi terputus, auto-reconnect setiap 5 detik
5. Jika error, log ke mqtt_connection_log
```

---

## 5. Kode ESP32 (IoT Node) — Contoh

Berikut adalah contoh kode untuk ESP32 yang membaca sensor dan mempublish ke MQTT:

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>

// ── WiFi ──
const char* WIFI_SSID = "your_wifi_ssid";
const char* WIFI_PASS = "your_wifi_password";

// ── MQTT (HiveMQ Cloud WSS) ──
const char* MQTT_HOST = "5983d80f70534c6b89c3343d2a478e3a.s1.eu.hivemq.cloud";
const int   MQTT_PORT = 8884;
const char* MQTT_USER = "your_hivemq_username";
const char* MQTT_PASS = "your_hivemq_password";
const char* NODE_ID   = "A";

// ── Sensor pins (capacitive soil moisture) ──
const int SENSOR_50  = 34;  // ADC1_CH6
const int SENSOR_100 = 35;  // ADC1_CH7
const int SENSOR_150 = 32;  // ADC1_CH4

WiFiClientSecure espClient;
PubSubClient client(espClient);

void publishReading(int depth, int pin) {
  int raw = analogRead(pin);
  // Konversi: nilai ADC (0-4095) → moisture (0-100%)
  // Capacitive sensor: nilai rendah = basah, nilai tinggi = kering
  float moisture = map(raw, 4095, 0, 0, 100);
  moisture = constrain(moisture, 0, 100);

  StaticJsonDocument<128> doc;
  doc["nodeId"]    = NODE_ID;
  doc["depth"]     = depth;
  doc["moisture"]  = round(moisture * 10) / 10.0;
  doc["rawValue"]  = raw;

  char buffer[128];
  serializeJson(doc, buffer);

  String topic = "peatland/node" + String(NODE_ID) + "/data";
  client.publish(topic.c_str(), buffer);
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  espClient.setInsecure();  // untuk dev; gunakan CA cert untuk produksi
  client.setServer(MQTT_HOST, MQTT_PORT);
}

void loop() {
  if (!client.connected()) {
    while (!client.connect("esp32-nodeA", MQTT_USER, MQTT_PASS)) {
      delay(5000);
    }
  }
  client.loop();

  // Baca dan kirim data setiap 60 detik
  publishReading(50,  SENSOR_50);
  delay(100);
  publishReading(100, SENSOR_100);
  delay(100);
  publishReading(150, SENSOR_150);

  delay(60000);  // 1 menit
}
```

---

## 6. Menghubungkan Dashboard ke Neon.tech

Dashboard saat ini menggunakan data simulasi (`lib/mock-data.ts`). Untuk beralih ke data nyata dari Neon.tech, buat sebuah API route di Next.js:

### 6.1. Install dependency Neon

```bash
npm install @neondatabase/serverless
```

### 6.2. Buat API Route

Buat file `app/api/readings/route.ts`:

```typescript
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nodeId = searchParams.get("node") ?? "A";
  const hours = searchParams.get("hours") ?? "24";

  const latest = await sql`
    SELECT DISTINCT ON (depth_cm)
      node_id, depth_cm, moisture, measured_at
    FROM sensor_readings
    WHERE node_id = ${nodeId}
    ORDER BY depth_cm, measured_at DESC
  `;

  const timeseries = await sql`
    SELECT measured_at, depth_cm, moisture
    FROM sensor_readings
    WHERE node_id = ${nodeId}
      AND measured_at > NOW() - INTERVAL '${hours} hours'
    ORDER BY measured_at ASC
  `;

  return Response.json({ latest, timeseries });
}
```

### 6.3. Update Dashboard untuk Fetch Data Real

Ganti pemanggilan `getCurrentReadings()` dan `getTimeSeriesData()` dengan `fetch("/api/readings?node=A")` di dalam `useEffect`.

---

## 7. Checklist Deployment

| Langkah | Status |
|---------|--------|
| Buat akun HiveMQ Cloud, dapatkan username & password | ☐ |
| Buat database di Neon.tech, jalankan `docs/database-schema.sql` | ☐ |
| Isi `.env` dengan kredensial MQTT dan Neon.tech | ☐ |
| Install dependency bridge: `npm install mqtt pg dotenv tsx @types/pg` | ☐ |
| Jalankan bridge: `npx tsx scripts/mqtt-bridge.ts` | ☐ |
| Flash kode ESP32 ke node, verifikasi data masuk ke database | ☐ |
| Install `@neondatabase/serverless`, buat API route | ☐ |
| Update dashboard untuk fetch dari API alih-alih mock data | ☐ |
| Deploy bridge ke VPS/Railway/Render (atau PM2 di Raspberry Pi) | ☐ |
| Deploy Next.js dashboard ke Netlify/Vercel | ☐ |

---

## 8. Struktur File Dokumentasi

```
docs/
├── INTEGRATION.md          ← dokumentasi ini
├── database-schema.sql     ← skema SQL untuk Neon.tech
└── .env.mqtt-bridge        ← template environment variables

scripts/
└── mqtt-bridge.ts          ← bridge service (MQTT → Database)
```

---

## 9. Troubleshooting

| Masalah | Solusi |
|---------|--------|
| MQTT connection refused | Pastikan menggunakan `wss://` (bukan `ssl://`), port 8884 |
| Certificate error di Node.js | Set `MQTT_REJECT_UNAUTHORIZED=false` untuk dev |
| Database connection timeout | Pastikan `?sslmode=require` ada di connection string Neon |
| Data tidak masuk database | Cek log bridge, pastikan format JSON sesuai dan constraint terpenuhi |
| Moisture selalu 0 atau 100 | Kalibrasi ulang rumus konversi ADC di kode ESP32 |
| Bridge sering disconnect | Tingkatkan `connectTimeout` atau cek stabilitas internet |
