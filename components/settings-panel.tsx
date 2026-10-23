'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { X, Trash2, Download, Shield, Bell, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { ProfilePassphraseSettings } from '@/components/profile-passphrase-settings';
import { DisplayNameSetting } from '@/components/display-name-setting';
import { TorSettings } from '@/components/tor-settings';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { theme, setTheme } = useTheme();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50">
      <Card className="w-full sm:max-w-lg bg-card max-h-[88vh] overflow-y-auto max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0">
        <div className="p-5 sm:p-6">
          <div className="sm:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Settings</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Privacy Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Privacy & Security
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Auto-delete messages</p>
                    <p className="text-xs text-muted-foreground">Clear messages after 7 days</p>
                  </div>
                  <Switch />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Require verification</p>
                    <p className="text-xs text-muted-foreground">Always verify contact fingerprints</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Perfect Forward Secrecy</p>
                    <p className="text-xs text-muted-foreground">Ratchet keys every 100 messages</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </div>

            {/* Tor Network & Traffic Routing */}
            <TorSettings />

            {/* Notifications Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Notifications
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Message notifications</p>
                    <p className="text-xs text-muted-foreground">Get notified of new messages</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Sound alerts</p>
                    <p className="text-xs text-muted-foreground">Play sound for notifications</p>
                  </div>
                  <Switch />
                </div>
              </div>
            </div>


            {/* Local Data Vault */}
            <div className="space-y-4 pt-4 border-t border-border">
              <DisplayNameSetting />
              <ProfilePassphraseSettings />
            </div>

            {/* Data Management */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Data Management</h3>
              
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <Download className="w-4 h-4 mr-2" />
                  Export conversations
                </Button>
                
                <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear all data
                </Button>
              </div>
            </div>

            {/* Version Info */}
            <div className="pt-4 border-t border-border">
              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground">AnonChat Client v1.0.0</p>
                <p className="text-xs text-muted-foreground">X3DH + Double Ratchet, AES-256-GCM</p>
              </div>
            </div>
          </div>
        </div>
            {/* Appearance (mockup 06) */}
      <div className="flex items-center justify-between py-3 border-t border-border mt-2">
        <span className="text-sm font-medium text-foreground">Appearance</span>
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            onClick={() => setTheme('light')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${theme !== 'dark' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Sun className="w-3.5 h-3.5" /> Light
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${theme === 'dark' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Moon className="w-3.5 h-3.5" /> Dark
          </button>
        </div>
      </div>

</Card>
    </div>
  );
}
