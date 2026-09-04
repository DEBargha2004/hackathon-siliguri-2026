import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ReportRecord, ReportSyncStatus } from "@/types/report";

export const DB_NAME = "dhr-reports-db";
export const DB_VERSION = 1;
export const STORE_NAME = "reports";

export interface DHRReportsDBSchema extends DBSchema {
  reports: {
    key: string;
    value: ReportRecord;
    indexes: {
      "by-syncStatus": ReportSyncStatus;
      "by-createdAt": number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<DHRReportsDBSchema>> | null = null;

export function getReportsDB(): Promise<IDBPDatabase<DHRReportsDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<DHRReportsDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "id",
          });
          store.createIndex("by-syncStatus", "syncStatus");
          store.createIndex("by-createdAt", "createdAt");
        }
      },
    });
  }
  return dbPromise;
}
