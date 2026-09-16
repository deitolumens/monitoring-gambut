# Setup MQTT Node A ke Supabase

Dokumen ini menjelaskan alur data sensor nyata ke dashboard:

```text
Node A -> MQTT broker -> scripts/mqtt-bridge-supabase.ts -> Supabase -> Next.js API -> dashboard
```

Dashboard tidak lagi menggunakan data pembacaan mock. Bridge menyimpan setiap pembacaan ke tabel `sensor_readings`, lalu API dashboard mengambil data tersebut dari Supabase.

## 1. Prasyarat

- Node.js 18 atau lebih baru
- Project Supabase aktif
- MQTT broker aktif, misalnya HiveMQ Cloud
- Node A dapat publish ke broker

Install dependency jika belum tersedia:

```bash
npm install
npm install -D tsx
```

## 2. Konfigurasi Supabase

1. Buka Supabase SQL Editor.
2. Jalankan isi [`database-schema-supabase.sql`](./database-schema-supabase.sql).
3. Pastikan baris node berikut tersedia:

```sql
SELECT id, is_active, mqtt_topic
FROM public.nodes
WHERE id = 'A';
```

Node A menggunakan topic `peatland/nodeA/data` secara default.

## 3. Environment

Buat file `.env.local` untuk aplikasi Next.js dan file `.env` untuk bridge. Jangan commit kedua file tersebut karena berisi service role key.

### `.env.local`

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
```

### `.env` bridge

```env
MQTT_URL=wss://5983d80f70534c6b89c3343d2a478e3a.s1.eu.hivemq.cloud:8884/mqtt
MQTT_USERNAME=your-mqtt-username
MQTT_PASSWORD=your-mqtt-password
MQTT_TOPIC=peatland/+/data
MQTT_REJECT_UNAUTHORIZED=true

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

Untuk HiveMQ Cloud via WebSocket Secure, gunakan URL dengan path `/mqtt` seperti di atas. Port `8883` digunakan untuk MQTT TLS biasa; konfigurasi ini memakai WebSocket Secure port `8884`.

## 4. Payload Node A

Bridge mendukung satu pembacaan per pesan:

```json
{
  "nodeId": "A",
  "depth": 50,
  "moisture": 62.3,
  "rawValue": 740,
  "timestamp": "2026-09-16T14:32:00Z"
}
```

Bridge juga mendukung beberapa kedalaman dalam satu pesan. `nodeId` dapat dihilangkan jika topic sudah mengandung `nodeA`:

```json
{
  "timestamp": "2026-09-16T14:32:00Z",
  "readings": [
    { "depth": 50, "moisture": 62.3, "rawValue": 740 },
    { "depth": 100, "moisture": 58.1, "rawValue": 695 },
    { "depth": 150, "moisture": 54.7, "rawValue": 650 }
  ]
}
```

Nilai `depth` yang diterima adalah `50`, `100`, atau `150`. Nilai `moisture` harus berada pada rentang `0` sampai `100`. Pesan yang tidak valid dicatat di log bridge dan tidak dimasukkan ke database.

## 5. Menjalankan sistem

Terminal 1, jalankan dashboard:

```bash
npm run dev
```

Terminal 2, jalankan bridge:

```bash
npx tsx scripts/mqtt-bridge-supabase.ts
```

Bridge akan subscribe ke `MQTT_TOPIC`, reconnect otomatis setiap 5 detik, dan mencetak baris seperti berikut saat data tersimpan:

```text
[SUPABASE] Stored: Node A | 50cm | 62.3%
```

Dashboard melakukan refresh data setiap 30 detik. Endpoint yang digunakan adalah:

```text
GET /api/readings/live?node=A
GET /api/readings?node=A&hours=24
GET /api/readings/history?node=A&limit=48&offset=0
```

## 6. Verifikasi

Pastikan bridge menerima pesan, lalu jalankan query ini di Supabase SQL Editor:

```sql
SELECT node_id, depth_cm, moisture, raw_value, measured_at, received_at
FROM public.sensor_readings
WHERE node_id = 'A'
ORDER BY measured_at DESC
LIMIT 10;
```

Kemudian buka dashboard dan pilih Node A. Jika tabel berisi data tetapi dashboard kosong, periksa `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, dan response endpoint API di browser.

## 7. Troubleshooting singkat

| Gejala | Pemeriksaan |
|---|---|
| Bridge tidak connect | Cek `MQTT_URL`, username, password, dan port TLS broker. |
| Pesan invalid | Cek topic dan field `depth`/`moisture`; lihat log `[MQTT] Invalid payload`. |
| Foreign key error | Pastikan node `A` sudah ada di tabel `public.nodes`. |
| Data ada di Supabase tetapi status offline | Status dashboard aktif jika ada pembacaan baru dalam 5 menit terakhir. |
| Service key bocor | Rotate key di Supabase dan perbarui `.env`; service role key hanya boleh dipakai server-side. |
