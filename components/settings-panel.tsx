'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { X, Trash2, Download, Shield, Bell } from 'lucide-react';
import { TorStatus } from './tor-status';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg bg-card max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground">Settings</h2>
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

              <TorStatus />
            </div>

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
                <p className="text-xs text-muted-foreground">Signal Protocol + Tor Network</p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
