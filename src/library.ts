// Saves split episodes in the browser (IndexedDB) so they survive refreshes.
// Files stay on this computer; nothing is uploaded anywhere.

const DB_NAME = "episode-splitter";
const STORE = "episodes";

export type Stored = { id: string; name: string; sourceName: string; createdAt: number; blob: Blob };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveEpisodes(items: Stored[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    items.forEach((item) => tx.objectStore(STORE).put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listEpisodes(): Promise<Stored[]> {
  const db = await open();
  const all = await new Promise<Stored[]>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as Stored[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteEpisode(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
