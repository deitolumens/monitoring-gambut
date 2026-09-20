# Integrasi Sistem Monitoring Lahan Gambut

Arsitektur aktif project ini adalah:

```text
ESP32 -> HTTPS REST Supabase -> sensor_readings -> v_sensor_terkalibrasi -> Next.js API -> Dashboard
```

Dashboard tidak melakukan subscribe atau koneksi ke broker MQTT. Dashboard
melakukan polling API Next.js setiap 30 detik. Data mentah disimpan di
`sensor_readings`, sedangkan API membaca hasil koreksi dari view
`v_sensor_terkalibrasi`.

Dokumentasi setup lengkap, contoh payload, RLS policy, contoh firmware ESP32,
dan troubleshooting tersedia di [`MQTT-SUPABASE-SETUP.md`](./MQTT-SUPABASE-SETUP.md).

## Komponen aplikasi

- [`app/api/nodes/route.ts`](../app/api/nodes/route.ts) mengambil daftar node dan waktu data terakhir dari Supabase.
- [`app/api/readings/live/route.ts`](../app/api/readings/live/route.ts) mengambil pembacaan terbaru untuk setiap kedalaman.
- [`app/api/readings/route.ts`](../app/api/readings/route.ts) mengambil time-series berdasarkan rentang jam.
- [`app/api/readings/history/route.ts`](../app/api/readings/history/route.ts) mengambil histori dengan pagination.
- [`hooks/use-soil-data.ts`](../hooks/use-soil-data.ts) menggabungkan endpoint dan melakukan polling 30 detik.
- [`docs/database-schema-supabase.sql`](./database-schema-supabase.sql) membuat tabel, constraint, index, dan RLS policy.

## Keamanan kunci

- `SUPABASE_SERVICE_KEY` hanya berada di environment server Next.js.
- ESP32 hanya menggunakan `SUPABASE_ANON_KEY` melalui HTTPS.
- MQTT bridge dan file MQTT lama dipertahankan sebagai artefak migrasi, tetapi
  bukan bagian dari alur dashboard aktif.
