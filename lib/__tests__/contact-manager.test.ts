import { describe, test, expect } from 'bun:test';
import { ContactManager } from '../contact-manager';
import { identityService } from '../identity-service';

describe('ContactManager & IdentityService', () => {
  test('adds contact and generates 6-digit verification code', () => {
    const manager = new ContactManager();
    const contact = manager.addContact('Alice', {
      id: 'user_alice_456',
      identityPublicKey: 'id_pub_base64',
      preKeyPublic: 'pre_pub_base64',
      preKeyId: 1,
      fingerprint: 'A1B2-C3D4-E5F6',
    });

    expect(contact.alias).toBe('Alice');
    expect(contact.verified).toBe(false);
    expect(contact.verificationCode).toMatch(/^\d{6}$/);

    const fetched = manager.getContact(contact.id);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(contact.id);
  });

  test('verifies contact with correct verification code and rejects incorrect code', () => {
    const manager = new ContactManager();
    const contact = manager.addContact('Bob', {
      id: 'user_bob_789',
      identityPublicKey: 'bob_id_pub',
      preKeyPublic: 'bob_pre_pub',
      preKeyId: 1,
      fingerprint: 'B2C3-D4E5-F6A1',
    });

    // Wrong code fails
    const failResult = manager.verifyContact(contact.id, '000000');
    expect(failResult).toBe(false);
    expect(manager.getContact(contact.id)?.verified).toBe(false);

    // Correct code succeeds
    const successResult = manager.verifyContact(contact.id, contact.verificationCode);
    expect(successResult).toBe(true);
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
