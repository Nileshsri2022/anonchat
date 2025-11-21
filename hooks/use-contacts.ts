'use client';

import { useState, useCallback } from 'react';
import { contactManager, Contact, ContactIdentity } from '@/lib/contact-manager';
import { messageEncryption } from '@/lib/message-encryption';
import { initializeDoubleRatchet } from '@/lib/crypto';

export interface UseContactsOptions {
  onContactAdded?: (contact: Contact) => void;
  onEncryptionEstablished?: (contactId: string) => void;
}

export function useContacts(options: UseContactsOptions) {
  const [contacts, setContacts] = useState<Contact[]>(contactManager.getAllContacts());
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [verificationPending, setVerificationPending] = useState<Map<string, string>>(new Map());

  const addContact = useCallback(async (alias: string, identity: ContactIdentity) => {
    const contact = contactManager.addContact(alias, identity);
    
    // Initialize encryption session
    const initialState = await initializeDoubleRatchet(
      new ArrayBuffer(32) // Placeholder - should use proper X3DH result
    );
    await messageEncryption.initializeSession(contact.id, initialState);
    
    contactManager.establishEncryption(contact.id);
    
    setContacts(contactManager.getAllContacts());
    options.onContactAdded?.(contact);
    options.onEncryptionEstablished?.(contact.id);
    
    return contact;
  }, []);

  const verifyContact = useCallback((contactId: string, code: string) => {
    const isValid = contactManager.verifyContact(contactId, code);
    if (isValid) {
      setContacts(contactManager.getAllContacts());
    }
    return isValid;
  }, []);

  const getContact = useCallback((contactId: string) => {
    return contactManager.getContact(contactId);
  }, []);

  const deleteContact = useCallback((contactId: string) => {
    contactManager.deleteContact(contactId);
    setContacts(contactManager.getAllContacts());
    if (selectedContactId === contactId) {
      setSelectedContactId(null);
    }
  }, [selectedContactId]);

  return {
    contacts,
    selectedContactId,
    setSelectedContactId,
    addContact,
    verifyContact,
    getContact,
    deleteContact,
  };
}
