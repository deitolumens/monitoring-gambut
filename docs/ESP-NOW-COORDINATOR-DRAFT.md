# Draft Arsitektur Koordinator ESP-NOW

Dokumen ini adalah draft firmware untuk arsitektur berikut:

```text
Node 1 (A) -- ESP-NOW --> Node 2 (B/Koordinator) <-- ESP-NOW -- Node 3 (C)
            |
          Wi-Fi/HTTPS
            |
            Supabase
```

Node 2 berfungsi ganda sebagai node sensor dan koordinator. Setiap menit Node 2
mengukur sensor lokal dan mengirim perintah ukur ke Node 1 dan Node 3 melalui
ESP-NOW. Ketiga hasil disimpan di Node 2. Pada menit kelima, setiap siklus yang
belum dikirim diunggah sebagai satu POST berisi 9 baris ke Supabase. Posisi Node 2 di tengah membantu
jarak radio, tetapi bukan jaminan paket selalu berhasil; ACK, retry, dan
timeout tetap diperlukan.

## Protokol paket

Paket ESP-NOW menggunakan struct biner berukuran kecil, bukan JSON. JSON hanya
dibuat oleh koordinator saat upload ke Supabase.

```cpp
enum PacketType : uint8_t {
  MEASURE_REQUEST = 1,
  MEASUREMENT_RESULT = 2,
  MEASUREMENT_ACK = 3
};

struct Measurement {
  uint16_t depthCm;
  uint16_t rawValue;
  float moisture;
};

struct EspNowPacket {
  uint8_t type;
  uint8_t nodeId;
  uint32_t cycleId;
  uint32_t measuredAtEpoch;
  uint8_t count;
  Measurement readings[3];
};
```

`cycleId` meningkat setiap menit. `measuredAtEpoch` adalah Unix time UTC yang
ditentukan koordinator. Nilai `nodeId` yang digunakan dalam draft ini adalah
`1 = A`, `2 = B`, dan `3 = C`. Node 2 memakai `nodeId = 2` untuk pembacaan
lokal sekaligus identitas koordinator.

`esp_now_send()` saja belum membuktikan data sudah diterima program koordinator.
Karena itu setiap `MEASUREMENT_RESULT` dibalas koordinator dengan
`MEASUREMENT_ACK` yang membawa `cycleId` dan `nodeId` yang sama. Node mengulang
paket pengukuran yang sama sampai ACK tersebut diterima.

### Pembagian waktu

Hanya Node 2 yang perlu koneksi Wi-Fi ke router/internet dan NTP. Node 2 membuat `cycleId` berdasarkan
menit UTC dan mengisi `measuredAtEpoch` pada `MEASURE_REQUEST`. Node 1 dan Node
3 tidak perlu koneksi jaringan Wi-Fi, NTP, RTC, atau `configTime`; keduanya tetap
mengaktifkan radio Wi-Fi dalam mode `WIFI_STA` untuk ESP-NOW. Keduanya hanya
membaca sensor ketika menerima request, menyalin timestamp dari request ke hasil
pengukuran, dan mengirim hasil tersebut kembali ke Node 2.

## Firmware node sensor

Contoh inti berikut dipasang pada Node 1 dan Node 3. Ubah `NODE_ID`, MAC Node 2,
pin sensor, dan nilai kalibrasi di masing-masing perangkat. Node 2 memakai
bagian firmware koordinator di bawah, bukan firmware node ini. Library yang
diperlukan: `WiFi.h` dan `esp_now.h`. Node 1 dan Node 3 tidak menggunakan NTP;
semua `cycleId` dan `measuredAtEpoch` diterima dari Node 2.

