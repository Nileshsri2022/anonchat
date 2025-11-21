// Enhanced Message Encryption Service using Double Ratchet

import {
  encryptMessage,
  decryptMessage,
  kdfChain,
  DoubleRatchetState,
} from './crypto';

export interface EncryptedMessage {
  ciphertext: string;
  iv: string;
  tag: string;
  messageNumber: number;
  sessionId: string;
}

export interface DecryptedMessage {
  plaintext: string;
  messageNumber: number;
  senderSessionId: string;
}

export class MessageEncryption {
  private ratchetStates: Map<string, DoubleRatchetState> = new Map();

  async initializeSession(
    sessionId: string,
    initialState: DoubleRatchetState
  ): Promise<void> {
    this.ratchetStates.set(sessionId, { ...initialState });
  }

  async encryptMessage(
    sessionId: string,
    plaintext: string
  ): Promise<EncryptedMessage> {
    const state = this.ratchetStates.get(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Advance sending chain
    const { messageKey, nextChainKey } = await kdfChain(state.sendingChainKey);
    state.sendingChainKey = nextChainKey;
    state.messageNumber++;

    // Encrypt message
    const { ciphertext, iv, tag } = await encryptMessage(plaintext, messageKey);

    return {
      ciphertext,
      iv,
      tag,
      messageNumber: state.messageNumber,
      sessionId,
    };
  }

  async decryptMessage(
    sessionId: string,
    encryptedMsg: EncryptedMessage
  ): Promise<DecryptedMessage> {
    const state = this.ratchetStates.get(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Advance receiving chain
    const { messageKey, nextChainKey } = await kdfChain(state.receivingChainKey);
    state.receivingChainKey = nextChainKey;

    // Decrypt message
    const plaintext = await decryptMessage(
      encryptedMsg.ciphertext,
      encryptedMsg.iv,
      encryptedMsg.tag,
      messageKey
    );

    return {
      plaintext,
      messageNumber: encryptedMsg.messageNumber,
      senderSessionId: sessionId,
    };
  }

  getSessionState(sessionId: string): DoubleRatchetState | undefined {
    return this.ratchetStates.get(sessionId);
  }
}

export const messageEncryption = new MessageEncryption();
