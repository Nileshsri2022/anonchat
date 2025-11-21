'use client';

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-1.5 px-3 py-2 rounded-lg bg-card border border-border">
        <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}