```cpp
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>

const uint8_t NODE_ID = 1; // Node 1 = A; gunakan 3 untuk Node 3 = C
const uint8_t COORDINATOR_MAC[] = {0x24, 0x6F, 0x28, 0xAA, 0xBB, 0xCC};
const int SENSOR_PINS[3] = {34, 35, 32};
const int SENSOR_DEPTHS[3] = {50, 100, 150};
const int DRY_VALUES[3] = {2815, 2886, 2814};
const int WET_VALUES[3] = {1104, 1120, 1088};
const int LED_CONNECTED_PIN = 2;  // ACK dari koordinator masih aktif
const int LED_STANDBY_PIN = 4;    // Menunggu request pengukuran
const int LED_MEASURING_PIN = 16; // Membaca dan mengirim data
const unsigned long COORDINATOR_LINK_TIMEOUT_MS = 70000;

enum PacketType : uint8_t {
  MEASURE_REQUEST = 1,
  MEASUREMENT_RESULT = 2,
  MEASUREMENT_ACK = 3
};

struct Measurement {
  uint16_t depthCm;
  uint16_t rawValue;
  float moisture;
};

struct EspNowPacket {
  uint8_t type;
  uint8_t nodeId;
  uint32_t cycleId;
  uint32_t measuredAtEpoch;
  uint8_t count;
  Measurement readings[3];
};

volatile bool requestPending = false;
volatile uint32_t requestedCycleId = 0;
volatile uint32_t requestedEpoch = 0;
volatile uint32_t acknowledgedCycleId = 0;
bool measurementInProgress = false;
unsigned long lastCoordinatorAckAt = 0;

void updateNodeLeds() {
  bool coordinatorLinkActive = lastCoordinatorAckAt != 0 &&
    millis() - lastCoordinatorAckAt < COORDINATOR_LINK_TIMEOUT_MS;
  digitalWrite(LED_CONNECTED_PIN, coordinatorLinkActive ? HIGH : LOW);
  digitalWrite(LED_STANDBY_PIN,
    !requestPending && !measurementInProgress ? HIGH : LOW);
  digitalWrite(LED_MEASURING_PIN, measurementInProgress ? HIGH : LOW);
}

int readFilteredADC(int pin) {
  const int sampleCount = 20;
  int values[sampleCount];
  for (int i = 0; i < sampleCount; i++) {
    values[i] = analogRead(pin);
    delay(3);
  }

  long sum = 0;
  for (int i = 0; i < sampleCount; i++) sum += values[i];
  return sum / sampleCount;
}

float moisturePercent(int index, int rawValue) {
  float percentage = (rawValue - DRY_VALUES[index]) * 100.0f /
                     (WET_VALUES[index] - DRY_VALUES[index]);
  return constrain(percentage, 0.0f, 100.0f);
}

void onDataReceived(const esp_now_recv_info_t *, const uint8_t *data, int length) {
  if (length != sizeof(EspNowPacket)) return;
  EspNowPacket packet;
  memcpy(&packet, data, sizeof(packet));
  if (packet.type == MEASUREMENT_ACK && packet.nodeId == NODE_ID) {
    acknowledgedCycleId = packet.cycleId;
    return;
  }
  if (packet.type != MEASURE_REQUEST) return;

  requestedCycleId = packet.cycleId;
  requestedEpoch = packet.measuredAtEpoch;
  requestPending = true;
}

void sendMeasurement(uint32_t cycleId, uint32_t measuredAtEpoch) {
  measurementInProgress = true;
  updateNodeLeds();
  EspNowPacket packet{};
  packet.type = MEASUREMENT_RESULT;
  packet.nodeId = NODE_ID;
  packet.cycleId = cycleId;
  packet.measuredAtEpoch = measuredAtEpoch;
  packet.count = 3;

  for (int i = 0; i < 3; i++) {
    int rawValue = readFilteredADC(SENSOR_PINS[i]);
    packet.readings[i] = {
      static_cast<uint16_t>(SENSOR_DEPTHS[i]),
      static_cast<uint16_t>(rawValue),
      moisturePercent(i, rawValue)
    };
  }

  acknowledgedCycleId = 0;
  while (acknowledgedCycleId != cycleId) {
    esp_now_send(COORDINATOR_MAC, reinterpret_cast<uint8_t *>(&packet), sizeof(packet));
    unsigned long waitStarted = millis();
    while (acknowledgedCycleId != cycleId && millis() - waitStarted < 1000) {
      delay(10);
    }
    Serial.println(acknowledgedCycleId == cycleId
      ? "Pengukuran di-ACK koordinator"
      : "ACK belum diterima, mengirim ulang");
  }
  lastCoordinatorAckAt = millis();
  measurementInProgress = false;
  updateNodeLeds();
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_CONNECTED_PIN, OUTPUT);
  pinMode(LED_STANDBY_PIN, OUTPUT);
  pinMode(LED_MEASURING_PIN, OUTPUT);
  digitalWrite(LED_CONNECTED_PIN, LOW);
  digitalWrite(LED_MEASURING_PIN, LOW);
  digitalWrite(LED_STANDBY_PIN, HIGH);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW gagal diinisialisasi");
    return;
  }

  esp_now_peer_info_t peer{};
  memcpy(peer.peer_addr, COORDINATOR_MAC, 6);
  peer.channel = 0;
  peer.encrypt = false;
  esp_now_add_peer(&peer);
  esp_now_register_recv_cb(onDataReceived);
}

void loop() {
  updateNodeLeds();
  if (requestPending) {
    noInterrupts();
    uint32_t cycleId = requestedCycleId;
    uint32_t measuredAtEpoch = requestedEpoch;
    requestPending = false;
    interrupts();
    sendMeasurement(cycleId, measuredAtEpoch);
  }
  delay(5);
}
```

