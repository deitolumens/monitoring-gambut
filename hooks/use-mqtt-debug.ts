"use client";

import { useEffect } from "react";

const MQTT_URL = process.env.NEXT_PUBLIC_MQTT_URL;
const MQTT_USERNAME = process.env.NEXT_PUBLIC_MQTT_USERNAME;
const MQTT_PASSWORD = process.env.NEXT_PUBLIC_MQTT_PASSWORD;
const MQTT_TOPIC = process.env.NEXT_PUBLIC_MQTT_TOPIC ?? "peatland/+/data";

export function useMqttDebug(): void {
  useEffect(() => {
    if (!MQTT_URL || !MQTT_USERNAME || !MQTT_PASSWORD) {
      console.info(
        "[MQTT debug] Disabled. Set NEXT_PUBLIC_MQTT_URL, " +
          "NEXT_PUBLIC_MQTT_USERNAME, and NEXT_PUBLIC_MQTT_PASSWORD to test browser subscription."
      );
      return;
    }

    let active = true;
    let client: { end: () => void } | undefined;

    void import("mqtt").then(({ connect }) => {
      if (!active) return;

      client = connect(MQTT_URL, {
        username: MQTT_USERNAME,
        password: MQTT_PASSWORD,
        reconnectPeriod: 5000,
        connectTimeout: 15000,
        clean: true,
      });

      client.on("connect", () => {
        console.info("[MQTT debug] Connected", { url: MQTT_URL });
        client?.subscribe(MQTT_TOPIC, (error) => {
          if (error) {
            console.error("[MQTT debug] Subscribe failed", {
              topic: MQTT_TOPIC,
              error,
            });
            return;
          }
          console.info("[MQTT debug] Subscribed", { topic: MQTT_TOPIC });
        });
      });

      client.on("message", (topic, message) => {
        let payload: unknown = message.toString();
        try {
          payload = JSON.parse(payload as string);
        } catch {
          // Keep non-JSON messages visible in the diagnostic log.
        }
        console.info("[MQTT debug] Message received", { topic, payload });
      });

      client.on("error", (error) => {
        console.error("[MQTT debug] Client error", error);
      });

      client.on("reconnect", () => {
        console.info("[MQTT debug] Reconnecting");
      });

      client.on("offline", () => {
        console.warn("[MQTT debug] Offline");
      });
    }).catch((error: unknown) => {
      console.error("[MQTT debug] Failed to load MQTT client", error);
    });

    return () => {
      active = false;
      client?.end();
      console.info("[MQTT debug] Disconnected");
    };
  }, []);
}