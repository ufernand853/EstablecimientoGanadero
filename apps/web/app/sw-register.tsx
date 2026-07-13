"use client";

import { useEffect } from "react";
import { withBasePath } from "./lib/base-path";

const ACTIVE_CACHE_NAME = "eg_static_v2";

export function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const swUrl = withBasePath("/sw.js");

      const cleanupAndRegister = async () => {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations
              .filter((registration) => registration.active?.scriptURL.includes("/sw.js"))
              .map((registration) => registration.unregister()),
          );

          if ("caches" in window) {
            const cacheNames = await caches.keys();
            await Promise.all(
              cacheNames
                .filter((cacheName) => cacheName.startsWith("eg_static_") && cacheName !== ACTIVE_CACHE_NAME)
                .map((cacheName) => caches.delete(cacheName)),
            );
          }
        } catch {
          // cleanup failure is non-fatal
        }

        navigator.serviceWorker.register(swUrl).catch(() => {
          // SW registration failure is non-fatal
        });
      };

      cleanupAndRegister();
    }
  }, []);

  return null;
}
