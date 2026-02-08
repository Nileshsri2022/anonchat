'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { RoomList } from '@/components/room-list';
import { ContactList } from '@/components/contact-list';
import { ChatroomInterface } from '@/components/chatroom-interface';
import { RoomInfoPanel } from '@/components/room-info-panel';
import { Button } from '@/components/ui/button';
import { PanelLeftClose, PanelLeft } from 'lucide-react';

// Dynamic imports for modals - reduces initial bundle by ~40-50KB
// These components are only loaded when needed
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
}

export default function Home() {
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
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
        // Import the contact manager dynamically to avoid circular imports
        import('@/lib/contact-manager').then(({ contactManager }) => {
          console.log('🔍 Processing pending contact:', contactData.id);

          // Check if contact already exists to prevent duplicates
          const existingContact = contactManager.getContact(contactData.id);
          console.log('🔍 Existing contact check:', existingContact ? 'EXISTS' : 'NOT FOUND');

          if (!existingContact) {
            // Add the contact with a default alias
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

            // Establish encryption for QR-scanned contacts so they show "Ready to verify"
            contactManager.establishEncryption(contact.id);

            console.log('✅ Contact added from pending data:', contact);
          } else {
            console.log('ℹ️ Contact already exists, skipping duplicate add');
          }

          console.log('🗑️ Removing pending_contact from localStorage');
          localStorage.removeItem('pending_contact');

          console.log('📋 Current contacts after processing:', contactManager.getAllContacts().length);
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

  const handleJoinRoom = useCallback((roomId: string, roomName: string, isNewRoom: boolean) => {
    setRooms(prev => {
      const existingRoom = prev.find(r => r.id === roomId);
      if (!existingRoom) {
        const newRoom: Room = {
          id: roomId,
          name: roomName,
          userCount: isNewRoom ? 1 : 3,
          lastActivity: new Date(),
          encrypted: true,
        };
        return [...prev, newRoom];
      }
      return prev;
    });
    setSelectedRoom(roomId);
  }, []);

  const handleLeaveRoom = useCallback(() => {
    setSelectedRoom(null);
    setShowInfoPanel(false);
  }, []);

  const handleCreateGroup = useCallback((groupName: string, selectedRoomIds: string[], selectedContactIds: string[]) => {
    // Create a new group room that combines selected rooms/contacts
    const groupRoom: Room = {
      id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: groupName,
      userCount: selectedRoomIds.length + selectedContactIds.length + 1, // +1 for creator
      lastActivity: new Date(),
      encrypted: true,
    };
    setRooms(prev => [...prev, groupRoom]);
    setSelectedRoom(groupRoom.id);
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
              onSelect={setSelectedRoom}
              onCreateRoom={() => setShowRoomJoin(true)}
              onCreateGroup={() => setShowCreateGroup(true)}
              onOpenSettings={() => setShowSettings(true)}
            />
          ) : (
            <ContactList
              onStartChat={(contactId, contactName) => {
                // Reuse the same room join modal as the +New button
                setShowRoomJoin(true);
              }}
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

      {selectedRoom && selectedRoomData ? (
        <>
          <ChatroomInterface
            roomId={selectedRoom}
            roomName={selectedRoomData.name}
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
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">No Room Selected</h3>
            <p className="text-sm mb-4">
              Create or join a chatroom to start secure anonymous conversations with multiple users.
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
