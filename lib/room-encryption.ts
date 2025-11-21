// Room-level encryption utilities for multi-user chatrooms
// Uses AES-256-GCM for symmetric encryption with shared room keys

export interface EncryptedMessage {
  ciphertext: string;
  iv: string;
  tag: string;
}

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

  // Derive room key from room ID and shared secret
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
}

// Singleton instance
export const roomEncryption = new RoomEncryption();
