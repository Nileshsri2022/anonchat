// Room-level encryption utilities for multi-user Rooms
// Uses AES-256-GCM for symmetric encryption with shared room keys and PBKDF2 for Rooms with a Room Passphrase

export interface EncryptedMessage {
  ciphertext: string;
  iv: string;
  tag: string;
}

export const ROOM_CANARY_TOKEN = 'anonchat_canary_v1';

export class RoomEncryption {
  private roomKey: CryptoKey | null = null;

  // Generate a new room key for encryption
  async generateRoomKey(): Promise<string> {
    const key = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt']
    );

    this.roomKey = key;

    // Export key as base64 for sharing
    const exported = await crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  }

  // Import a room key from base64 string
  async importRoomKey(keyBase64: string): Promise<void> {
    const keyData = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
    this.roomKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  // Encrypt a message for the room
  async encrypt(message: string): Promise<EncryptedMessage> {
    if (!this.roomKey) {
      throw new Error('Room key not initialized');
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      this.roomKey,
      data
    );

    return {
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      iv: btoa(String.fromCharCode(...iv)),
      tag: '', // GCM includes auth tag in ciphertext
    };
  }

  // Decrypt a message from the room
  async decrypt(encrypted: EncryptedMessage): Promise<string> {
    if (!this.roomKey) {
      throw new Error('Room key not initialized');
    }

    const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0));

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      this.roomKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  // Derive room key from room ID and shared secret (SHA-256 legacy / public room)
  async deriveRoomKey(roomId: string, sharedSecret: string): Promise<void> {
    const encoder = new TextEncoder();
    const keyMaterial = encoder.encode(roomId + sharedSecret);

    // Hash to create consistent key material
    const hash = await crypto.subtle.digest('SHA-256', keyMaterial);

    this.roomKey = await crypto.subtle.importKey(
      'raw',
      hash,
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Derive room key from Room Passphrase using PBKDF2 (100k iterations, SHA-256, salt=roomId).
   * If passphrase is not provided, falls back to public room derivation ('shared-secret').
   */
  async deriveKeyFromPassphrase(roomId: string, passphrase?: string): Promise<void> {
    if (!passphrase || passphrase.trim() === '') {
      return this.deriveRoomKey(roomId, 'shared-secret');
    }

    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(passphrase.trim());
    const saltBytes = encoder.encode(roomId.trim());

    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBytes,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    this.roomKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: 100000,
        hash: 'SHA-256',
      },
      baseKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Generate an encrypted Room Canary token using the current derived room key
   */
  async createCanary(): Promise<EncryptedMessage> {
    return this.encrypt(ROOM_CANARY_TOKEN);
  }

  getRoomKey(): CryptoKey | null {
    return this.roomKey;
  }

  setRoomKey(key: CryptoKey): void {
    this.roomKey = key;
  }

  /**
   * Validate a trial passphrase zero-knowledge by decrypting the Room Canary
   */
  async verifyCanary(canary: EncryptedMessage): Promise<boolean> {
    try {
      const decrypted = await this.decrypt(canary);
      return decrypted === ROOM_CANARY_TOKEN;
    } catch {
      return false;
    }
  }

  /**
   * Encapsulated static helper to verify a trial passphrase against a Room Canary.
   * Returns valid status and the derived CryptoKey so callers avoid re-deriving with PBKDF2.
   */
  static async verifyPassphrase(
    roomId: string,
    passphrase: string,
    canary: EncryptedMessage
  ): Promise<{ valid: boolean; key?: CryptoKey }> {
    const trial = new RoomEncryption();
    await trial.deriveKeyFromPassphrase(roomId, passphrase);
    const valid = await trial.verifyCanary(canary);
    return { valid, key: valid ? trial.getRoomKey() || undefined : undefined };
  }
}

// Singleton instance
export const roomEncryption = new RoomEncryption();
