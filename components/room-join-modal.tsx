'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, dialogSheetMobile } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Users, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { RoomEncryption, roomEncryption } from '@/lib/room-encryption';
import { relayAPI } from '@/lib/relay-api';
import { createRoomKey, serializeRoomInvite, parseRoomInvite } from '@/lib/room-invite';

interface RoomJoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinRoom: (roomId: string, roomName: string, isNewRoom: boolean, isProtected?: boolean, passphrase?: string, roomKeyB64?: string) => void;
}

export function RoomJoinModal({ isOpen, onClose, onJoinRoom }: RoomJoinModalProps) {
  const [roomId, setRoomId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [joinPassphrase, setJoinPassphrase] = useState('');
  const [showJoinPassphrase, setShowJoinPassphrase] = useState(false);

  const [newRoomName, setNewRoomName] = useState('');
  const [createPassphrase, setCreatePassphrase] = useState('');
  const [showCreatePassphrase, setShowCreatePassphrase] = useState(false);
  const [roomInvite, setRoomInvite] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleCreateRoom = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const generatedId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const hasPassphrase = Boolean(createPassphrase.trim());

      let canary;
      if (hasPassphrase) {
        await roomEncryption.deriveKeyFromPassphrase(generatedId, createPassphrase.trim());
        canary = await roomEncryption.createCanary();
      }

      const res = await relayAPI.createRoom({
        id: generatedId,
        name: newRoomName.trim() || 'My Room',
        isProtected: hasPassphrase,
        canary,
      });

      if (res.roomId) {
        // Random-key Room (ADR-0003): the key is generated here and travels only in the Invite.
        let roomKeyB64: string | undefined;
        if (!hasPassphrase) {
          roomKeyB64 = await createRoomKey();
          await roomEncryption.importRoomKey(roomKeyB64);
        }
        const invite = serializeRoomInvite({
          roomId: res.roomId,
          roomName: newRoomName.trim() || 'My Room',
          keyB64: roomKeyB64,
          isProtected: hasPassphrase,
        });
        try {
          await navigator.clipboard.writeText(invite);
        } catch {
          // Clipboard may be unavailable; the invite is also shown by the info panel
        }
        onJoinRoom(
          res.roomId,
          newRoomName.trim() || 'My Room',
          true,
          hasPassphrase,
          hasPassphrase ? createPassphrase.trim() : undefined,
          roomKeyB64
        );
        setNewRoomName('');
        setCreatePassphrase('');
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!roomId.trim()) return;

    setError(null);
    setIsLoading(true);

    try {
      const cleanRoomId = roomId.trim();
      const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('anonchat_userid') || 'user_anon' : 'user_anon';
      const currentUsername = typeof window !== 'undefined' ? localStorage.getItem('anonchat_username') || 'User' : 'User';

      const joinResult = await relayAPI.joinRoom(cleanRoomId, currentUserId, currentUsername);

      if (joinResult.isProtected) {
        if (!joinPassphrase.trim()) {
          // Immediately leave room so relay does not track an unauthenticated phantom user
          await relayAPI.leaveRoom(cleanRoomId, currentUserId);
          setError('This Room requires a Room Passphrase. Please enter the Room Passphrase.');
          setIsLoading(false);
          return;
        }

        // Validate via Room Canary zero-knowledge trial decryption
        if (joinResult.canary) {
          const { valid } = await RoomEncryption.verifyPassphrase(
            cleanRoomId,
            joinPassphrase.trim(),
            joinResult.canary
          );

          if (!valid) {
            // Immediately leave room on canary verification failure
            await relayAPI.leaveRoom(cleanRoomId, currentUserId);
            setError('Incorrect Room Passphrase. Please check the secret and try again.');
            setIsLoading(false);
            return;
          }
        }
      }

      // An imported Room Invite carries the Room Key for random-key Rooms
      let importedRoomKey: string | undefined;
      try {
        const storedInvite = typeof window !== 'undefined' ? localStorage.getItem('pending_room_invite') : null;
        if (storedInvite) {
          const parsed = parseRoomInvite(storedInvite);
          if (parsed.roomId === cleanRoomId && parsed.keyB64) importedRoomKey = parsed.keyB64;
          localStorage.removeItem('pending_room_invite');
        }
      } catch {
        // Ignore malformed pending invites
      }

      onJoinRoom(
        cleanRoomId,
        joinResult.name || roomName.trim() || `Room ${cleanRoomId.slice(0, 6)}`,
        false,
        Boolean(joinResult.isProtected),
        joinPassphrase.trim() || undefined,
        importedRoomKey
      );

      setRoomId('');
      setRoomName('');
      setJoinPassphrase('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`sm:max-w-[500px] ${dialogSheetMobile}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Join or Create Room
          </DialogTitle>
          <DialogDescription>
            Connect with Contacts in encrypted anonymous Rooms via Tor
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-3 rounded-md flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Tabs defaultValue="join" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="join">Join Room</TabsTrigger>
            <TabsTrigger value="create">Create Room</TabsTrigger>
          </TabsList>

          <TabsContent value="join" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="roomInvite">Join with Invite (recommended)</Label>
              <div className="flex gap-2">
                <Input
                  id="roomInvite"
                  placeholder="anonchat-room-invite-v1:…"
                  value={roomInvite}
                  onChange={(e) => {
                    setRoomInvite(e.target.value);
                    setError(null);
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    try {
                      const parsed = parseRoomInvite(roomInvite.trim());
                      if (parsed.isProtected) {
                        setRoomId(parsed.roomId);
                        setRoomName(parsed.roomName);
                        setError('This Room needs its Room Passphrase — enter it below.');
                      } else if (parsed.keyB64) {
                        localStorage.setItem('pending_room_invite', roomInvite.trim());
                        setRoomId(parsed.roomId);
                        setRoomName(parsed.roomName);
                        setError(null);
                      } else {
                        setError('This Invite carries no Room Key and is not passphrase-protected.');
                      }
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Invalid Room Invite');
                    }
                  }}
                >
                  Use
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                An Invite carries the Room Key out-of-band. A Room ID alone grants discovery, not readability.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="roomId">Room ID</Label>
              <Input
                id="roomId"
                placeholder="Enter room ID (e.g., room_17926...)"
                value={roomId}
                onChange={(e) => {
                  setRoomId(e.target.value);
                  setError(null);
                }}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="joinPassphrase" className="flex items-center justify-between">
                <span>Room Passphrase</span>
                <span className="text-xs text-muted-foreground font-normal">Required for protected rooms</span>
              </Label>
              <div className="relative">
                <Input
                  id="joinPassphrase"
                  type={showJoinPassphrase ? 'text' : 'password'}
                  placeholder="Leave blank if room has no passphrase"
                  value={joinPassphrase}
                  onChange={(e) => {
                    setJoinPassphrase(e.target.value);
                    setError(null);
                  }}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowJoinPassphrase(!showJoinPassphrase)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showJoinPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="bg-muted/50 p-3.5 rounded-lg space-y-2 border border-border/40">
              <div className="flex items-start gap-2 text-xs">
                <Shield className="w-4 h-4 text-primary mt-0.5" />
                <div>
                  <p className="font-semibold mb-0.5">Zero-Knowledge Security</p>
                  <p className="text-muted-foreground">
                    Passphrases are stretched with 100k PBKDF2 iterations and verified client-side. The relay never sees your passphrase.
                  </p>
                </div>
              </div>
            </div>

            <Button onClick={handleJoinRoom} className="w-full" disabled={!roomId.trim() || isLoading}>
              {isLoading ? 'Verifying & Joining...' : 'Join Room'}
            </Button>
          </TabsContent>

          <TabsContent value="create" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="newRoomName">Room Name</Label>
              <Input
                id="newRoomName"
                placeholder="e.g., Privacy Advocates, Project Team"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="createPassphrase" className="flex items-center justify-between">
                <span>Room Passphrase (Optional)</span>
                <span className="text-xs text-muted-foreground font-normal">Leaves room public if empty</span>
              </Label>
              <div className="relative">
                <Input
                  id="createPassphrase"
                  type={showCreatePassphrase ? 'text' : 'password'}
                  placeholder="Set secret passphrase to restrict access"
                  value={createPassphrase}
                  onChange={(e) => setCreatePassphrase(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePassphrase(!showCreatePassphrase)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showCreatePassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="bg-primary/10 p-3.5 rounded-lg border border-primary/20 space-y-1.5 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-primary" />
                Room Passphrase Rules:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>If set, only Contacts who know the Room Passphrase can decrypt messages</li>
                <li>An encrypted Room Canary is created to verify joining Contacts</li>
                <li>Relay servers only route opaque ciphertext</li>
              </ul>
            </div>

            <Button onClick={handleCreateRoom} className="w-full" disabled={isLoading}>
              {isLoading ? 'Creating Room...' : 'Create New Room'}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
