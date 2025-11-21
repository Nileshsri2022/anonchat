'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Shield, Plus, Settings } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/theme-toggle';

interface Room {
  id: string;
  name: string;
  userCount: number;
  lastActivity: Date;
  encrypted: boolean;
}

interface RoomListProps {
  rooms: Room[];
  selectedId: string | null;
  onSelect: (roomId: string) => void;
  onCreateRoom: () => void;
  onOpenSettings?: () => void;
}

export function RoomList({ rooms, selectedId, onSelect, onCreateRoom, onOpenSettings }: RoomListProps) {
  return (
    <div className="w-80 border-r border-border bg-muted/20 flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
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
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  selectedId === room.id
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-muted border border-transparent'
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="font-semibold text-sm">{room.name}</span>
                  {room.encrypted && <Shield className="w-3 h-3 text-primary" />}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {room.userCount} online
                  </span>
                  <span>•</span>
                  <span>{room.lastActivity.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="mt-2">
                  <Badge variant="secondary" className="text-xs">
                    ID: {room.id.slice(0, 8)}...
                  </Badge>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
