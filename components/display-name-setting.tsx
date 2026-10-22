'use client';

// Optional self-chosen Display Name (ADR glossary, ticket 22): stored locally,
// published only inside signed Invites and Room Intros. Never required —
// anonymity stays the default.
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { User } from 'lucide-react';

const KEY = 'anonchat_display_name';

export function DisplayNameSetting() {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(localStorage.getItem(KEY) ?? '');
  }, []);

  const save = () => {
    const trimmed = name.trim().slice(0, 64);
    if (trimmed) localStorage.setItem(KEY, trimmed);
    else localStorage.removeItem(KEY);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <User className="w-4 h-4" />
        Display name <span className="text-xs font-normal text-muted-foreground">(optional)</span>
      </h3>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Anonymous (no name)"
          maxLength={64}
          className="bg-background"
        />
        <Button variant="outline" onClick={save}>
          {saved ? 'Saved' : 'Save'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Shared only inside your signed Invite and Room Intros. Leave empty to stay anonymous.
      </p>
    </div>
  );
}
