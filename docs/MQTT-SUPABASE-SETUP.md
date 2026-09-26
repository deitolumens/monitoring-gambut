# Koordinator ESP-NOW ke Supabase

Dokumen ini menjelaskan alur final project. Node 1 dan Node 3 hanya mengukur
sensor lalu mengirim hasil ke Node 2 melalui ESP-NOW. Node 2 menjadi koordinator,
menyimpan data sementara di NVS, lalu mengirim satu siklus lengkap ke Supabase
melalui HTTPS REST API. Dashboard Next.js hanya membaca data dari Supabase.

```text
Node 1/3 + sensor
  | ESP-NOW
  v
Node 2 (koordinator + sensor)
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
pernah dijalankan, jalankan ulang file tersebut agar kolom `cycle_id`, view
status siklus, indeks deduplikasi, dan policy payload final tersedia.

Gunakan konfigurasi berikut pada tiga ESP32 yang berbeda:

| Perangkat | `NODE_ID` | Peran | Koneksi |
|---|---|---|---|
| Node 1 | `A` | Sensor ESP-NOW | Ke Node 2 |
| Node 2 | `B` | Koordinator + sensor + uploader | Wi-Fi dan ESP-NOW |
| Node 3 | `C` | Sensor ESP-NOW | Ke Node 2 |

Hanya firmware Node 2 yang menggunakan URL Supabase dan `SUPABASE_ANON_KEY`.
Node 1 dan Node 3 tidak mengirim langsung ke Supabase. Jangan memakai
`SUPABASE_SERVICE_KEY` pada salah satu ESP32.

Schema membuat RLS policy yang mengizinkan role `anon` melakukan `INSERT` ke
`sensor_readings` dengan validasi `cycle_id`, node/kedalaman, dan kelembaban.
Jangan pernah
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

Node 2 mengirim tepat 9 baris JSON untuk satu siklus ke endpoint berikut:

```text
POST https://your-project.supabase.co/rest/v1/sensor_readings
```

Contoh body satu pembacaan:

```json
{
  "node_id": "A",
  "cycle_id": 29563200,
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
Prefer: resolution=ignore-duplicates,return=minimal
```

Nilai `depth_cm` hanya `50`, `100`, atau `150`. Nilai `moisture` harus berada
di antara `0` dan `100`. `cycle_id` adalah menit Unix UTC yang sama untuk 9
baris dalam satu siklus. `received_at` diisi otomatis oleh database.

Payload harus berisi kombinasi unik berikut:

```text
A/50, A/100, A/150,
B/50, B/100, B/150,
C/50, C/100, C/150
```

Jalankan [`database-schema-supabase.sql`](./database-schema-supabase.sql) di
Supabase SQL Editor. View `v_measurement_cycle_status` menunjukkan apakah
satu `cycle_id` sudah lengkap dengan 9 baris.

## 4. Firmware alat

Firmware Node 1/3 dan koordinator Node 2 tersedia di
[`ESP-NOW-COORDINATOR-DRAFT.md`](./ESP-NOW-COORDINATOR-DRAFT.md). Hanya Node 2
yang menggunakan Wi-Fi ke router, NTP, dan endpoint Supabase. Node 1 dan Node 3
hanya mengirim paket ESP-NOW ke Node 2 setelah menerima request.

Koordinator mengirim satu payload berisi 9 baris per siklus. Setiap baris wajib
memiliki `node_id`, `cycle_id`, `depth_cm`, `moisture`, `raw_value`, dan
`measured_at`. Jika upload gagal, koordinator mengulang payload yang sama;
unique index pada schema membuat retry tidak menggandakan data.

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

Periksa kelengkapan satu siklus:

```sql
SELECT cycle_id, measured_at, reading_count, node_count,
       depth_count, node_depth_count, status
FROM public.v_measurement_cycle_status
WHERE cycle_id = 29563200;
```

Siklus lengkap harus menghasilkan `reading_count = 9`, `node_count = 3`,
`depth_count = 3`, `node_depth_count = 9`, dan `status = 'complete'`.

4. Jalankan dashboard dan pilih Node A, Node B, atau Node C.
5. Tunggu maksimal 30 detik atau gunakan tombol Retry.

## 7. Troubleshooting

| Gejala | Pemeriksaan |
|---|---|
| ESP32 mendapat `401` atau `403` | Pastikan `apikey`, bearer token, URL, dan policy RLS benar. Gunakan anon key, bukan service key. |
| ESP32 mendapat `400` | Periksa nama kolom, format timestamp ISO 8601, depth, dan rentang moisture. |
| Data ada di Supabase tetapi dashboard kosong | Periksa `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, dan endpoint `/api/readings/live`. |
| Status dashboard “No recent data” | Pastikan `measured_at` memakai waktu UTC yang benar dan pembacaan terbaru kurang dari lima menit. |
| Data dobel | Pastikan `cycle_id`, `node_id`, dan `depth_cm` benar; unique index `uq_readings_node_cycle_depth` mencegah retry menjadi baris ganda. |

## 8. Catatan migrasi MQTT

File bridge MQTT lama tetap ada sebagai artefak migrasi dan tidak dijalankan
oleh dashboard. Arsitektur final memakai ESP-NOW antara node dan Node 2, lalu
HTTPS REST dari Node 2 ke Supabase. MQTT, topic, `PubSubClient`, dan
`scripts/mqtt-bridge-supabase.ts` tidak diperlukan untuk alur ini.
