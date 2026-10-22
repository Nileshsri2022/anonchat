// Control payloads (ticket 21): typing indicators and read receipts ride the
// same end-to-end encrypted channel as content. Typing is on by default;
// read receipts are OFF by default with a per-contact opt-in — "seen" is
// metadata, so it is never emitted unless the user chose it.

export interface TypingControl {
  t: 'typing';
}

export interface ReadControl {
  t: 'read';
  /** All messages up to and including this inbound sequence were read. */
  upTo: number;
}

export type ControlPayload = TypingControl | ReadControl;

export const CONTROL_TYPING: TypingControl = { t: 'typing' };
export const CONTROL_READ = (upTo: number): ReadControl => ({ t: 'read', upTo });

export function isControlPayload(content: string): boolean {
  if (!content.startsWith('{"t":')) return false;
  try {
    const parsed = JSON.parse(content) as { t?: string };
    return parsed.t === 'typing' || parsed.t === 'read';
  } catch {
    return false;
  }
}

export function parseControlPayload(content: string): ControlPayload {
  const parsed = JSON.parse(content) as Partial<ControlPayload>;
  if (parsed.t === 'typing') return { t: 'typing' };
  if (parsed.t === 'read' && typeof parsed.upTo === 'number' && Number.isInteger(parsed.upTo) && parsed.upTo >= 0) {
    return { t: 'read', upTo: parsed.upTo };
  }
  throw new Error('Malformed control payload');
}

export function serializeControlPayload(control: ControlPayload): string {
  return JSON.stringify(control);
}
