import type { Plugin, ViteDevServer, PreviewServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

interface StoredReport {
  id: string;
  createdAt: number;
  syncedAt: number;
  hazardType: string;
  severity: string;
  visionConfidence?: number;
  proximityLandmark?: string;
  context: Record<string, unknown>;
  advisory: Record<string, unknown>;
  photoUrl: string;
  receipt: string;
}

export function reportsApiPlugin(): Plugin {
  const dataDir = path.resolve(process.cwd(), "server-data");
  const photosDir = path.join(dataDir, "photos");
  const reportsFilePath = path.join(dataDir, "reports.json");

  // Ensure directories exist
  if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
  }

  function readStoredReports(): StoredReport[] {
    try {
      if (fs.existsSync(reportsFilePath)) {
        const raw = fs.readFileSync(reportsFilePath, "utf-8");
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn("[ReportsApiPlugin] Error reading reports.json:", err);
    }
    return [];
  }

  function writeStoredReports(reports: StoredReport[]) {
    try {
      fs.writeFileSync(reportsFilePath, JSON.stringify(reports, null, 2), "utf-8");
    } catch (err) {
      console.error("[ReportsApiPlugin] Error writing reports.json:", err);
    }
  }

  function configureApiRoutes(server: ViteDevServer | PreviewServer) {
    server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const url = req.url?.split("?")[0] || "";

      // 1. Health check: GET /api/health
      if (url === "/api/health" && req.method === "GET") {
        const reports = readStoredReports();
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            status: "ok",
            service: "DHR Emergency Dispatch Ingestion Gateway",
            timestamp: Date.now(),
            totalIngested: reports.length,
          })
        );
        return;
      }

      // 2. Photo streaming: GET /api/reports/:id/photo
      const photoMatch = url.match(/^\/api\/reports\/([^/]+)\/photo$/);
      if (photoMatch && req.method === "GET") {
        const reportId = photoMatch[1];
        const photoPath = path.join(photosDir, `${reportId}.jpg`);

        if (fs.existsSync(photoPath)) {
          const stat = fs.statSync(photoPath);
          res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Content-Length": stat.size,
            "Cache-Control": "public, max-age=86400",
          });
          const readStream = fs.createReadStream(photoPath);
          readStream.pipe(res);
          return;
        } else {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Photo not found for report " + reportId }));
          return;
        }
      }

      // 3. Single report deletion: DELETE /api/reports/:id
      const deleteMatch = url.match(/^\/api\/reports\/([^/]+)$/);
      if (deleteMatch && req.method === "DELETE") {
        const reportId = deleteMatch[1];
        let reports = readStoredReports();
        reports = reports.filter((r) => r.id !== reportId);
        writeStoredReports(reports);

        const photoPath = path.join(photosDir, `${reportId}.jpg`);
        if (fs.existsSync(photoPath)) {
          try {
            fs.unlinkSync(photoPath);
          } catch (err) {
            void err;
          }
        }

        res.setHeader("Content-Type", "application/json");
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, deletedId: reportId }));
        return;
      }

      // 4. Ingestion / Reports: /api/reports
      if (url === "/api/reports") {
        // GET /api/reports
        if (req.method === "GET") {
          const reports = readStoredReports();
          res.setHeader("Content-Type", "application/json");
          res.statusCode = 200;
          res.end(JSON.stringify(reports));
          return;
        }

        // DELETE /api/reports (clear all)
        if (req.method === "DELETE") {
          writeStoredReports([]);
          res.setHeader("Content-Type", "application/json");
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, message: "All server reports cleared" }));
          return;
        }

        // POST /api/reports (Ingest report + photo)
        if (req.method === "POST") {
          const chunks: Buffer[] = [];
          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", async () => {
            try {
              const bodyBuffer = Buffer.concat(chunks);
              const contentType = req.headers["content-type"] || "";

              let reportId = (req.headers["x-idempotency-key"] as string) || "";
              let createdAt = Date.now();
              let contextData: Record<string, unknown> = {};
              let advisoryData: Record<string, unknown> = {};
              let photoBuffer: Buffer | null = null;

              if (contentType.includes("multipart/form-data")) {
                const boundaryMatch = contentType.match(/boundary=(?:["']?)([^"';]+)/i);
                const boundary = boundaryMatch ? boundaryMatch[1] : null;

                if (boundary) {
                  const parts = parseMultipartBuffer(bodyBuffer, boundary);
                  for (const part of parts) {
                    if (part.name === "id") {
                      reportId = part.data.toString("utf-8").trim();
                    } else if (part.name === "createdAt") {
                      createdAt = parseInt(part.data.toString("utf-8").trim(), 10) || Date.now();
                    } else if (part.name === "context") {
                      try {
                        contextData = JSON.parse(part.data.toString("utf-8")) as Record<string, unknown>;
                      } catch (err) {
                        void err;
                      }
                    } else if (part.name === "advisory") {
                      try {
                        advisoryData = JSON.parse(part.data.toString("utf-8")) as Record<string, unknown>;
                      } catch (err) {
                        void err;
                      }
                    } else if (part.name === "photo") {
                      photoBuffer = part.data;
                    }
                  }
                }
              } else if (contentType.includes("application/json")) {
                const json = JSON.parse(bodyBuffer.toString("utf-8"));
                reportId = json.id || reportId;
                createdAt = json.createdAt || createdAt;
                contextData = json.context || {};
                advisoryData = json.advisory || {};
                if (json.photoBase64) {
                  photoBuffer = Buffer.from(json.photoBase64, "base64");
                }
              }

              if (!reportId) {
                reportId = "rep-" + Math.random().toString(36).substring(2, 11);
              }

              // Save photo if provided
              if (photoBuffer && photoBuffer.length > 0) {
                const destPhoto = path.join(photosDir, `${reportId}.jpg`);
                fs.writeFileSync(destPhoto, photoBuffer);
              }

              const receipt = `DHR-DISPATCH-${reportId.slice(0, 8).toUpperCase()}`;
              const syncedAt = Date.now();

              const storedItem: StoredReport = {
                id: reportId,
                createdAt,
                syncedAt,
                hazardType: String(contextData.hazardType || advisoryData.hazardLabel || "Unknown Hazard"),
                severity: String(contextData.severity || "MEDIUM"),
                visionConfidence:
                  typeof contextData.visionConfidence === "number" ? contextData.visionConfidence : undefined,
                proximityLandmark:
                  typeof contextData.proximityLandmark === "object" && contextData.proximityLandmark !== null
                    ? String((contextData.proximityLandmark as { label?: string }).label || "")
                    : undefined,
                context: contextData,
                advisory: advisoryData,
                photoUrl: `/api/reports/${reportId}/photo`,
                receipt,
              };

              // Idempotent upsert in reports.json
              const reports = readStoredReports();
              const existingIndex = reports.findIndex((r) => r.id === reportId);
              if (existingIndex >= 0) {
                reports[existingIndex] = storedItem;
              } else {
                reports.unshift(storedItem);
              }
              writeStoredReports(reports);

              res.setHeader("Content-Type", "application/json");
              res.statusCode = 201;
              res.end(
                JSON.stringify({
                  success: true,
                  id: reportId,
                  message: "Hazard report successfully ingested into DHR Central Dispatch",
                  syncedAt,
                  receipt,
                  photoUrl: storedItem.photoUrl,
                })
              );
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "Failed to process report upload";
              console.error("[ReportsApiPlugin] Ingestion failed:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: msg }));
            }
          });
          return;
        }
      }

      next();
    });
  }

  return {
    name: "reports-api-plugin",
    configureServer(server) {
      configureApiRoutes(server);
    },
    configurePreviewServer(server) {
      configureApiRoutes(server);
    },
  };
}

