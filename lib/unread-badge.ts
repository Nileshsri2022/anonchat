// In-app notifications (ADR-0010, ticket 23): unread badge in the tab title.
// Web Push is deferred; while the app is visible, toasts handle awareness.

/** Pure: the document title for a given unread count (badge in parentheses at 1+). */
export function unreadTitle(baseTitle: string, unread: number): string {
  return unread > 0 ? `(${unread}) ${baseTitle}` : baseTitle;
}

/** Tracks unread state for the tab-title badge. DOM writes stay with the caller. */
export class UnreadBadge {
  private unread = 0;
  private visible = true;

  constructor(
    private readonly baseTitle: string,
    private readonly onTitle: (title: string) => void,
  ) {
    this.onTitle(unreadTitle(baseTitle, 0));
  }

  /** A message arrived: bump the badge unless the surface is already visible. */
  onIncoming(): void {
    if (this.visible) return;
    this.unread += 1;
    this.onTitle(unreadTitle(this.baseTitle, this.unread));
  }

  /** The user looked at the app: clear the badge. */
  onVisible(): void {
    this.visible = true;
    this.unread = 0;
    this.onTitle(unreadTitle(this.baseTitle, 0));
  }

  onHidden(): void {
    this.visible = false;
  }

  count(): number {
    return this.unread;
  }
}