## Firmware koordinator

Koordinator Node 2 mengukur tiga sensor lokalnya sendiri, mengirim request pada
awal setiap menit hanya ke Node 1 dan Node 3, menerima dua balasan, lalu
mengunggah lima siklus sekaligus. Hasil lokal Node 2 langsung dimasukkan ke
buffer koordinator sebagai `nodeId = 2`.

```cpp
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <esp_now.h>
#include <time.h>

const char *WIFI_SSID = "your-wifi";
const char *WIFI_PASSWORD = "your-password";
const char *SUPABASE_URL = "https://your-project.supabase.co";
const char *SUPABASE_ANON_KEY = "your-anon-public-key";
const uint8_t REMOTE_NODE_MACS[2][6] = {
  {0x24, 0x6F, 0x28, 0xAA, 0xBB, 0x01}, // Node 1 / A
  {0x24, 0x6F, 0x28, 0xAA, 0xBB, 0x03}  // Node 3 / C
};
const int SENSOR_PINS[3] = {34, 35, 32};
const int SENSOR_DEPTHS[3] = {50, 100, 150};
const int DRY_VALUES[3] = {2815, 2886, 2814};
const int WET_VALUES[3] = {1104, 1120, 1088};
const int BUTTON_PIN = 5;
const int LED_CONNECTED_PIN = 2;  // Status WiFi
const int LED_STANDBY_PIN = 4;    // Standby atau pengukuran berhenti
const int LED_MEASURING_PIN = 16; // Sedang mengukur kelembaban
const unsigned long BUTTON_DEBOUNCE_MS = 50;

enum PacketType : uint8_t {
  MEASURE_REQUEST = 1,
  MEASUREMENT_RESULT = 2,
  MEASUREMENT_ACK = 3
};

struct Measurement {
  uint16_t depthCm;
  uint16_t rawValue;
  float moisture;
};

struct EspNowPacket {
  uint8_t type;
  uint8_t nodeId;
  uint32_t cycleId;
  uint32_t measuredAtEpoch;
  uint8_t count;
  Measurement readings[3];
};

struct StoredPacket {
  bool present;
  EspNowPacket packet;
};

StoredPacket cycles[10][3]{};
uint32_t currentCycleId = 0;
uint32_t nextCycleAt = 0;
uint32_t lastUploadedCycle = 0;
uint32_t nextUploadAttemptAt = 0;
bool measurementActive = false;
bool lastButtonReading = HIGH;
bool stableButtonState = HIGH;
unsigned long lastButtonChangeAt = 0;
volatile bool persistencePending = false;
volatile bool acknowledgementPending = false;
uint8_t pendingAckMac[6]{};
uint32_t pendingAckCycleId = 0;
uint8_t pendingAckNodeId = 0;
Preferences storage;

void savePersistentState() {
  storage.putBytes("cycles", cycles, sizeof(cycles));
  storage.putUInt("lastUpload", lastUploadedCycle);
}

void loadPersistentState() {
  if (storage.getBytesLength("cycles") == sizeof(cycles)) {
    storage.getBytes("cycles", cycles, sizeof(cycles));
  }
  lastUploadedCycle = storage.getUInt("lastUpload", 0);
}

void updateStatusLeds() {
  digitalWrite(LED_CONNECTED_PIN, WiFi.status() == WL_CONNECTED ? HIGH : LOW);
  digitalWrite(LED_STANDBY_PIN, measurementActive ? LOW : HIGH);
}

void handleStartStopButton() {
  bool buttonReading = digitalRead(BUTTON_PIN);
  if (buttonReading != lastButtonReading) {
    lastButtonChangeAt = millis();
    lastButtonReading = buttonReading;
  }

  if (millis() - lastButtonChangeAt < BUTTON_DEBOUNCE_MS ||
      buttonReading == stableButtonState) {
    return;
  }

  stableButtonState = buttonReading;
  if (stableButtonState == LOW) {
    measurementActive = !measurementActive;
    if (measurementActive) {
      nextCycleAt = millis();
      Serial.println("Pengukuran dimulai");
    } else {
      digitalWrite(LED_MEASURING_PIN, LOW);
      Serial.println("Pengukuran dihentikan");
    }
    updateStatusLeds();
  }
}

int readLocalADC(int pin) {
  long sum = 0;
  for (int sample = 0; sample < 20; sample++) {
    sum += analogRead(pin);
    delay(3);
  }
  return sum / 20;
}

float localMoisture(int index, int rawValue) {
  float percentage = (rawValue - DRY_VALUES[index]) * 100.0f /
                     (WET_VALUES[index] - DRY_VALUES[index]);
  return constrain(percentage, 0.0f, 100.0f);
}

String isoTimestamp(uint32_t epoch) {
  time_t raw = epoch;
  struct tm timeInfo;
  gmtime_r(&raw, &timeInfo);
  char result[25];
  strftime(result, sizeof(result), "%Y-%m-%dT%H:%M:%SZ", &timeInfo);
  return String(result);
}

void sendMeasurementAck(const uint8_t *nodeMac, uint32_t cycleId, uint8_t nodeId) {
  EspNowPacket ack{};
  ack.type = MEASUREMENT_ACK;
  ack.nodeId = nodeId;
  ack.cycleId = cycleId;
  esp_now_send(nodeMac, reinterpret_cast<uint8_t *>(&ack), sizeof(ack));
}

void onDataReceived(const esp_now_recv_info_t *receiveInfo, const uint8_t *data, int length) {
  if (length != sizeof(EspNowPacket)) return;
  EspNowPacket packet;
  memcpy(&packet, data, sizeof(packet));
  if (packet.type != MEASUREMENT_RESULT || packet.nodeId < 1 || packet.nodeId > 3) return;
  if (packet.count != 3) return;
  if (packet.cycleId > currentCycleId || currentCycleId - packet.cycleId >= 10) return;

  uint8_t cycleIndex = packet.cycleId % 10;
  uint8_t nodeIndex = packet.nodeId - 1;
  cycles[cycleIndex][nodeIndex] = {true, packet};
  persistencePending = true;
  memcpy(pendingAckMac, receiveInfo->src_addr, sizeof(pendingAckMac));
  pendingAckCycleId = packet.cycleId;
  pendingAckNodeId = packet.nodeId;
  acknowledgementPending = true;
}

void requestCycle(uint32_t cycleId, uint32_t epoch) {
  EspNowPacket request{};
  request.type = MEASURE_REQUEST;
  request.cycleId = cycleId;
  request.measuredAtEpoch = epoch;

  for (const auto &nodeMac : REMOTE_NODE_MACS) {
    esp_now_send(nodeMac, reinterpret_cast<uint8_t *>(&request), sizeof(request));
  }
}

void measureCoordinatorNode(uint32_t cycleId, uint32_t epoch) {
  EspNowPacket packet{};
  packet.type = MEASUREMENT_RESULT;
  packet.nodeId = 2;
  packet.cycleId = cycleId;
  packet.measuredAtEpoch = epoch;
  packet.count = 3;

  for (int index = 0; index < 3; index++) {
    int rawValue = readLocalADC(SENSOR_PINS[index]);
    packet.readings[index] = {
      static_cast<uint16_t>(SENSOR_DEPTHS[index]),
      static_cast<uint16_t>(rawValue),
      localMoisture(index, rawValue)
    };
  }

  cycles[cycleId % 10][1] = {true, packet};
  savePersistentState();
}

bool batchIsComplete() {
  for (int cycleOffset = 0; cycleOffset < 5; cycleOffset++) {
    uint32_t cycleId = currentCycleId - cycleOffset;
    uint8_t cycleIndex = cycleId % 10;
    for (int nodeIndex = 0; nodeIndex < 3; nodeIndex++) {
      StoredPacket &stored = cycles[cycleIndex][nodeIndex];
      if (!stored.present || stored.packet.cycleId != cycleId) return false;
    }
  }
  return true;
}

bool uploadCycle(uint32_t cycleId) {
  DynamicJsonDocument body(3072);
  JsonArray rows = body.to<JsonArray>();

  uint8_t cycleIndex = cycleId % 10;
  for (int nodeIndex = 0; nodeIndex < 3; nodeIndex++) {
    StoredPacket &stored = cycles[cycleIndex][nodeIndex];
    if (!stored.present || stored.packet.cycleId != cycleId ||
        stored.packet.count != 3) {
      return false;
    }

    for (int readingIndex = 0; readingIndex < 3; readingIndex++) {
      const Measurement &reading = stored.packet.readings[readingIndex];
      JsonObject row = rows.add<JsonObject>();
      row["node_id"] = String(char('A' + nodeIndex));
      row["cycle_id"] = cycleId;
      row["depth_cm"] = reading.depthCm;
      row["moisture"] = reading.moisture;
      row["raw_value"] = reading.rawValue;
      row["measured_at"] = isoTimestamp(stored.packet.measuredAtEpoch);
    }
  }

  if (rows.size() != 9) return false;

  String payload;
  serializeJson(body, payload);
  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/sensor_readings");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "resolution=ignore-duplicates,return=minimal");
  int status = http.POST(payload);
  http.end();
  return status == 200 || status == 201;
}

bool uploadFiveMinuteBatch() {
  if (!batchIsComplete()) {
    Serial.println("Batch lima siklus belum lengkap; upload ditunda.");
    return false;
  }

  for (int cycleOffset = 4; cycleOffset >= 0; cycleOffset--) {
    uint32_t cycleId = currentCycleId - cycleOffset;
    if (!uploadCycle(cycleId)) {
      Serial.printf("Upload siklus %lu gagal.\n", cycleId);
      return false;
    }
  }

  lastUploadedCycle = currentCycleId;
  savePersistentState();
  return true;
}

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_CONNECTED_PIN, OUTPUT);
  pinMode(LED_STANDBY_PIN, OUTPUT);
  pinMode(LED_MEASURING_PIN, OUTPUT);
  digitalWrite(LED_MEASURING_PIN, LOW);
  updateStatusLeds();
  storage.begin("collector", false);
  loadPersistentState();
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  time_t synchronizedTime = 0;
  while (synchronizedTime < 1700000000) {
    time(&synchronizedTime);
    delay(250);
  }

  if (esp_now_init() != ESP_OK) return;
  for (const auto &nodeMac : REMOTE_NODE_MACS) {
    esp_now_peer_info_t peer{};
    memcpy(peer.peer_addr, nodeMac, 6);
    peer.channel = 0;
    peer.encrypt = false;
    esp_now_add_peer(&peer);
  }
  esp_now_register_recv_cb(onDataReceived);
  currentCycleId = static_cast<uint32_t>(synchronizedTime / 60) - 1;
  nextCycleAt = millis();
  updateStatusLeds();
}

void loop() {
  handleStartStopButton();
  updateStatusLeds();

  if (persistencePending) {
    persistencePending = false;
    savePersistentState();
  }
  if (acknowledgementPending && !persistencePending) {
    sendMeasurementAck(pendingAckMac, pendingAckCycleId, pendingAckNodeId);
    acknowledgementPending = false;
  }

  if (measurementActive && static_cast<int32_t>(millis() - nextCycleAt) >= 0) {
    time_t now;
    time(&now);
    uint32_t currentMinute = static_cast<uint32_t>(now / 60);
    if (currentMinute <= currentCycleId) {
      nextCycleAt += 1000;
      return;
    }

    currentCycleId = currentMinute;
    uint32_t measuredAtEpoch = currentCycleId * 60;
    digitalWrite(LED_MEASURING_PIN, HIGH);
    measureCoordinatorNode(currentCycleId, measuredAtEpoch);
    requestCycle(currentCycleId, measuredAtEpoch);
    digitalWrite(LED_MEASURING_PIN, LOW);
    nextCycleAt += 60UL * 1000UL;

    if (currentCycleId % 5 == 0) {
      nextUploadAttemptAt = millis() + 5000;
    }
  }

  if (currentCycleId >= 5 && currentCycleId % 5 == 0 &&
      lastUploadedCycle < currentCycleId &&
      static_cast<int32_t>(millis() - nextUploadAttemptAt) >= 0) {
    if (uploadFiveMinuteBatch()) {
      Serial.println("Batch Supabase berhasil");
    } else {
      Serial.println("Batch belum lengkap atau upload gagal; coba lagi 10 detik.");
      nextUploadAttemptAt = millis() + 10000;
    }
  }
  delay(10);
}
```

