// Saves split episodes in the browser (IndexedDB) so they survive refreshes.
// Files stay on this computer; nothing is uploaded anywhere.
//
// Access codes: each show (sourceName) can be locked with a code. Only the
// SHA-256 hash of the code is stored, and only on this device. A code gates
// opening the show in the UI; it is not a server password.

const DB_NAME = "episode-splitter";
const STORE = "episodes";
const SHOWS = "shows";

export type Stored = { id: string; name: string; sourceName: string; createdAt: number; blob: Blob };
export type ShowLock = { sourceName: string; codeHash: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SHOWS)) db.createObjectStore(SHOWS, { keyPath: "sourceName" });
    };
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

export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Set (or, with null, remove) the access code for a show. */
export async function setShowCode(sourceName: string, code: string | null): Promise<void> {
  const codeHash = code ? await hashCode(code) : null;
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SHOWS, "readwrite");
    const store = tx.objectStore(SHOWS);
    if (codeHash) store.put({ sourceName, codeHash } satisfies ShowLock);
    else store.delete(sourceName);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** sourceName -> codeHash for every locked show. */
export async function listShowCodes(): Promise<Record<string, string>> {
  const db = await open();
  const all = await new Promise<ShowLock[]>((resolve, reject) => {
    const req = db.transaction(SHOWS, "readonly").objectStore(SHOWS).getAll();
    req.onsuccess = () => resolve(req.result as ShowLock[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return Object.fromEntries(all.map((s) => [s.sourceName, s.codeHash]));
}

export async function checkShowCode(sourceName: string, code: string): Promise<boolean> {
  const codes = await listShowCodes();
  const hash = codes[sourceName];
  if (!hash) return true;
  return (await hashCode(code)) === hash;
}
