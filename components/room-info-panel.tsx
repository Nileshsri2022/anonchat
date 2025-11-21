'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Users, Shield, Lock, Copy, Check } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useState } from 'react';

interface RoomInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  roomId: string;
  userCount: number;
  users: Array<{ id: string; username: string; online: boolean }>;
  createdAt: Date;
  messageCount: number;
}

export function RoomInfoPanel({
  isOpen,
  onClose,
  roomName,
  roomId,
  userCount,
  users,
  createdAt,
  messageCount,
}: RoomInfoPanelProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-80 border-l border-border bg-muted/20 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold">Room Info</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h4 className="font-semibold text-lg mb-1">{roomName}</h4>
            <p className="text-sm text-muted-foreground">{userCount} users online</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">
                Room ID
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded-lg text-xs font-mono">
                  {roomId}
                </code>
                <Button size="sm" variant="ghost" onClick={copyRoomId}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">
                Security
              </label>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="w-4 h-4 text-primary" />
                  <span>End-to-End Encrypted</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Lock className="w-4 h-4 text-primary" />
                  <span>Tor Network Protected</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  All messages encrypted with AES-256-GCM. The relay cannot read your messages.
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">
                Statistics
              </label>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{createdAt.toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Messages</span>
                  <span>{messageCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Online Users</span>
                  <span>{userCount}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">
                Users ({users.length})
              </label>
              <div className="space-y-2">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold">
                      {user.username[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{user.username}</p>
                    </div>
                    <Badge variant={user.online ? 'default' : 'secondary'} className="text-xs">
                      {user.online ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
