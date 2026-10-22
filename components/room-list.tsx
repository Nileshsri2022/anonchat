'use client';

import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Shield, Plus, Settings, UsersRound, Lock } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/theme-toggle';

export interface Room {
  id: string;
  name: string;
  userCount: number;
  lastActivity: Date;
  encrypted: boolean;
  isProtected?: boolean;
  passphrase?: string;
}

interface RoomListProps {
  rooms: Room[];
  selectedId: string | null;
  onSelect: (roomId: string) => void;
  onCreateRoom: () => void;
  onCreateGroup?: () => void;
  onOpenSettings?: () => void;
}

export const RoomList = memo(function RoomList({ rooms, selectedId, onSelect, onCreateRoom, onCreateGroup, onOpenSettings }: RoomListProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="pl-4 pr-12 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 className="font-semibold text-lg text-foreground">Chatrooms</h2>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {onOpenSettings && (
              <Button variant="ghost" size="sm" onClick={onOpenSettings}>
                <Settings className="w-4 h-4" />
              </Button>
            )}
            <Button size="sm" onClick={onCreateRoom}>
              <Plus className="w-4 h-4 mr-1" />
              New
            </Button>
            {onCreateGroup && rooms.length > 0 && (
              <Button size="sm" variant="outline" onClick={onCreateGroup}>
                <UsersRound className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Join or create anonymous encrypted chatrooms
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {rooms.length === 0 ? (
            <div className="text-center py-8 px-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                No rooms yet. Create or join a room to start chatting.
              </p>
              <Button size="sm" onClick={onCreateRoom} variant="outline">
                Create Room
              </Button>
            </div>
          ) : (
            rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => onSelect(room.id)}
                className={`w-full p-3 rounded-lg text-left transition-colors ${selectedId === room.id
                  ? 'bg-primary/10 border border-primary/20'
                  : 'hover:bg-muted border border-transparent'
                  }`}
              >
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
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
});
