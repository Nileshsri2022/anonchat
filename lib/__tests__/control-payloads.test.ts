// Ticket #21 — Typing indicators + opt-in read receipts (spec #14)
// Control payloads ride the same E2E channel; the Relay sees opaque ciphertext.
// Typing: on by default. Receipts: OFF by default, per-contact toggle — when
// off, NO receipt control message is ever sent.
import { describe, test, expect } from 'bun:test';

import { MemoryKVStore } from '../kv-store';
import { IdentityVault } from '../identity-vault';
import { exportIdentityBundle } from '../identity-bundle';
import { DirectMessageClient } from '../dm-service';
import { parseControlPayload, isControlPayload, CONTROL_TYPING, CONTROL_READ } from '../control-payloads';
import type { Contact } from '../contact-manager';
import type { MessageEnvelope } from '../direct-message-session';

const ITERS = 1000;

function contactFromBundle(id: string, alias: string, bundle: Awaited<ReturnType<typeof exportIdentityBundle>>): Contact {
  return {
    id,
    alias,
    identity: {
      id: `user_${alias}`,
      identityPublicKey: bundle.identityPublicKeySpkiB64,
      preKeyPublic: bundle.preKeyPublicSpkiB64,
      preKeyId: bundle.preKeyId,
      fingerprint: 'fp',
      identitySigningPublicKey: bundle.identitySigningPublicKeySpkiB64,
      preKeySignature: bundle.preKeySignatureB64,
      pqKemPublicB64: bundle.pqKemPublicB64,
      pqKemSignatureB64: bundle.pqKemSignatureB64,
    },
    verified: false,
    verificationCode: '',
    addedAt: new Date(),
    encryptionStatus: 'established',
  };
}

async function makeStack(name: string) {
  const vault = await IdentityVault.create({ store: new MemoryKVStore(), iterations: ITERS });
  const bundle = await exportIdentityBundle(vault);
  return { name, vault, bundle, client: new DirectMessageClient({ selfUserId: name, vault }) };
}

describe('Control payloads: typing + receipts (ticket 21)', () => {
  test('S1: control payload parse + rejection of malformed/foreign payloads', () => {
    expect(isControlPayload('{"t":"typing"}')).toBe(true);
    expect(isControlPayload('{"t":"read","upTo":3}')).toBe(true);
    expect(isControlPayload('hello')).toBe(false);
    expect(isControlPayload('{"t":"msg"}')).toBe(false);
    expect(parseControlPayload('{"t":"typing"}')).toEqual({ t: 'typing' });
    expect(parseControlPayload('{"t":"read","upTo":7}')).toEqual({ t: 'read', upTo: 7 });
    expect(() => parseControlPayload('{"t":"read"}')).toThrow(); // read without upTo
    expect(() => parseControlPayload('{"t":"read","upTo":-1}')).toThrow(); // nonsense pointer
    void CONTROL_TYPING;
    void CONTROL_READ;
  });

  test('S3: typing crosses the E2E channel; the relay only ever sees ciphertext', async () => {
    const alice = await makeStack('alice');
    const bob = await makeStack('bob');
    const wire: MessageEnvelope[] = [];
    const transport = async (room: string, env: MessageEnvelope) => {
      wire.push(env);
      void room;
    };

    await alice.client.sendToContact(contactFromBundle('cB', 'bob', bob.bundle), 'hey', undefined, transport);
    for (const env of [...wire]) await bob.client.handleInboundEnvelope(env);
    wire.length = 0;

    const typingEnvelope = await alice.client.sendTyping(alice.client.channels()[0], transport);
    expect(typingEnvelope.ciphertext).not.toContain('typing'); // sealed + opaque on the wire

    const control = await bob.client.handleInboundEnvelope(typingEnvelope);
    expect(control?.control?.type).toBe('typing');
    // Control payloads never land in the visible message history
    expect(bob.client.messages().some((m) => m.content.includes('typing'))).toBe(false);
  });

  test('S3: receipts OFF by default — zero receipt messages ever; ON — exactly one per read', async () => {
    const alice = await makeStack('alice');
    const bob = await makeStack('bob');
    const wire: MessageEnvelope[] = [];
    const transport = async (room: string, env: MessageEnvelope) => {
      wire.push(env);
      void room;
    };

    const contactB = contactFromBundle('cB', 'bob', bob.bundle);
    const contactA = contactFromBundle('cA', 'alice', alice.bundle);
    await alice.client.sendToContact(contactB, 'receipt me', undefined, transport);
    for (const env of [...wire]) await bob.client.handleInboundEnvelope(env);
    wire.length = 0;

    // Default: receipts OFF — sendReadReceipt is a no-op
    const sent = await bob.client.sendReadReceipt(bob.client.channels()[0], transport);
    expect(sent).toBe(false);
    expect(wire.length).toBe(0);

    // Opt-in per contact
    bob.client.setReadReceiptsEnabled(contactA.identity.identityPublicKey, true);
    const sent2 = await bob.client.sendReadReceipt(bob.client.channels()[0], transport);
    expect(sent2).toBe(true);
    expect(wire.length).toBe(2); // channel + inbox fan-out
    const control = await alice.client.handleInboundEnvelope(wire[0]);
    expect(control?.control?.type).toBe('read');
    // the single inbound message sits at sequence 0 — the receipt covers it
    expect(control?.control?.type === 'read' && control.control.upTo).toBe(0);
    // still no visible history entry on either side
    expect(alice.client.messages().some((m) => m.control)).toBe(false);
  });
});
