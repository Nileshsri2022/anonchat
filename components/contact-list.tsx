'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Users, Shield, Check, Clock, AlertCircle, QrCode, Trash2, Eye, EyeOff } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { contactManager, Contact } from '@/lib/contact-manager';

// Dynamic imports for modals with QR library (~15KB savings)
const QRContactModal = dynamic(
  () => import('@/components/qr-contact-modal').then(m => ({ default: m.QRContactModal })),
  { ssr: false }
);

const ContactVerificationModal = dynamic(
  () => import('@/components/contact-verification-modal').then(m => ({ default: m.ContactVerificationModal })),
  { ssr: false }
);

interface ContactListProps {
  onStartChat?: (contactId: string, contactName: string) => void;
}

export function ContactList({ onStartChat }: ContactListProps) {
  const [contacts, setContacts] = useState<Contact[]>(contactManager.getAllContacts());
  const [showQRModal, setShowQRModal] = useState(false);
  const [verifyingContact, setVerifyingContact] = useState<Contact | null>(null);
  const [showContactId, setShowContactId] = useState<string | null>(null);

  const refreshContacts = () => {
    const allContacts = contactManager.getAllContacts();
    console.log('🔄 Refreshing contacts, total count:', allContacts.length);
    console.log('🔄 Contact IDs:', allContacts.map(c => c.id));
    setContacts([...allContacts]);
  };

  useEffect(() => {
    refreshContacts();
  }, []);

  const handleAddContact = (contactData: any) => {
    // This would be called from QR modal
    refreshContacts();
  };

  const handleVerifyContact = (contactId: string, code: string) => {
    console.log('🔐 Attempting to verify contact:', contactId, 'with code:', code);

    const contact = contactManager.getContact(contactId);
    console.log('👤 Contact data:', contact);

    if (contact) {
      console.log('📋 Contact verification code:', contact.verificationCode);
    }

    const success = contactManager.verifyContact(contactId, code);
    console.log('✅ Verification result:', success);

    if (success) {
      console.log('🔄 Refreshing contacts after successful verification');
      refreshContacts();
    } else {
      console.log('❌ Verification failed');
    }
    return success;
  };

  const handleDeleteContact = (contactId: string) => {
    contactManager.deleteContact(contactId);
    refreshContacts();
  };

  const getStatusIcon = (contact: Contact) => {
    if (contact.verified) {
      return <Check className="w-4 h-4 text-success" />;
    } else if (contact.encryptionStatus === 'established') {
      return <Clock className="w-4 h-4 text-warning" />;
    } else {
      return <AlertCircle className="w-4 h-4 text-destructive" />;
    }
  };

  const getStatusText = (contact: Contact) => {
    if (contact.verified) {
      return 'Verified';
    } else if (contact.encryptionStatus === 'established') {
      return 'Ready to verify';
    } else {
      return 'Pending setup';
    }
  };

  const getStatusColor = (contact: Contact) => {
    if (contact.verified) {
      return 'bg-success/10 text-success border-success/20';
    } else if (contact.encryptionStatus === 'established') {
      return 'bg-warning/10 text-warning border-warning/20';
    } else {
      return 'bg-destructive/10 text-destructive border-destructive/20';
    }
  };

  return (
    <>
      <div className="w-80 border-r border-border bg-muted/20 flex flex-col h-screen">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg text-foreground">Contacts</h2>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              variant="outline"
              onClick={() => setShowQRModal(true)}
            >
              <QrCode className="w-4 h-4 mr-2" />
              Add Contact
            </Button>
          </div>
        </div>

        {/* Contacts */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {contacts.length === 0 ? (
              <div className="text-center py-8 px-4">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  No contacts yet. Add contacts using QR codes for secure messaging.
                </p>
                <Button size="sm" onClick={() => setShowQRModal(true)} variant="outline">
                  <QrCode className="w-4 h-4 mr-2" />
                  Scan QR Code
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {contacts.map((contact) => (
                  <Card key={contact.id} className="p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-semibold text-primary">
                            {contact.alias[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground text-sm">
                            {contact.alias}
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            {getStatusIcon(contact)}
                            <span className="text-xs text-muted-foreground">
                              {getStatusText(contact)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowContactId(showContactId === contact.id ? null : contact.id)}
                        >
                          {showContactId === contact.id ? (
                            <EyeOff className="w-3 h-3" />
                          ) : (
                            <Eye className="w-3 h-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteContact(contact.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {showContactId === contact.id && (
                      <div className="mt-3 pt-3 border-t border-border space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Contact ID:</span>
                          <span className="font-mono text-foreground">{contact.id.slice(-8)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Added:</span>
                          <span className="text-foreground">
                            {contact.addedAt.toLocaleDateString()}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Fingerprint:</p>
                          <p className="font-mono text-xs text-foreground break-all bg-muted/50 p-2 rounded">
                            {contact.identity.fingerprint}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      {!contact.verified && contact.encryptionStatus === 'established' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => setVerifyingContact(contact)}
                        >
                          Verify
                        </Button>
                      )}
                      {contact.verified && onStartChat && (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => onStartChat(contact.id, contact.alias)}
                        >
                          Message
                        </Button>
                      )}
                      <Badge variant="secondary" className={`text-xs ${getStatusColor(contact)}`}>
                        <Shield className="w-3 h-3 mr-1" />
                        {contact.encryptionStatus}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer Status */}
        <div className="p-4 border-t border-border bg-muted/30">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3 h-3" />
              <span>{contacts.filter(c => c.verified).length} verified contacts</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="w-3 h-3" />
              <span>{contacts.length} total contacts</span>
            </div>
          </div>
        </div>
      </div>

      <QRContactModal
        isOpen={showQRModal}
        onClose={() => {
          setShowQRModal(false);
          refreshContacts(); // Refresh after modal closes
        }}
        onAddContact={handleAddContact}
      />

      {verifyingContact && (
        <ContactVerificationModal
          isOpen={!!verifyingContact}
          contactId={verifyingContact.id}
          contactName={verifyingContact.alias}
          verificationCode={verifyingContact.verificationCode}
          fingerprint={verifyingContact.identity.fingerprint}
          onVerify={handleVerifyContact}
          onCancel={() => setVerifyingContact(null)}
        />
      )}
    </>
  );
}