## Payload JSON ke Supabase

Koordinator tidak mengirim struct ESP-NOW ke Supabase. Satu siklus lengkap
diubah menjadi array JSON dan dikirim sebagai satu `POST` ke
`/rest/v1/sensor_readings`. Setiap POST selalu berisi tepat 9 baris: 3 node
(A, B, C) dan 3 kedalaman (50, 100, 150 cm) per node. Pada menit kelima,
koordinator mengirim lima POST terpisah, satu POST untuk setiap siklus yang
belum dikirim.

Contoh payload satu siklus (tepat 9 baris):

```json
[
  {
    "node_id": "A",
    "cycle_id": 29563200,
    "depth_cm": 50,
    "moisture": 62.3,
    "raw_value": 740,
    "measured_at": "2026-09-26T08:00:00Z"
  },
  {
    "node_id": "B",
    "cycle_id": 29563200,
    "depth_cm": 100,
    "moisture": 58.1,
    "raw_value": 695,
    "measured_at": "2026-09-26T08:00:00Z"
  },
  {
    "node_id": "C",
    "cycle_id": 29563200,
    "depth_cm": 150,
    "moisture": 54.7,
    "raw_value": 650,
    "measured_at": "2026-09-26T08:00:00Z"
  },
  {
    "node_id": "A",
    "cycle_id": 29563200,
    "depth_cm": 100,
    "moisture": 60.2,
    "raw_value": 720,
    "measured_at": "2026-09-26T08:00:00Z"
  },
  {
    "node_id": "A",
    "cycle_id": 29563200,
    "depth_cm": 150,
    "moisture": 57.8,
    "raw_value": 680,
    "measured_at": "2026-09-26T08:00:00Z"
  },
  {
    "node_id": "B",
    "cycle_id": 29563200,
    "depth_cm": 50,
    "moisture": 61.4,
    "raw_value": 735,
    "measured_at": "2026-09-26T08:00:00Z"
  },
  {
    "node_id": "B",
    "cycle_id": 29563200,
    "depth_cm": 150,
    "moisture": 55.9,
    "raw_value": 665,
    "measured_at": "2026-09-26T08:00:00Z"
  },
  {
    "node_id": "C",
    "cycle_id": 29563200,
    "depth_cm": 50,
    "moisture": 63.1,
    "raw_value": 748,
    "measured_at": "2026-09-26T08:00:00Z"
  },
  {
    "node_id": "C",
    "cycle_id": 29563200,
    "depth_cm": 100,
    "moisture": 59.6,
    "raw_value": 705,
    "measured_at": "2026-09-26T08:00:00Z"
  }
]
```

