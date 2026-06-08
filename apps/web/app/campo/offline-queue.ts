const DB_NAME = "eg_offline_v1";
const QUEUE_STORE = "queue";

export type QueueItem = {
  id: string;
  createdAt: string;
  path: string;
  method: string;
  body: string;
  status: "pending" | "failed";
  attempts: number;
  label?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(QUEUE_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(path: string, method: string, body: unknown, label?: string): Promise<void> {
  const db = await openDb();
  const item: QueueItem = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    path,
    method,
    body: JSON.stringify(body),
    status: "pending",
    attempts: 0,
    label,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const req = tx.objectStore(QUEUE_STORE).count();
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function processQueue(
  apiUrl: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ processed: number; failed: number }> {
  const db = await openDb();
  const items: QueueItem[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result as QueueItem[])
          .filter((i) => i.status === "pending")
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      );
    req.onerror = () => reject(req.error);
  });

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    onProgress?.(i, items.length);
    const item = items[i];
    try {
      const res = await fetch(`${apiUrl}${item.path}`, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        body: item.body,
      });
      if (res.ok) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(QUEUE_STORE, "readwrite");
          tx.objectStore(QUEUE_STORE).delete(item.id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        processed++;
      } else {
        const newStatus: QueueItem["status"] = item.attempts >= 2 ? "failed" : "pending";
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(QUEUE_STORE, "readwrite");
          tx.objectStore(QUEUE_STORE).put({ ...item, attempts: item.attempts + 1, status: newStatus });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        failed++;
      }
    } catch {
      failed++;
    }
  }

  onProgress?.(items.length, items.length);
  return { processed, failed };
}

export async function offlineFetch(
  apiUrl: string,
  path: string,
  method: string,
  body: unknown,
  label?: string,
): Promise<{ ok: boolean; queued: boolean }> {
  if (typeof navigator === "undefined" || !navigator.onLine) {
    await enqueue(path, method, body, label);
    return { ok: true, queued: true };
  }
  try {
    const res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, queued: false };
  } catch {
    await enqueue(path, method, body, label);
    return { ok: true, queued: true };
  }
}
