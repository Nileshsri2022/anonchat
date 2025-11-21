'use client';

import { Lock, CheckCircle, AlertCircle } from 'lucide-react';

interface MessageBubbleProps {
  content: string;
  sender: 'user' | 'other';
  timestamp: Date;
  encrypted: boolean;
  verified?: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
}

export function MessageBubble({
  content,
  sender,
  timestamp,
  encrypted,
  verified,
  status = 'delivered',
}: MessageBubbleProps) {
  const isUser = sender === 'user';
  const timeString = timestamp.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex items-end gap-2 max-w-xs ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      >
        <div
          className={`px-4 py-2.5 rounded-lg ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-none'
              : 'bg-card border border-border rounded-bl-none'
          }`}
        >
          <p className="break-words leading-relaxed">{content}</p>
          <div className="flex items-center justify-between gap-2 mt-1">
            <span className={`text-xs ${isUser ? 'opacity-70' : 'text-muted-foreground'}`}>
              {timeString}
            </span>
            {encrypted && (
              <Lock className={`w-3 h-3 ${isUser ? 'opacity-70' : 'opacity-50'}`} />
            )}
          </div>
        </div>

        {isUser && status && (
          <div className="flex items-center">
            {status === 'sending' && (
              <div className="w-4 h-4 rounded-full border-2 border-muted-foreground border-t-primary animate-spin" />
            )}
            {status === 'sent' && (
              <CheckCircle className="w-4 h-4 text-muted-foreground" />
            )}
            {status === 'delivered' && (
              <CheckCircle className="w-4 h-4 text-muted-foreground" />
            )}
            {status === 'read' && (
              <CheckCircle className="w-4 h-4 text-success" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
