'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { RoomList } from '@/components/room-list';
import { ContactList } from '@/components/contact-list';
import { ChatroomInterface } from '@/components/chatroom-interface';
import { DirectMessageInterface } from '@/components/direct-message-interface';
import { RoomInfoPanel } from '@/components/room-info-panel';
import { Button } from '@/components/ui/button';
import { PanelLeftClose, PanelLeft, MessageSquare } from 'lucide-react';
import { contactManager, type Contact } from '@/lib/contact-manager';

// Dynamic imports for modals - reduces initial bundle by ~40-50KB
const OnboardingModal = dynamic(
  () => import('@/components/onboarding-modal').then(m => ({ default: m.OnboardingModal })),
  { ssr: false }
);

const RoomJoinModal = dynamic(
  () => import('@/components/room-join-modal').then(m => ({ default: m.RoomJoinModal })),
  { ssr: false }
);

const SettingsPanel = dynamic(
  () => import('@/components/settings-panel').then(m => ({ default: m.SettingsPanel })),
  { ssr: false }
);

const CreateGroupModal = dynamic(
  () => import('@/components/create-group-modal').then(m => ({ default: m.CreateGroupModal })),
  { ssr: false }
);

interface Room {
  id: string;
  name: string;
  userCount: number;
  lastActivity: Date;
  encrypted: boolean;
  isProtected?: boolean;
  passphrase?: string;
}

export default function Home() {
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRoomJoin, setShowRoomJoin] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [currentView, setCurrentView] = useState<'rooms' | 'contacts'>('rooms');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('anonchat_onboarding_complete');
    if (hasSeenOnboarding) {
      setShowOnboarding(false);
    }

    // Check for pending contacts from QR scans
    const pendingContact = localStorage.getItem('pending_contact');
    if (pendingContact) {
      try {
        const contactData = JSON.parse(pendingContact);
        import('@/lib/contact-manager').then(({ contactManager }) => {
          const existingContact = contactManager.getContact(contactData.id);
          if (!existingContact) {
            const contact = contactManager.addContact(
              `Contact ${contactData.id.slice(-4)}`,
              {
                id: contactData.id,
                identityPublicKey: contactData.identityPublic,
                preKeyPublic: contactData.preKeyPublic,
                preKeyId: contactData.preKeyId,
                fingerprint: contactData.fingerprint || 'pending'
              }
            );
            contactManager.establishEncryption(contact.id);
          }
          localStorage.removeItem('pending_contact');
        });
      } catch (error) {
        console.error('❌ Failed to process pending contact:', error);
        localStorage.removeItem('pending_contact');
      }
    }
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    localStorage.setItem('anonchat_onboarding_complete', 'true');
    setShowOnboarding(false);
    setShowRoomJoin(true);
  }, []);

  const handleJoinRoom = useCallback((roomId: string, roomName: string, isNewRoom: boolean, isProtected?: boolean, passphrase?: string) => {
    setRooms(prev => {
      const existingRoom = prev.find(r => r.id === roomId);
      if (!existingRoom) {
        const newRoom: Room = {
          id: roomId,
          name: roomName,
          userCount: isNewRoom ? 1 : 3,
          lastActivity: new Date(),
          encrypted: true,
          isProtected: Boolean(isProtected),
          passphrase,
        };
        return [...prev, newRoom];
      } else if (passphrase && !existingRoom.passphrase) {
        return prev.map(r => r.id === roomId ? { ...r, passphrase, isProtected: true } : r);
      }
      return prev;
    });
    setSelectedContact(null);
    setSelectedRoom(roomId);
  }, []);

  const handleLeaveRoom = useCallback(() => {
    setSelectedRoom(null);
    setShowInfoPanel(false);
  }, []);

  const handleCreateGroup = useCallback((groupName: string, selectedRoomIds: string[], selectedContactIds: string[]) => {
    const groupRoom: Room = {
      id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: groupName,
      userCount: selectedRoomIds.length + selectedContactIds.length + 1,
      lastActivity: new Date(),
      encrypted: true,
    };
    setRooms(prev => [...prev, groupRoom]);
    setSelectedContact(null);
    setSelectedRoom(groupRoom.id);
  }, []);

  const handleSelectRoom = useCallback((id: string) => {
    setSelectedContact(null);
    setSelectedRoom(id);
  }, []);

  const handleStartChatWithContact = useCallback((contactId: string) => {
    const contact = contactManager.getContact(contactId);
    if (contact) {
      setSelectedRoom(null);
      setSelectedContact(contact);
    }
  }, []);

  const selectedRoomData = useMemo(() => rooms.find(r => r.id === selectedRoom), [rooms, selectedRoom]);

  if (showOnboarding) {
    return <OnboardingModal onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar with tabs */}
      {sidebarOpen && (
        <div className="w-80 border-r border-border bg-muted/20 flex flex-col relative">
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 z-10 h-8 w-8"
            onClick={() => setSidebarOpen(false)}
            title="Close sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>

          {/* View Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setCurrentView('rooms')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${currentView === 'rooms'
                ? 'bg-background border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              Rooms
            </button>
            <button
              onClick={() => setCurrentView('contacts')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${currentView === 'contacts'
                ? 'bg-background border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              Contacts
            </button>
          </div>

          {/* Content based on current view */}
          {currentView === 'rooms' ? (
            <RoomList
              rooms={rooms}
              selectedId={selectedRoom}
              onSelect={handleSelectRoom}
              onCreateRoom={() => setShowRoomJoin(true)}
              onCreateGroup={() => setShowCreateGroup(true)}
              onOpenSettings={() => setShowSettings(true)}
            />
          ) : (
            <ContactList
              onStartChat={handleStartChatWithContact}
            />
          )}
        </div>
      )}

      {/* Sidebar open button when collapsed */}
      {!sidebarOpen && (
        <div className="border-r border-border bg-muted/20 p-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            title="Open sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Main Chat Viewport */}
      {selectedContact ? (
        <DirectMessageInterface
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onContactVerified={() => {
            const updated = contactManager.getContact(selectedContact.id);
            if (updated) setSelectedContact({ ...updated });
          }}
        />
      ) : selectedRoom && selectedRoomData ? (
        <>
          <ChatroomInterface
            roomId={selectedRoom}
            roomName={selectedRoomData.name}
            isProtected={selectedRoomData.isProtected}
            passphrase={selectedRoomData.passphrase}
            onOpenInfo={() => setShowInfoPanel(!showInfoPanel)}
            onLeaveRoom={handleLeaveRoom}
          />

          <RoomInfoPanel
            isOpen={showInfoPanel}
            onClose={() => setShowInfoPanel(false)}
            roomName={selectedRoomData.name}
            roomId={selectedRoom}
            userCount={selectedRoomData.userCount}
            users={[
              { id: '1', username: 'Alice', online: true },
              { id: '2', username: 'Bob', online: true },
              { id: '3', username: 'Charlie', online: false },
            ]}
            createdAt={new Date()}
            messageCount={42}
          />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-muted/20">
          <div className="text-center text-muted-foreground max-w-md px-8">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Conversation Selected</h3>
            <p className="text-sm mb-4">
              Select or join a Room, or choose a Contact from the sidebar to start secure, anonymous messaging over Tor.
            </p>
          </div>
        </div>
      )}

      <RoomJoinModal
        isOpen={showRoomJoin}
        onClose={() => setShowRoomJoin(false)}
        onJoinRoom={handleJoinRoom}
      />

      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        rooms={rooms}
        onCreateGroup={handleCreateGroup}
      />
    </div>
  );
}
