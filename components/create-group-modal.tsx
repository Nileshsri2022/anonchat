'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Search, X, ArrowRight, Check } from 'lucide-react';

interface Room {
    id: string;
    name: string;
    userCount: number;
    lastActivity: Date;
}

interface Contact {
    id: string;
    alias: string;
    verified?: boolean;
}

interface CreateGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    rooms: Room[];
    onCreateGroup: (groupName: string, selectedRoomIds: string[], selectedContactIds: string[]) => void;
}

export function CreateGroupModal({ isOpen, onClose, rooms, onCreateGroup }: CreateGroupModalProps) {
    const [step, setStep] = useState<'select' | 'details'>('select');
    const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set());
    const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [groupName, setGroupName] = useState('');
    const [contacts, setContacts] = useState<Contact[]>([]);

    // Load contacts
    useEffect(() => {
        if (isOpen) {
            import('@/lib/contact-manager').then(({ contactManager }) => {
                const allContacts = contactManager.getAllContacts();
                setContacts(allContacts.map(c => ({
                    id: c.id,
                    alias: c.alias,
                    verified: c.verified,
                })));
            });
        }
    }, [isOpen]);

    const filteredRooms = rooms.filter(r =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredContacts = contacts.filter(c =>
        c.alias.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const toggleRoom = (roomId: string) => {
        const newSelected = new Set(selectedRooms);
        if (newSelected.has(roomId)) {
            newSelected.delete(roomId);
        } else {
            newSelected.add(roomId);
        }
        setSelectedRooms(newSelected);
    };

    const toggleContact = (contactId: string) => {
        const newSelected = new Set(selectedContacts);
        if (newSelected.has(contactId)) {
            newSelected.delete(contactId);
        } else {
            newSelected.add(contactId);
        }
        setSelectedContacts(newSelected);
    };

    const handleNext = () => {
        if (selectedRooms.size > 0 || selectedContacts.size > 0) {
            setStep('details');
        }
    };

    const handleCreate = () => {
        if (groupName.trim()) {
            onCreateGroup(groupName.trim(), Array.from(selectedRooms), Array.from(selectedContacts));
            // Reset state
            setStep('select');
            setSelectedRooms(new Set());
            setSelectedContacts(new Set());
            setGroupName('');
            setSearchQuery('');
            onClose();
        }
    };

    const handleClose = () => {
        setStep('select');
        setSelectedRooms(new Set());
        setSelectedContacts(new Set());
        setGroupName('');
        setSearchQuery('');
        onClose();
    };

    const totalSelected = selectedRooms.size + selectedContacts.size;

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[480px] max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-primary" />
                        {step === 'select' ? 'Create Group' : 'Group Details'}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'select'
                            ? 'Select rooms and contacts to add to your group'
                            : 'Give your group a name'
                        }
                    </DialogDescription>
                </DialogHeader>

                {step === 'select' ? (
                    <>
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search rooms and contacts..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        {/* Selected chips */}
                        {totalSelected > 0 && (
                            <div className="flex flex-wrap gap-2 p-2 bg-muted/50 rounded-lg">
                                {Array.from(selectedRooms).map(id => {
                                    const room = rooms.find(r => r.id === id);
                                    return room ? (
                                        <Badge key={id} variant="secondary" className="gap-1 pr-1">
                                            {room.name}
                                            <button
                                                onClick={() => toggleRoom(id)}
                                                className="ml-1 hover:bg-muted rounded-full p-0.5"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </Badge>
                                    ) : null;
                                })}
                                {Array.from(selectedContacts).map(id => {
                                    const contact = contacts.find(c => c.id === id);
                                    return contact ? (
                                        <Badge key={id} variant="outline" className="gap-1 pr-1 border-primary/50">
                                            {contact.alias}
                                            <button
                                                onClick={() => toggleContact(id)}
                                                className="ml-1 hover:bg-muted rounded-full p-0.5"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </Badge>
                                    ) : null;
                                })}
                            </div>
                        )}

                        <ScrollArea className="flex-1 max-h-[300px] -mx-6 px-6">
                            {/* Rooms Section */}
                            {filteredRooms.length > 0 && (
                                <div className="mb-4">
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                                        Rooms ({filteredRooms.length})
                                    </h4>
                                    <div className="space-y-1">
                                        {filteredRooms.map(room => (
                                            <div
                                                key={room.id}
                                                onClick={() => toggleRoom(room.id)}
                                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${selectedRooms.has(room.id)
                                                        ? 'bg-primary/10 border border-primary/30'
                                                        : 'hover:bg-muted/50'
                                                    }`}
                                            >
                                                <Avatar className="w-10 h-10">
                                                    <AvatarFallback className="bg-primary/20 text-primary">
                                                        {room.name.slice(0, 2).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium truncate">{room.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {room.userCount} members
                                                    </p>
                                                </div>
                                                <Checkbox checked={selectedRooms.has(room.id)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Contacts Section */}
                            {filteredContacts.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                                        Contacts ({filteredContacts.length})
                                    </h4>
                                    <div className="space-y-1">
                                        {filteredContacts.map(contact => (
                                            <div
                                                key={contact.id}
                                                onClick={() => toggleContact(contact.id)}
                                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${selectedContacts.has(contact.id)
                                                        ? 'bg-primary/10 border border-primary/30'
                                                        : 'hover:bg-muted/50'
                                                    }`}
                                            >
                                                <Avatar className="w-10 h-10">
                                                    <AvatarFallback className="bg-muted">
                                                        {contact.alias.slice(0, 2).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium truncate">{contact.alias}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {contact.verified ? '✓ Verified' : 'Contact'}
                                                    </p>
                                                </div>
                                                <Checkbox checked={selectedContacts.has(contact.id)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {filteredRooms.length === 0 && filteredContacts.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p>No rooms or contacts found</p>
                                    <p className="text-xs mt-1">Join some rooms or add contacts first</p>
                                </div>
                            )}
                        </ScrollArea>

                        <div className="flex items-center justify-between pt-4 border-t">
                            <p className="text-sm text-muted-foreground">
                                {totalSelected} selected
                            </p>
                            <Button
                                onClick={handleNext}
                                disabled={totalSelected === 0}
                                className="gap-2"
                            >
                                Next
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Group Details Step */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <Avatar className="w-16 h-16">
                                    <AvatarFallback className="bg-primary/20 text-primary text-xl">
                                        {groupName ? groupName.slice(0, 2).toUpperCase() : 'GR'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                    <Label htmlFor="groupName">Group Name</Label>
                                    <Input
                                        id="groupName"
                                        placeholder="Enter group name..."
                                        value={groupName}
                                        onChange={(e) => setGroupName(e.target.value)}
                                        className="mt-1"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="p-4 bg-muted/50 rounded-lg">
                                <h4 className="text-sm font-semibold mb-2">Group Members ({totalSelected})</h4>
                                <div className="flex flex-wrap gap-2">
                                    {Array.from(selectedRooms).map(id => {
                                        const room = rooms.find(r => r.id === id);
                                        return room ? (
                                            <Badge key={id} variant="secondary">{room.name}</Badge>
                                        ) : null;
                                    })}
                                    {Array.from(selectedContacts).map(id => {
                                        const contact = contacts.find(c => c.id === id);
                                        return contact ? (
                                            <Badge key={id} variant="outline">{contact.alias}</Badge>
                                        ) : null;
                                    })}
                                </div>
                            </div>

                            <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
                                <p className="text-sm">
                                    <strong>You'll be the admin</strong> of this group and can:
                                </p>
                                <ul className="text-xs mt-2 space-y-1 text-muted-foreground">
                                    <li>• Add or remove members</li>
                                    <li>• Change group settings</li>
                                    <li>• Promote other admins</li>
                                </ul>
                            </div>
                        </div>

                        <div className="flex gap-2 pt-4 border-t">
                            <Button variant="outline" onClick={() => setStep('select')} className="flex-1">
                                Back
                            </Button>
                            <Button
                                onClick={handleCreate}
                                disabled={!groupName.trim()}
                                className="flex-1 gap-2"
                            >
                                <Check className="w-4 h-4" />
                                Create Group
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
