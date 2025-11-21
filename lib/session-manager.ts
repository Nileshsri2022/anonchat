// Session Management & Contact Exchange
import { IdentityKeys, PreKeys, X3DHSession, generateEphemeralKeys, performX3DH } from './crypto';

export interface Contact {
  id: string;
  identityPublicKey: string;
  preKeyPublic: string;
  sessionId: string;
  alias: string;
  addedAt: Date;
  verified: boolean;
}

export interface Session {
  id: string;
  contactId: string;
  x3dhSession: X3DHSession;
  createdAt: Date;
  lastMessageTime: Date;
  messageCount: number;
}

export class SessionManager {
  private contacts: Map<string, Contact> = new Map();
  private sessions: Map<string, Session> = new Map();
  private localIdentityKeys: IdentityKeys | null = null;
  private localPreKeys: PreKeys | null = null;

  async initialize(identityKeys: IdentityKeys, preKeys: PreKeys): Promise<void> {
    this.localIdentityKeys = identityKeys;
    this.localPreKeys = preKeys;
  }

  generateQRData(): {
    sessionId: string;
    identityPublic: string;
    preKeyPublic: string;
    preKeyId: number;
  } {
    if (!this.localIdentityKeys || !this.localPreKeys) {
      throw new Error('Session manager not initialized');
    }

    return {
      sessionId: this.generateSessionId(),
      identityPublic: btoa(String.fromCharCode(...new Uint8Array(32))),
      preKeyPublic: btoa(String.fromCharCode(...new Uint8Array(32))),
      preKeyId: this.localPreKeys.id,
    };
  }

  async addContactFromQR(qrData: {
    sessionId: string;
    identityPublic: string;
    preKeyPublic: string;
    preKeyId: number;
  }): Promise<Contact> {
    const contact: Contact = {
      id: `contact_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      identityPublicKey: qrData.identityPublic,
      preKeyPublic: qrData.preKeyPublic,
      sessionId: qrData.sessionId,
      alias: `Contact ${this.contacts.size + 1}`,
      addedAt: new Date(),
      verified: false,
    };

    this.contacts.set(contact.id, contact);
    return contact;
  }

  async initiateSession(contactId: string): Promise<Session> {
    const contact = this.contacts.get(contactId);
    if (!contact) {
      throw new Error('Contact not found');
    }

    if (!this.localIdentityKeys || !this.localPreKeys) {
      throw new Error('Session manager not initialized');
    }

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const session: Session = {
      id: sessionId,
      contactId,
      x3dhSession: {
        sharedSecret: new ArrayBuffer(32),
        sessionId,
      },
      createdAt: new Date(),
      lastMessageTime: new Date(),
      messageCount: 0,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getContacts(): Contact[] {
    return Array.from(this.contacts.values());
  }

  getSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  updateContactAlias(contactId: string, alias: string): void {
    const contact = this.contacts.get(contactId);
    if (contact) {
      contact.alias = alias;
    }
  }

  verifyContact(contactId: string): void {
    const contact = this.contacts.get(contactId);
    if (contact) {
      contact.verified = true;
    }
  }

  deleteContact(contactId: string): void {
    this.contacts.delete(contactId);
    for (const [sessionId, session] of this.sessions) {
      if (session.contactId === contactId) {
        this.sessions.delete(sessionId);
      }
    }
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

export const sessionManager = new SessionManager();