`cycle_id` adalah menit Unix UTC dan sama untuk semua data
yang diukur pada menit tersebut. Supabase mengisi `received_at` otomatis saat
setiap payload diterima. Jika satu dari lima POST gagal, koordinator mengulang
POST siklus tersebut; unique index membuat pengulangan aman.

Header HTTP yang digunakan:

```text
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
Content-Type: application/json
Prefer: resolution=ignore-duplicates,return=minimal
```

## SQL Supabase

## Tombol dan indikator Node 2

Hubungkan push button antara GPIO 5 dan GND. Firmware memakai `INPUT_PULLUP`,
sehingga tidak memerlukan resistor pull-up eksternal. Tekan sekali untuk
memulai pengukuran per menit; tekan lagi untuk menghentikan permintaan siklus
baru. Buffer NVS dan upload batch yang masih tertunda tetap diproses setelah
mode pengukuran dihentikan.

| GPIO | Komponen | Kondisi menyala |
| --- | --- | --- |
| 5 | Push button ke GND | Toggle start/stop, aktif LOW |
| 2 | `LED_CONNECTED_PIN` | Wi-Fi terhubung |
| 4 | `LED_STANDBY_PIN` | Pengukuran berhenti/standby |
| 16 | `LED_MEASURING_PIN` | Node 2 sedang membaca sensor dan mengirim request |

