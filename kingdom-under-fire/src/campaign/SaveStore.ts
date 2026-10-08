import { type CampaignState, parseCampaign } from './Campaign';

/** Where the campaign is kept between sessions. */
export interface SaveStore {
  load(): Promise<CampaignState | null>;
  save(state: CampaignState): Promise<void>;
  clear(): Promise<void>;
}

const DB = 'kingdom-under-fire';
const STORE = 'saves';
const KEY = 'campaign';

/** Validates what was read: a save from an older or broken version is dropped rather than half-used. */
function valid(raw: unknown): CampaignState | null {
  if (raw === undefined || raw === null) return null;
  try {
    return parseCampaign(raw);
  } catch (e) {
    console.warn(`campaign save ignored: ${(e as Error).message}`);
    return null;
  }
}

/** The browser's IndexedDB: one record, the campaign. */
export class IndexedDbStore implements SaveStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  private async run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  async load(): Promise<CampaignState | null> {
    return valid(await this.run('readonly', (s) => s.get(KEY)));
  }

  async save(state: CampaignState): Promise<void> {
    await this.run('readwrite', (s) => s.put(state, KEY));
  }

  async clear(): Promise<void> {
    await this.run('readwrite', (s) => s.delete(KEY));
  }
}

/** In memory (tests, or a browser without IndexedDB such as some private windows). */
export class MemoryStore implements SaveStore {
  private state: unknown = null;

  async load(): Promise<CampaignState | null> {
    return valid(this.state === null ? null : structuredClone(this.state));
  }

  async save(state: CampaignState): Promise<void> {
    this.state = structuredClone(state);
  }

  async clear(): Promise<void> {
    this.state = null;
  }
}

export function openSaveStore(): SaveStore {
  return typeof indexedDB === 'undefined' ? new MemoryStore() : new IndexedDbStore();
}
