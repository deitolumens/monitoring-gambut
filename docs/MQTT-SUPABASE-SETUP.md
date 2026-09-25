# ESP32 Langsung ke Supabase

Dokumen ini adalah alur yang digunakan project saat ini. ESP32 mengirim data
langsung ke Supabase melalui HTTPS REST API. Dashboard Next.js hanya membaca
data dari Supabase melalui API route dan tidak subscribe ke broker MQTT.

```text
ESP32 + sensor
    | HTTPS POST /rest/v1/sensor_readings
    v
Supabase PostgreSQL (sensor_readings)
    ^
    | Next.js API route membaca `v_sensor_terkalibrasi`, polling setiap 30 detik
    v
Dashboard
```

## 1. Siapkan Supabase

1. Buat project Supabase.
2. Jalankan [`database-schema-supabase.sql`](./database-schema-supabase.sql) di SQL Editor.
3. Pastikan node sudah terdaftar:

```sql
SELECT id, label, is_active
FROM public.nodes
WHERE id = 'A';
```

4. Ambil `Project URL` dan `anon public key` dari **Project Settings > API**.

Schema mendaftarkan dan mengaktifkan Node A, B, dan C. Jika schema lama sudah
pernah dijalankan, jalankan ulang file tersebut agar view dashboard dibuat dan
status Node B/C diperbarui menjadi aktif.

Gunakan konfigurasi berikut pada tiga ESP32 yang berbeda:

| Perangkat | `NODE_ID` | Node database | Topic opsional |
|---|---|---|---|
| ESP32 pertama | `A` | Node A | `peatland/nodeA/data` |
| ESP32 kedua | `B` | Node B | `peatland/nodeB/data` |
| ESP32 ketiga | `C` | Node C | `peatland/nodeC/data` |

Firmware direct-to-Supabase hanya perlu mengubah `NODE_ID` pada masing-masing
perangkat. Jangan memakai `SUPABASE_SERVICE_KEY` pada salah satu ESP32.

Schema membuat RLS policy yang mengizinkan role `anon` melakukan `INSERT` ke
`sensor_readings` dengan validasi kedalaman dan kelembaban. Jangan pernah
memasukkan `SUPABASE_SERVICE_KEY` ke firmware ESP32.

## 2. Konfigurasi dashboard

Buat `.env.local` berdasarkan `.env.supabase.example`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
```

`SUPABASE_SERVICE_KEY` hanya digunakan server-side oleh API route. Dashboard
tidak membutuhkan URL, username, password, topic, atau dependency MQTT.

Jalankan dashboard:

```bash
npm install
npm run dev
```

## 3. Format data yang dikirim ESP32

ESP32 mengirim satu atau beberapa baris JSON ke endpoint berikut:

```text
POST https://your-project.supabase.co/rest/v1/sensor_readings
```

Contoh body satu pembacaan:

```json
{
  "node_id": "A",
  "depth_cm": 50,
  "moisture": 62.3,
  "raw_value": 740,
  "measured_at": "2026-09-18T07:32:00Z"
}
```

Header yang wajib dikirim:

```text
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
Content-Type: application/json
Prefer: return=minimal
```

Nilai `depth_cm` hanya `50`, `100`, atau `150`. Nilai `moisture` harus berada
di antara `0` dan `100`. `received_at` diisi otomatis oleh database.

## 4. Contoh kode ESP32

Contoh berikut memakai `WiFi.h`, `HTTPClient.h`, dan `ArduinoJson.h`. Kirim
tiga kedalaman sebagai array agar satu siklus sensor menjadi satu request.

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "your_wifi_ssid";
const char* WIFI_PASS = "your_wifi_password";
const char* SUPABASE_URL = "https://your-project.supabase.co";
const char* SUPABASE_ANON_KEY = "your-anon-public-key";
// Gunakan "A", "B", atau "C"; setiap ESP32 harus memiliki NODE_ID unik.
const char* NODE_ID = "A";

const int SENSOR_50 = 34;
const int SENSOR_100 = 35;
const int SENSOR_150 = 32;

float readMoisture(int pin) {
  int raw = analogRead(pin);
  return constrain((4095.0f - raw) * 100.0f / 4095.0f, 0.0f, 100.0f);
}

void sendReadings() {
  HTTPClient http;
  String endpoint = String(SUPABASE_URL) + "/rest/v1/sensor_readings";
  http.begin(endpoint);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  DynamicJsonDocument body(768);
  JsonArray readings = body.to<JsonArray>();
  int pins[] = {SENSOR_50, SENSOR_100, SENSOR_150};
  int depths[] = {50, 100, 150};

  for (int i = 0; i < 3; i++) {
    int raw = analogRead(pins[i]);
    JsonObject reading = readings.createNestedObject();
    reading["node_id"] = NODE_ID;
    reading["depth_cm"] = depths[i];
    reading["moisture"] = readMoisture(pins[i]);
    reading["raw_value"] = raw;
    reading["measured_at"] = "2026-09-18T07:32:00Z"; // replace with NTP time
  }

  String payload;
  serializeJson(body, payload);
  int status = http.POST(payload);
  Serial.printf("Supabase response: %d\n", status);
  http.end();
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) sendReadings();
  delay(60000);
}
```

