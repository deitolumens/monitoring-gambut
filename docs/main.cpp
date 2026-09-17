#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <time.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

// Isi nilai berikut sebelum upload ke ESP32.
const char *WIFI_SSID = "ADVAN MF01-8278E7";
const char *WIFI_PASSWORD = "1234567890";

const char *MQTT_HOST = "5983d80f70534c6b89c3343d2a478e3a.s1.eu.hivemq.cloud";
const uint16_t MQTT_PORT = 8883;
const char *MQTT_USERNAME = "anu";
const char *MQTT_PASSWORD = "AZaz0909";
const char *MQTT_TOPIC = "peatland/nodeA/data";
const char *NODE_ID = "A";

const char *NTP_SERVER_1 = "pool.ntp.org";
const char *NTP_SERVER_2 = "time.nist.gov";
const long GMT_OFFSET_SECONDS = 0;
const int DAYLIGHT_OFFSET_SECONDS = 0;

WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);

// ============================================================================
// KONFIGURASI PIN ESP32
// ============================================================================
const int SENSOR1_PIN = 34; // Sensor 1 (GPIO 34)
const int SENSOR2_PIN = 35; // Sensor 2 (GPIO 35)
const int SENSOR3_PIN = 32; // Sensor 3 (GPIO 32)

const int BUTTON_PIN  = 5;  // Push Button Trigger (GPIO 5)

const int LED_CONNECTED_PIN = 2;  // LED 1: Status Broker (Mati karena tanpa WiFi)
const int LED_STANDBY_PIN   = 4;  // LED 2: Standby (Belum/Selesai membaca)
const int LED_MEASURING_PIN = 16; // LED 3: Sedang Mengukur Kelembaban

const int SENSOR_PINS[3] = {SENSOR1_PIN, SENSOR2_PIN, SENSOR3_PIN};

// ============================================================================
// HASIL KALIBRASI INDIVIDUAL (DRY & WET)
// Isi nilai ADC mentah hasil kalibrasi Anda di bawah ini:
// Index [0] = Sensor 1 (GPIO 34)
// Index [1] = Sensor 2 (GPIO 35)
// Index [2] = Sensor 3 (GPIO 32)
// ============================================================================
const int DRY_VALUES[3] = {2815, 2886, 2814}; // Nilai ADC saat Kering
const int WET_VALUES[3] = {1104, 1120, 1088}; // Nilai ADC saat Basah
const int SENSOR_DEPTHS[3] = {50, 100, 150}; // Kedalaman sensor dalam mm

// ============================================================================
// VARIABEL PUSH BUTTON & DEBOUNCING
// ============================================================================
int lastButtonState = HIGH;
int buttonState     = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;
int measurementCount = 0;
bool continuousMeasurement = false;
unsigned long lastMeasurementTime = 0;
const unsigned long measurementInterval = 5UL * 60UL * 1000UL;

// ============================================================================
// FUNGSI SAMPLING ADC DENGAN FILTER TRIMMED MEAN (MEREDAM NOISE KABEL)
// ============================================================================
int readFilteredADC(int pin, int samples = 30) {
  int readings[samples];

  // 1. Ambil 30 sampel data dari pin analog
  for (int i = 0; i < samples; i++) {
    readings[i] = analogRead(pin);
    delay(3);
  }

  // 2. Urutkan data dari terkecil ke terbesar (Bubble Sort)
  for (int i = 0; i < samples - 1; i++) {
    for (int j = 0; j < samples - i - 1; j++) {
      if (readings[j] > readings[j + 1]) {
        int temp = readings[j];
        readings[j] = readings[j + 1];
        readings[j + 1] = temp;
      }
    }
  }

  // 3. Buang 5 data terendah dan 5 data tertinggi, hitung rata-rata sisanya
  long sum = 0;
  int validSamplesCount = samples - 10;
  for (int i = 5; i < samples - 5; i++) {
    sum += readings[i];
  }

  return sum / validSamplesCount;
}

// ============================================================================
// FUNGSI HETUNG KELEMBABAN PERSEN (0 - 100%)
// ============================================================================
float getSoilMoisturePercent(int sensorIndex, int &rawADC) {
  rawADC = readFilteredADC(SENSOR_PINS[sensorIndex]);
  
  // Konversi nilai ADC ke persen berdasarkan nilai DRY dan WET sensor tersebut
  float percentage = (rawADC - DRY_VALUES[sensorIndex]) * 100.0f /
                     (WET_VALUES[sensorIndex] - DRY_VALUES[sensorIndex]);

  return constrain(percentage, 0.0f, 100.0f);
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.print("Menghubungkan ke WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("WiFi terhubung, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(" gagal.");
  }
}