Gunakan resistor pembatas arus untuk LED atau modul LED yang sudah memiliki
resistor. Referensi GPIO tersebut hanya aman jika tidak berbenturan dengan
peripheral atau wiring sensor pada board yang digunakan.

Node 1 dan Node 3 menggunakan pin LED yang sama dengan fungsi berikut:

| GPIO | Kondisi LED pada Node 1/3 |
| --- | --- |
| 2 | Menyala jika ACK koordinator diterima dalam 70 detik terakhir; mati jika link dianggap gagal |
| 4 | Menyala saat node idle dan menunggu `MEASURE_REQUEST` |
| 16 | Menyala sejak pembacaan ADC dimulai sampai `MEASUREMENT_ACK` diterima |

Urutan visual normal pada Node 1/3 adalah: LED standby menyala, kemudian LED
measuring menyala saat request diterima, LED measuring tetap menyala selama
retry, lalu LED connected menyala setelah koordinator mengirim ACK. Jika LED
measuring terus menyala, node masih menunggu ACK; jika LED connected mati lebih
dari 70 detik, periksa channel ESP-NOW, MAC koordinator, jarak radio, dan catu
daya Node 2.

Jalankan migrasi berikut agar setiap baris dapat ditelusuri ke siklusnya.

```sql
ALTER TABLE public.sensor_readings
  ADD COLUMN IF NOT EXISTS cycle_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_readings_cycle_id
  ON public.sensor_readings (cycle_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_readings_node_cycle_depth
  ON public.sensor_readings (node_id, cycle_id, depth_cm)
  WHERE cycle_id IS NOT NULL;
```

