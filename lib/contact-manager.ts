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
      verificationCode: this.generateVerificationCode(),
      addedAt: new Date(),
      encryptionStatus: 'pending',
    };

    console.log('📝 Created contact with ID:', contact.id);
    console.log('🔢 Generated verification code for contact:', contact.verificationCode);

    this.contacts.set(contact.id, contact);
    this.verificationPending.set(contact.id, contact.verificationCode);

    console.log('📊 Total contacts after add:', this.contacts.size);
    console.log('📋 All contact IDs:', Array.from(this.contacts.keys()));

    return contact;
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

  private generateVerificationCode(): string {
    // Generate 6-digit numeric code (1,000,000 possible combinations)
    const randomBytes = crypto.getRandomValues(new Uint8Array(4));
    const randomNumber = (randomBytes[0] << 24) | (randomBytes[1] << 16) | (randomBytes[2] << 8) | randomBytes[3];
    return (randomNumber % 1000000).toString().padStart(6, '0');
  }
}

export const contactManager = new ContactManager();
