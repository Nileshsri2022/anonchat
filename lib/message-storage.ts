// IndexedDB message storage for persisting chat messages
// Stores encrypted messages locally per room

const DB_NAME = 'anonchat_messages';
const DB_VERSION = 1;
const STORE_NAME = 'messages';

interface StoredMessage {
    id: string;
    roomId: string;
    userId: string;
    username: string;
    content: string; // Decrypted content
    timestamp: number;
    encrypted: boolean;
    ip?: string;
    expiresAt?: number;
}

class MessageStorage {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<void> | null = null;

    async init(): Promise<void> {
        if (this.db) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            if (typeof window === 'undefined') {
                reject(new Error('IndexedDB not available'));
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('📦 IndexedDB initialized');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create messages store with indexes
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('roomId', 'roomId', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('expiresAt', 'expiresAt', { unique: false });
                    console.log('📦 Created messages store');
                }
            };
        });

        return this.initPromise;
    }

    async saveMessage(message: StoredMessage): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('DB not initialized');

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(message);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async saveMessages(messages: StoredMessage[]): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('DB not initialized');

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            messages.forEach(msg => store.put(msg));

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getMessagesByRoom(roomId: string): Promise<StoredMessage[]> {
        await this.init();
        if (!this.db) throw new Error('DB not initialized');

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('roomId');
            const request = index.getAll(roomId);

            request.onsuccess = () => {
                const messages = request.result as StoredMessage[];
                // Filter out expired messages
                const now = Date.now();
                const validMessages = messages.filter(m => !m.expiresAt || m.expiresAt > now);
                // Sort by timestamp
                validMessages.sort((a, b) => a.timestamp - b.timestamp);
                resolve(validMessages);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteMessage(messageId: string): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('DB not initialized');

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(messageId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async deleteExpiredMessages(): Promise<number> {
        await this.init();
        if (!this.db) throw new Error('DB not initialized');

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('expiresAt');
            const now = Date.now();
            let deletedCount = 0;

            // Get all messages with expiresAt
            const request = index.openCursor();

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    const message = cursor.value as StoredMessage;
                    if (message.expiresAt && message.expiresAt <= now) {
                        cursor.delete();
                        deletedCount++;
                    }
                    cursor.continue();
                }
            };

            tx.oncomplete = () => resolve(deletedCount);
            tx.onerror = () => reject(tx.error);
        });
    }

    async clearRoom(roomId: string): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('DB not initialized');

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('roomId');
            const request = index.openCursor(roomId);

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async clearAll(): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('DB not initialized');

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

export const messageStorage = new MessageStorage();
export type { StoredMessage };