void synchronizeTime() {
  configTime(GMT_OFFSET_SECONDS, DAYLIGHT_OFFSET_SECONDS,
             NTP_SERVER_1, NTP_SERVER_2);

  Serial.print("Sinkronisasi waktu NTP");
  struct tm timeInfo;
  unsigned long start = millis();
  while (!getLocalTime(&timeInfo) && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (getLocalTime(&timeInfo)) {
    Serial.println(" berhasil.");
  } else {
    Serial.println(" gagal; timestamp belum tersedia.");
  }
}

void connectMQTT() {
  if (mqttClient.connected() || WiFi.status() != WL_CONNECTED) {
    return;
  }

  static unsigned long lastAttempt = 0;
  if (millis() - lastAttempt < 5000) {
    return;
  }
  lastAttempt = millis();

  String clientId = String("tessis-") + String((uint32_t)ESP.getEfuseMac(), HEX);
  Serial.print("Menghubungkan ke HiveMQ...");
  if (mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
    Serial.println(" berhasil.");
    digitalWrite(LED_CONNECTED_PIN, HIGH);
  } else {
    Serial.print(" gagal, kode MQTT: ");
    Serial.println(mqttClient.state());
    digitalWrite(LED_CONNECTED_PIN, LOW);
  }
}

bool getTimestamp(char *buffer, size_t bufferSize) {
  struct tm timeInfo;
  if (!getLocalTime(&timeInfo)) {
    return false;
  }

  return strftime(buffer, bufferSize, "%Y-%m-%dT%H:%M:%SZ", &timeInfo) > 0;
}

bool publishMeasurement(int rawValues[3], float moistureValues[3]) {
  if (!mqttClient.connected()) {
    return false;
  }

  char timestamp[25];
  if (!getTimestamp(timestamp, sizeof(timestamp))) {
    Serial.println("Data tidak dikirim: waktu NTP belum tersedia.");
    return false;
  }

  JsonDocument document;
  document["nodeId"] = NODE_ID;
  document["timestamp"] = timestamp;
  JsonArray readings = document["readings"].to<JsonArray>();

  for (int i = 0; i < 3; i++) {
    JsonObject reading = readings.add<JsonObject>();
    reading["depth"] = SENSOR_DEPTHS[i];
    reading["moisture"] = moistureValues[i];
    reading["rawValue"] = rawValues[i];
  }

  String payload;
  serializeJson(document, payload);
  bool published = mqttClient.publish(MQTT_TOPIC, payload.c_str());
  Serial.print("Payload MQTT: ");
  Serial.println(payload);
  Serial.println(published ? "Data berhasil dikirim." : "Data gagal dikirim.");
  return published;
}

void measureAndPublish() {
  measurementCount++;
  digitalWrite(LED_MEASURING_PIN, HIGH);

  Serial.println("--------------------------------------------------");
  Serial.print("[ PENGUKURAN KE-");
  Serial.print(measurementCount);
  Serial.println(" ] SEDANG MENGUKUR...");

  int raw1, raw2, raw3;
  float pct1 = getSoilMoisturePercent(0, raw1);
  float pct2 = getSoilMoisturePercent(1, raw2);
  float pct3 = getSoilMoisturePercent(2, raw3);
  int rawValues[3] = {raw1, raw2, raw3};
  float moistureValues[3] = {pct1, pct2, pct3};

  Serial.print("  Sensor 1 (GPIO 34) -> ADC: "); Serial.print(raw1); Serial.print("\t| Kelembaban: "); Serial.print(pct1, 1); Serial.println("%");
  Serial.print("  Sensor 2 (GPIO 35) -> ADC: "); Serial.print(raw2); Serial.print("\t| Kelembaban: "); Serial.print(pct2, 1); Serial.println("%");
  Serial.print("  Sensor 3 (GPIO 32) -> ADC: "); Serial.print(raw3); Serial.print("\t| Kelembaban: "); Serial.print(pct3, 1); Serial.println("%");
  Serial.println("--------------------------------------------------");

  publishMeasurement(rawValues, moistureValues);
  lastMeasurementTime = millis();
  digitalWrite(LED_MEASURING_PIN, LOW);
}

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  // Inisialisasi Push Button (Internal Pull-Up)
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Inisialisasi Mode Pin LED
  pinMode(LED_CONNECTED_PIN, OUTPUT);
  pinMode(LED_STANDBY_PIN, OUTPUT);
  pinMode(LED_MEASURING_PIN, OUTPUT);

  // Kondisi Awal LED
  digitalWrite(LED_CONNECTED_PIN, LOW); // Off (Belum terhubung broker)
  digitalWrite(LED_MEASURING_PIN, LOW); // Off
  digitalWrite(LED_STANDBY_PIN, HIGH);  // ON (Standby menunggu pemicu)

  secureClient.setInsecure();
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  connectWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    synchronizeTime();
    connectMQTT();
  }

  Serial.println("\n==================================================");
  Serial.println("  SISTEM PENGUKURAN KELEMBABAN TANAH (MODE 5 MENIT) ");
  Serial.println("==================================================");
  Serial.println("Status: STANDBY (LED 2 ON)");
  Serial.println("Tekan tombol untuk MULAI/KELUAR dari pengiriman setiap 5 menit...\n");
}

// ============================================================================
// LOOP UTAMA
// ============================================================================
void loop() {
  connectWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    connectMQTT();
    mqttClient.loop();
  }

  int reading = digitalRead(BUTTON_PIN);

  // Debouncing Push Button
  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (reading != buttonState) {
      buttonState = reading;

      // Tombol ditekan: toggle mode pengukuran berkala (aktif LOW)
      if (buttonState == LOW) {
        continuousMeasurement = !continuousMeasurement;
        if (continuousMeasurement) {
          digitalWrite(LED_STANDBY_PIN, LOW);
          Serial.println("Mode pengiriman AKTIF. Pengukuran pertama dimulai sekarang.");
          measureAndPublish();
        } else {
          digitalWrite(LED_STANDBY_PIN, HIGH);
          digitalWrite(LED_MEASURING_PIN, LOW);
          Serial.println("Mode pengiriman BERHENTI. Kembali ke STANDBY.");
        }
      }
    }
  }

  lastButtonState = reading;

  if (continuousMeasurement && millis() - lastMeasurementTime >= measurementInterval) {
    measureAndPublish();
  }
}