'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Users, Lock } from 'lucide-react';

interface RoomJoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinRoom: (roomId: string, roomName: string, isNewRoom: boolean) => void;
}

export function RoomJoinModal({ isOpen, onClose, onJoinRoom }: RoomJoinModalProps) {
  const [roomId, setRoomId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [newRoomName, setNewRoomName] = useState('');

  const generateRoomId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 12; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  };

  const handleCreateRoom = async () => {
    try {
      const response = await fetch('/api/relay/rooms', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        onJoinRoom(data.roomId, newRoomName || 'My Room', true);
        setNewRoomName('');
        onClose();
      } else {
        alert('Error creating room: ' + data.error);
      }
    } catch (error) {
      alert('Error creating room: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleJoinRoom = () => {
    if (roomId.trim()) {
      onJoinRoom(roomId.trim(), roomName || `Room ${roomId.slice(0, 6)}`, false);
      setRoomId('');
      setRoomName('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Join or Create Chatroom
          </DialogTitle>
          <DialogDescription>
            Connect with multiple users in encrypted anonymous chatrooms via Tor
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="join" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="join">Join Room</TabsTrigger>
            <TabsTrigger value="create">Create Room</TabsTrigger>
          </TabsList>

          <TabsContent value="join" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="roomId">Room ID</Label>
              <Input
                id="roomId"
                placeholder="Enter room ID (e.g., abc123def456)"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Get the room ID from the person who created the room
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="roomName">Room Name (optional)</Label>
              <Input
                id="roomName"
                placeholder="Give this room a name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
            </div>

            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <div className="flex items-start gap-2 text-xs">
                <Shield className="w-4 h-4 text-primary mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">End-to-End Encrypted</p>
                  <p className="text-muted-foreground">All messages are encrypted with AES-256-GCM. The relay cannot read your messages.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <Lock className="w-4 h-4 text-primary mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">Tor Protected</p>
                  <p className="text-muted-foreground">Your IP address and location are hidden via the Tor network.</p>
                </div>
              </div>
            </div>

            <Button onClick={handleJoinRoom} className="w-full" disabled={!roomId.trim()}>
              Join Room
            </Button>
          </TabsContent>

          <TabsContent value="create" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="newRoomName">Room Name</Label>
              <Input
                id="newRoomName"
                placeholder="e.g., Privacy Advocates, Study Group"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
              />
            </div>

            <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
              <p className="text-sm font-semibold mb-2">How it works:</p>
              <ol className="text-xs space-y-1 text-muted-foreground list-decimal list-inside">
                <li>A unique room ID will be generated</li>
                <li>Share the room ID with people you want to join</li>
                <li>Everyone with the room ID can join and chat</li>
                <li>Messages are encrypted and routed via Tor</li>
                <li>No registration or personal info required</li>
              </ol>
            </div>

            <Button onClick={handleCreateRoom} className="w-full">
              Create New Room
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
