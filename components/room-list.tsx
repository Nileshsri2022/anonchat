'use client';

import { memo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Shield, Plus, Settings, Lock, Search } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/theme-toggle';
import { Input } from '@/components/ui/input';

export interface Room {
  id: string;
  name: string;
  userCount: number;
  lastActivity: Date;
  encrypted: boolean;
  createdAt?: Date;
  isProtected?: boolean;
  passphrase?: string;
  roomKeyB64?: string;
}

interface RoomListProps {
  rooms: Room[];
  selectedId: string | null;
  onSelect: (roomId: string) => void;
  onCreateRoom: () => void;
  onOpenSettings?: () => void;
}

export const RoomList = memo(function RoomList({ rooms, selectedId, onSelect, onCreateRoom, onOpenSettings }: RoomListProps) {
  const [query, setQuery] = useState('');
  const [anonId, setAnonId] = useState('');
  useEffect(() => {
    const id = localStorage.getItem('anonchat_userid') || '';
    setAnonId(id ? `anon-${id.slice(5, 9)}` : 'anon');
  }, []);
  const visible = query.trim()
    ? rooms.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
    : rooms;
  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div className="pl-4 pr-12 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 className="font-semibold text-base text-foreground">AnonChat</h2>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {onOpenSettings && (
              <Button variant="ghost" size="sm" onClick={onOpenSettings}>
                <Settings className="w-4 h-4" />
              </Button>
            )}
            <Button size="sm" onClick={onCreateRoom} className="max-sm:hidden">
              <Plus className="w-4 h-4 mr-1" />
              New
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rooms"
            className="pl-9 h-9 bg-background"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {visible.length === 0 ? (
            <div className="text-center py-8 px-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {query.trim() ? 'No rooms match your search.' : 'No rooms yet. Create or join a room to start chatting.'}
              </p>
              <Button size="sm" onClick={onCreateRoom} variant="outline">
                Create Room
              </Button>
            </div>
          ) : (
            visible.map((room) => (
              <button
                key={room.id}
                onClick={() => onSelect(room.id)}
                className={`w-full p-3 rounded-lg text-left transition-colors border-l-2 ${selectedId === room.id
                  ? 'bg-primary/5 border-primary'
                  : 'hover:bg-muted/60 border-transparent'
                  }`}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-secondary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-semibold text-sm">
                    {room.isProtected && (
                      <span title="Room Passphrase Protected" className="flex items-center">
                        <Lock className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                      </span>
                    )}
                    <span className="truncate">{room.name}</span>
                  </div>
                  {room.encrypted && <Shield className="w-3 h-3 text-primary flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {room.userCount} online
                  </span>
                  <span>•</span>
                  <span>{room.lastActivity.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-xs">
                    ID: {room.id.slice(0, 8)}...
                  </Badge>
                  {room.isProtected && (
                    <Badge variant="outline" className="text-[10px] text-warning border-warning/30 bg-warning/10">
                      Protected
                    </Badge>
                  )}
                </div>
                  </div>
                  </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>

      {/* mobile FAB (mockup 11) */}
      <button
        onClick={onCreateRoom}
        aria-label="New room"
        className="sm:hidden absolute bottom-20 right-4 z-10 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* identity footer (mockup 02) */}
      <div className="border-t border-border px-4 py-3 flex items-center gap-3">
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-secondary-foreground">
            {anonId.slice(5, 6).toUpperCase() || 'A'}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-card" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{anonId || 'anon'}</p>
          <p className="text-xs text-muted-foreground">anonymous · encrypted</p>
        </div>
      </div>
    </div>
  );
});