Pada implementasi nyata, sinkronkan waktu ESP32 dengan NTP sebelum mengisi
`measured_at`. Jika waktu tidak tersedia, gunakan waktu server dengan mengubah
kolom database agar memiliki default `NOW()` atau kirim timestamp yang valid.

## 5. Cara dashboard membaca data

Hook [`use-soil-data.ts`](../hooks/use-soil-data.ts) melakukan polling setiap
30 detik ke endpoint berikut:

```text
GET /api/nodes
GET /api/readings/live?node=A
GET /api/readings?node=A&hours=24
GET /api/readings/history?node=A&limit=48&offset=0
```

Setiap endpoint pembacaan mengambil data dari view `v_sensor_terkalibrasi`
melalui `supabaseAdmin` di server Next.js. Data mentah tetap ditulis ke tabel
`sensor_readings`, lalu parameter koefisien diterapkan oleh view tersebut.
Browser tidak mengetahui service role key dan tidak membuat koneksi MQTT.
Status node pada dashboard berarti ada data Supabase dalam lima menit
terakhir, bukan status koneksi broker.

## 6. Verifikasi end-to-end

1. Flash firmware ESP32 dan buka Serial Monitor.
2. Pastikan response POST bernilai `201` atau `200`.
3. Periksa data di Supabase:

```sql
SELECT node_id, depth_cm, moisture, raw_value, measured_at, received_at
FROM public.v_sensor_terkalibrasi
WHERE node_id = 'A'
ORDER BY measured_at DESC
LIMIT 10;
```

4. Jalankan dashboard dan pilih Node A, Node B, atau Node C.
5. Tunggu maksimal 30 detik atau gunakan tombol Retry.

## 7. Troubleshooting

| Gejala | Pemeriksaan |
|---|---|
| ESP32 mendapat `401` atau `403` | Pastikan `apikey`, bearer token, URL, dan policy RLS benar. Gunakan anon key, bukan service key. |
| ESP32 mendapat `400` | Periksa nama kolom, format timestamp ISO 8601, depth, dan rentang moisture. |
| Data ada di Supabase tetapi dashboard kosong | Periksa `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, dan endpoint `/api/readings/live`. |
| Status dashboard “No recent data” | Pastikan `measured_at` memakai waktu UTC yang benar dan pembacaan terbaru kurang dari lima menit. |
| Data dobel | Kirim satu batch per siklus dan pertimbangkan menambahkan `device_message_id` unik jika diperlukan. |

## 8. Catatan migrasi MQTT

File bridge MQTT lama tetap ada sebagai artefak migrasi dan tidak dijalankan
oleh dashboard. Untuk arsitektur direct-to-Supabase, ESP32 tidak perlu broker,
topic, `PubSubClient`, atau `scripts/mqtt-bridge-supabase.ts`.
