import { useEffect, useState, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  window.addEventListener("focus", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
    window.removeEventListener("focus", callback);
  };
}

function getSnapshot() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

function getServerSnapshot() {
  return true;
}

/**
 * Robust Network Connectivity Hook:
 * Combines React 18/19 useSyncExternalStore for instant event dispatch
 * with an active, lightweight HTTP heartbeat ping to catch "Connected, No Internet" states.
 */
export function useNetworkStatus(pingIntervalMs = 4000) {
  // Instant browser-level event synchronization
  const browserOnLine = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  // Verified connectivity via active heartbeat ping
  const [isReachable, setIsReachable] = useState<boolean>(browserOnLine);

  useEffect(() => {
    let isMounted = true;


    const verifyConnection = async () => {
      // If browser already knows it's offline (e.g. airplane mode / adapter disabled)
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (isMounted) setIsReachable(false);
        return;
      }

      // Perform a lightweight probe to verify real internet connectivity
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);

        // Ping local manifest/favicon with cache busting
        const res = await fetch(`/favicon.ico?_ping=${Date.now()}`, {
          method: "HEAD",
          cache: "no-store",
          signal: controller.signal,
        });

        clearTimeout(timeout);
        if (isMounted) {
          setIsReachable(res.ok || res.status < 500);
        }
      } catch {
        // Fetch failed or timed out -> truly offline
        if (isMounted) {
          setIsReachable(false);
        }
      }
    };

    // Immediate check on mount or when browser event changes
    verifyConnection();

    // Periodic heartbeat poll
    const timerId = window.setInterval(verifyConnection, pingIntervalMs);

    // Also verify immediately when window refocuses or comes online
    const handleQuickCheck = () => {
      verifyConnection();
    };

    window.addEventListener("online", handleQuickCheck);
    window.addEventListener("offline", handleQuickCheck);
    window.addEventListener("focus", handleQuickCheck);

    return () => {
      isMounted = false;
      if (timerId) clearInterval(timerId);
      window.removeEventListener("online", handleQuickCheck);
      window.removeEventListener("offline", handleQuickCheck);
      window.removeEventListener("focus", handleQuickCheck);
    };
  }, [browserOnLine, pingIntervalMs]);

  // Overall online status requires both browser adapter & reachability
  const isOnline = browserOnLine && isReachable;

  return { isOnline };
}