/**
 * Lightweight multipart form-data buffer parser without external npm dependencies
 */
function parseMultipartBuffer(buffer: Buffer, boundary: string) {
  const parts: { name: string; filename?: string; data: Buffer }[] = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let start = 0;

  while (start < buffer.length) {
    const boundaryIdx = buffer.indexOf(boundaryBuffer, start);
    if (boundaryIdx === -1) break;

    const nextBoundaryIdx = buffer.indexOf(boundaryBuffer, boundaryIdx + boundaryBuffer.length);
    if (nextBoundaryIdx === -1) break;

    const partBuffer = buffer.slice(boundaryIdx + boundaryBuffer.length, nextBoundaryIdx);
    const headerEndIdx = partBuffer.indexOf("\r\n\r\n");

    if (headerEndIdx !== -1) {
      const headerStr = partBuffer.slice(0, headerEndIdx).toString("utf-8");
      // Strip trailing \r\n before boundary
      let data = partBuffer.slice(headerEndIdx + 4);
      if (data.length >= 2 && data[data.length - 2] === 13 && data[data.length - 1] === 10) {
        data = data.slice(0, data.length - 2);
      }

      const nameMatch = headerStr.match(/name="([^"]+)"/);
      const filenameMatch = headerStr.match(/filename="([^"]+)"/);

      if (nameMatch) {
        parts.push({
          name: nameMatch[1],
          filename: filenameMatch ? filenameMatch[1] : undefined,
          data,
        });
      }
    }

    start = nextBoundaryIdx;
  }

  return parts;
}
