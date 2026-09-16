# Contoh Payload MQTT Node A

## Topic

Alat Node A harus publish ke topic berikut:

```text
peatland/nodeA/data
```

Bridge berlangganan wildcard `peatland/+/data`, sehingga topic ini akan diterima.

## Format yang direkomendasikan

Kirim satu payload berisi tiga sensor setelah semua sensor selesai dibaca:

```json
{
  "nodeId": "A",
  "timestamp": "2026-09-16T14:32:00Z",
  "readings": [
    { "depth": 50, "moisture": 62.3, "rawValue": 740 },
    { "depth": 100, "moisture": 58.1, "rawValue": 695 },
    { "depth": 150, "moisture": 54.7, "rawValue": 650 }
  ]
}
```

## Format satu sensor per pesan

Jika alat mengirim sensor satu per satu, publish tiga pesan ke topic yang sama:

```json
{
  "nodeId": "A",
  "depth": 50,
  "moisture": 62.3,
  "rawValue": 740,
  "timestamp": "2026-09-16T14:32:00Z"
}
```

Ulangi dengan `depth` `100` dan `150` untuk dua sensor lainnya.

## Field

| Field | Wajib | Nilai |
| --- | --- | --- |
| `nodeId` | Ya, kecuali topic memakai `nodeA` | `A` |
| `depth` | Ya | `50`, `100`, atau `150` cm |
| `moisture` | Ya | Angka `0` sampai `100` persen |
| `rawValue` | Tidak | Nilai ADC mentah alat |
| `timestamp` | Tidak | ISO 8601, contoh `2026-09-16T14:32:00Z` |

Jika timestamp tidak dikirim, bridge memakai waktu saat pesan diterima. Jika `nodeId` tidak dikirim, topic `peatland/nodeA/data` akan dipetakan menjadi node `A`.

## Contoh publish dengan MQTTX atau mosquitto

```bash
mosquitto_pub -h 5983d80f70534c6b89c3343d2a478e3a.s1.eu.hivemq.cloud \
  -p 8884 --protocol mqtt --cafile ca.crt \
  -u "USERNAME" -P "PASSWORD" \
  -t "peatland/nodeA/data" \
  -m '{"nodeId":"A","depth":50,"moisture":62.3,"rawValue":740}'
```

Untuk MQTTX, pilih koneksi WSS dengan URL:

```text
wss://5983d80f70534c6b89c3343d2a478e3a.s1.eu.hivemq.cloud:8884/mqtt
```

Lalu gunakan topic `peatland/nodeA/data` dan payload JSON di atas.
