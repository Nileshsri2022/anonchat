import { describe, test, expect } from 'bun:test';
import { ContactManager } from '../contact-manager';
import { identityService } from '../identity-service';

describe('ContactManager & IdentityService', () => {
  const manager = new ContactManager();
  const sampleIdentity = {
    id: 'user_bob_789',
    identityPublicKey: 'BOB-IDENTITY-PK',
    preKeyPublic: 'BOB-PREKEY-PK',
    preKeyId: 1,
    fingerprint: 'AAAA-BBBB-CCCC',
  };

  test('adds a Contact without minting any verification secret', () => {
    const contact = manager.addContact('Bob', sampleIdentity);
    expect(contact.verificationCode).toBe('');
    expect(contact.verified).toBe(false);
  });

  test('SAS-driven verification: wrong SAS rejected, recorded SAS accepted', () => {
    const contact = manager.addContact('Bob', sampleIdentity);
    manager.setVerificationSas(contact.id, '123456');

    const wrong = manager.verifyContact(contact.id, '000000');
    expect(wrong).toBe(false);
    expect(manager.getContact(contact.id)?.verified).toBe(false);

    const right = manager.verifyContact(contact.id, '123456');
    expect(right).toBe(true);
    expect(manager.getContact(contact.id)?.verified).toBe(true);
  });

  test('identityService generates and validates SHA-256 fingerprint', async () => {
    const rawKey = 'sample-public-key-data-12345';
    const fp = await identityService.generateFingerprint(rawKey);

    expect(typeof fp).toBe('string');
    // Expected format: XXXX-XXXX-XXXX-...
    expect(fp).toContain('-');
    expect(fp.split('-')[0].length).toBe(4);

    identityService.storeFingerprint('user_charlie', fp);
    expect(identityService.verifyFingerprint('user_charlie', fp)).toBe(true);
    expect(identityService.verifyFingerprint('user_charlie', 'WRONG-FP')).toBe(false);
  });
});

describe('ContactManager — Ticket 09: honest verification', () => {
  test('no random verification codes are minted; verification is driven by key-derived SAS', async () => {
    const { contactManager } = await import('../contact-manager');
    const contact = contactManager.addContact('Eve', {
      id: 'bundle_test1',
      identityPublicKey: 'pkA',
      preKeyPublic: 'pkB',
      preKeyId: 1,
      fingerprint: 'FP',
    });
    // The stored code is empty: the challenge comes from deriveSas, never randomness
    expect(contact.verificationCode).toBe('');

    // Wrong SAS does not verify
    expect(contactManager.verifyContact(contact.id, '000000')).toBe(false);
    expect(contactManager.getContact(contact.id)?.verified).toBe(false);

    // markVerified is the honest path once the SAS has been compared out-of-band
    contactManager.markVerified(contact.id);
    expect(contactManager.getContact(contact.id)?.verified).toBe(true);
  });
});
