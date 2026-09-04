/**
 * DHR Corridor Slope Hazard Intelligence - Background Sync Companion
 * Listens for Chromium Background Sync 'sync-reports' events when tabs are closed.
 */

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-reports") {
    console.log("[SW-Sync] Received Background Sync event for 'sync-reports'");
    event.waitUntil(processBackgroundReportSync());
  }
});

async function processBackgroundReportSync() {
  try {
    // 1. Open the same IndexedDB database used by the web app
    const db = await openReportsDB();
    if (!db) return;

    // 2. Fetch pending reports
    const pendingRecords = await getPendingReportsFromDB(db);
    console.log(`[SW-Sync] Found ${pendingRecords.length} pending reports in background store`);

    if (pendingRecords.length === 0) return;

    // 3. Notify any connected clients
    const clients = await self.clients.matchAll({ type: "window" });
    if (clients && clients.length > 0) {
      // If a client window is currently open, delegate to the richer main-thread SyncManager
      clients[0].postMessage({ type: "BACKGROUND_SYNC_TRIGGERED" });
      return;
    }

    // 4. If all tabs are closed, flush reports directly to the sync endpoint
    for (const record of pendingRecords) {
      try {
        const formData = new FormData();
        formData.append("id", record.id);
        formData.append("createdAt", String(record.createdAt));
        formData.append("context", JSON.stringify(record.context));
        formData.append("advisory", JSON.stringify(record.advisory));
        if (record.photoBlob) {
          formData.append("photo", record.photoBlob, `hazard-${record.id}.jpg`);
        }

        const endpoint = "/api/reports";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "X-Idempotency-Key": record.id },
          body: formData,
        });

        if (res.ok) {
          await markReportSyncedInDB(db, record.id);
          console.log(`[SW-Sync] Successfully synced report ${record.id} in background`);
        }
      } catch (postErr) {
        console.warn(`[SW-Sync] Failed to post report ${record.id} in background:`, postErr);
      }
    }
  } catch (err) {
    console.error("[SW-Sync] Error during background report sync:", err);
  }
}

function openReportsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("dhr-reports-db", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getPendingReportsFromDB(db) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction("reports", "readonly");
      const store = tx.objectStore("reports");
      const index = store.index("by-syncStatus");
      const req = index.getAll("PENDING");
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function markReportSyncedInDB(db, id) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction("reports", "readwrite");
      const store = tx.objectStore("reports");
      const req = store.get(id);
      req.onsuccess = () => {
        const rec = req.result;
        if (rec) {
          rec.syncStatus = "SYNCED";
          rec.syncedAt = Date.now();
          store.put(rec);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