Unique index dan header `resolution=ignore-duplicates` membuat retry HTTP aman:
data yang sudah masuk tidak akan dibuat ulang.

Query pemeriksaan satu batch:

```sql
SELECT node_id, cycle_id, depth_cm, moisture, raw_value,
       measured_at, received_at
FROM public.sensor_readings
WHERE cycle_id = 29563200
ORDER BY node_id, depth_cm;
```

## Penyimpanan tahan reset

Pada ESP32, `Preferences` menggunakan NVS internal yang merupakan pengganti
EEPROM yang lebih sesuai. Koordinator menyimpan `cycles[10][3]` setiap kali
menerima paket valid dan setelah pengukuran lokal Node 2. Saat boot, buffer dan
`lastUploadedCycle` dimuat kembali sebelum jadwal pengukuran dimulai.

NVS membantu menghadapi restart dan brownout singkat, tetapi bukan jaminan
mutlak jika listrik terputus tepat ketika flash sedang ditulis. Gunakan modul
power-fail hold-up/supervisor dan, untuk sistem yang sangat kritis, gunakan dua
slot record dengan sequence number dan CRC di LittleFS atau FRAM eksternal.

## Catatan implementasi wajib

- MAC address pada contoh harus diganti dengan MAC asli setiap ESP32.
- Pasang firmware node biasa pada Node 1 dan Node 3. Pasang firmware
  koordinator pada Node 2, termasuk sensor yang terhubung ke pin Node 2.
