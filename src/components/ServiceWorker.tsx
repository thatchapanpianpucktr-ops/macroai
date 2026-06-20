"use client";

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // If a brand-new worker takes control (after a deploy), reload once so the
    // running app picks up the new code instead of serving stale chunks.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => reg.update())
        .catch(() => {});
    };
    window.addEventListener("load", onLoad);
    return () => {
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);
  return null;
}
