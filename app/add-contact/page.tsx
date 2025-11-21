'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle, X, AlertCircle } from 'lucide-react';
import { parseContactQRData } from '@/lib/qr-generator';

export default function AddContactPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [contactData, setContactData] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const dataParam = searchParams.get('data');
    console.log('📥 Add Contact Page - Raw data param:', dataParam);

    if (dataParam) {
      try {
        const decodedData = decodeURIComponent(dataParam);
        console.log('📥 Decoded data:', decodedData);

        const parsed = parseContactQRData(decodedData);
        console.log('📥 Parsed contact data:', parsed);

        setContactData(parsed);
      } catch (err) {
        console.error('❌ Failed to parse contact data:', err);
        setError('Invalid contact data in URL');
      }
    } else {
      console.warn('⚠️ No contact data found in URL');
      setError('No contact data found in URL');
    }
  }, [searchParams]);

  const handleAddContact = () => {
    if (contactData) {
      // Store contact data in localStorage or pass to parent app
      localStorage.setItem('pending_contact', JSON.stringify(contactData));
      setAdded(true);

      // Redirect back to main app after a delay
      setTimeout(() => {
        router.push('/');
      }, 2000);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card p-6">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Error</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => router.push('/')} className="w-full">
              Go Back
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (added) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card p-6">
          <div className="text-center">
            <CheckCircle className="w-12 h-12 text-success mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Contact Added!</h2>
            <p className="text-muted-foreground mb-4">
              Contact data has been saved. You can now verify and add this contact in the main app.
            </p>
            <Button onClick={() => router.push('/')} className="w-full">
              Open AnonChat
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!contactData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card p-6">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading contact data...</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-2">Add Contact</h1>
          <p className="text-muted-foreground">You've scanned a contact QR code</p>
        </div>

        <div className="space-y-4 mb-6">
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Contact ID</p>
            <p className="font-mono text-xs text-foreground break-all">
              {contactData.id}
            </p>
          </div>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Added</p>
            <p className="text-xs text-foreground">
              {new Date(contactData.timestamp).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Button onClick={handleAddContact} className="w-full">
            Add Contact
          </Button>
          <Button variant="outline" onClick={() => router.push('/')} className="w-full">
            Cancel
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          This will save the contact data for verification in the main app
        </p>
      </Card>
    </div>
  );
}
