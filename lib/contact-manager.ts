// Enhanced Contact Management with Verification

// Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export interface ContactIdentity {
  id: string;
  identityPublicKey: string;
  preKeyPublic: string;
  preKeyId: number;
  fingerprint: string;
  /** Signing public key (SPKI base64 or JWK JSON) used to verify the Pre-Key signature. */
  identitySigningPublicKey?: string;
  /** ECDSA-P256-SHA-256 signature over the Pre-Key's SPKI bytes (base64). */
  preKeySignature?: string;
}

export interface Contact {
  id: string;
  alias: string;
  identity: ContactIdentity;
  verified: boolean;
  verificationCode: string;
  addedAt: Date;
  lastSeen?: Date;
  encryptionStatus: 'pending' | 'established' | 'verified';
}

export class ContactManager {
  private contacts: Map<string, Contact> = new Map();
  private verificationPending: Map<string, string> = new Map();

  addContact(alias: string, identity: ContactIdentity): Contact {
    console.log('➕ Adding new contact:', alias, 'with ID pattern:', identity.id);

    const contact: Contact = {
      id: `contact_${Date.now()}`,
      alias,
      identity,
      verified: false,
      verificationCode: '',
      addedAt: new Date(),
      encryptionStatus: 'pending',
    };

    console.log('📝 Created contact with ID:', contact.id);

    this.contacts.set(contact.id, contact);
    return contact;
  }

  /**
   * Records the key-derived SAS (Short Authentication String) for a Contact.
   * Both peers derive the identical SAS from their identity keys — no randomness.
   */
  setVerificationSas(contactId: string, sas: string): void {
    const contact = this.contacts.get(contactId);
    if (contact) {
      contact.verificationCode = sas;
      this.verificationPending.set(contactId, sas);
    }
  }

  /** Marks a Contact verified once the SAS has been compared out-of-band. */
  markVerified(contactId: string): void {
    const contact = this.contacts.get(contactId);
    if (contact) {
      contact.verified = true;
      contact.encryptionStatus = 'verified';
      this.verificationPending.delete(contactId);
    }
  }

  verifyContact(contactId: string, code: string): boolean {
    const expectedCode = this.verificationPending.get(contactId);
    if (expectedCode && timingSafeEqual(expectedCode, code)) {
      const contact = this.contacts.get(contactId);
      if (contact) {
        contact.verified = true;
        contact.encryptionStatus = 'verified';
        this.verificationPending.delete(contactId);
        return true;
      }
    }
    return false;
  }

  establishEncryption(contactId: string): void {
    const contact = this.contacts.get(contactId);
    if (contact && contact.encryptionStatus === 'pending') {
      contact.encryptionStatus = 'established';
    }
  }

  getContact(contactId: string): Contact | undefined {
    return this.contacts.get(contactId);
  }

  getAllContacts(): Contact[] {
    return Array.from(this.contacts.values());
  }

  updateContactLastSeen(contactId: string): void {
    const contact = this.contacts.get(contactId);
    if (contact) {
      contact.lastSeen = new Date();
    }
  }

  deleteContact(contactId: string): void {
    this.contacts.delete(contactId);
    this.verificationPending.delete(contactId);
  }

}

export const contactManager = new ContactManager();