- Node 2 tidak perlu mengirim paket ESP-NOW ke dirinya sendiri; pembacaan lokal
  disimpan langsung ke slot Node 2 pada buffer siklus.
- Semua ESP32 harus berada pada channel Wi-Fi yang sama. ESP-NOW tidak bebas
  memilih channel ketika koordinator tersambung ke access point.
- Callback ESP-NOW hanya menyalin paket ke buffer dan menjadwalkan persistensi;
  penulisan NVS serta HTTP dilakukan di `loop()`, bukan dari callback.
- Node mengirim ulang paket `MEASUREMENT_RESULT` setiap satu detik sampai
  menerima `MEASUREMENT_ACK` dengan `nodeId` dan `cycleId` yang sama. Retry
  memakai payload pengukuran yang sama, bukan membaca sensor ulang.
- Jika ACK hilang, koordinator akan menerima paket duplikat, memperbarui slot
  siklus yang sama, dan mengirim ACK kembali. Ini membuat retry aman.
- ACK dikirim setelah data dijadwalkan untuk disimpan ke NVS, sehingga node tidak
  berhenti retry sebelum data berada di penyimpanan koordinator.
- Draft ini menahan data sampai sepuluh siklus dan menyimpannya di NVS untuk
  memberi kesempatan paket terlambat tiba setelah reset.
- Upload lima menit dijadwalkan lima detik setelah siklus kelima. Jika data
  belum lengkap atau Wi-Fi gagal, upload dicoba ulang setiap sepuluh detik.
- `SUPABASE_SERVICE_KEY` tidak boleh dimasukkan ke firmware. Gunakan anon key
  dan RLS seperti konfigurasi project saat ini.
- `batchIsComplete()` mencegah upload parsial. `delay(5000)` hanya memberi
  waktu tambahan sebelum pemeriksaan; versi produksi sebaiknya memakai timeout
  non-blocking, retry per node, dan mencatat node yang hilang.
- Retry node pada draft ini memang tidak dibatasi agar data tidak dibuang saat
  radio sementara gagal. Jika Node 2 mati total, node akan terus mencoba;
  tambahkan watchdog dan antrean LittleFS/NVS sebelum deployment lapangan.