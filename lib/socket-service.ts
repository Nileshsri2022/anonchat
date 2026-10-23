// Socket.IO client service for real-time messaging

// Wire payloads are opaque to the transport: the transport layer cannot
// know their shape, so consumers own parsing/narrowing (ADR-0012).
export type WireMessage = unknown;
export type WireHandler = (message: WireMessage) => void;
import { io, Socket } from 'socket.io-client';

/**
 * Hand an inbound wire message to the right consumer.
 *
 * A '*' handler receives everything — the DM client needs it, because it routes
 * envelopes by their Pairwise Channel rather than by Room — so it takes
 * precedence. That is only safe while it is registered: consumers must call
 * `offMessage('*')` when they unmount, or they keep swallowing every other
 * consumer's messages.
 */
export function routeInboundMessage(
  handlers: ReadonlyMap<string, WireHandler>,
  currentRoom: string | null,
  message: WireMessage,
): void {
  const globalHandler = handlers.get('*');
  if (globalHandler) {
    globalHandler(message);
    return;
  }
  if (currentRoom) {
    handlers.get(currentRoom)?.(message);
  }
}

class SocketService {
    private socket: Socket | null = null;
    private connected: boolean = false;
    private currentRoom: string | null = null;
    private messageHandlers: Map<string, WireHandler> = new Map();

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.socket?.connected) {
                resolve();
                return;
            }

            this.socket = io({
                path: '/socket.io',
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
            });

            this.socket.on('connect', () => {
                this.connected = true;
                resolve();
            });

            this.socket.on('disconnect', () => {
                this.connected = false;
            });

            this.socket.on('connect_error', (error) => {
                console.error('🔌 WebSocket connection error:', error.message);
                reject(error);
            });

            // Listen for incoming messages
            this.socket.on('message', (message: WireMessage) => {
                routeInboundMessage(this.messageHandlers, this.currentRoom, message);
            });

            // Listen for user events
            this.socket.on('user-joined', (data: { userId: string; username: string }) => {
            });

            this.socket.on('user-left', (data: { userId: string }) => {
            });
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
            this.currentRoom = null;
        }
    }

    joinRoom(roomId: string, userId: string, username: string) {
        if (this.socket?.connected) {
            this.currentRoom = roomId;
            this.socket.emit('join-room', roomId, userId, username);
        }
    }

    leaveRoom(roomId: string, userId: string) {
        if (this.socket?.connected) {
            this.socket.emit('leave-room', roomId, userId);
            this.currentRoom = null;
            this.messageHandlers.delete(roomId);
        }
    }

    sendMessage(roomId: string, message: WireMessage) {
        if (this.socket?.connected) {
            this.socket.emit('new-message', roomId, message);
        }
    }

    onMessage<T = WireMessage>(roomId: string, handler: (message: T) => void) {
        // The generic keeps consumer-side payload types; the transport stores
        // them opaquely and hands them back untouched.
        this.messageHandlers.set(roomId, handler as WireHandler);
    }

    /**
     * Stop delivering to a handler. Consumers must call this on unmount — a
     * lingering '*' handler takes precedence over every Room handler and would
     * silently eat Room traffic.
     */
    offMessage(roomId: string) {
        this.messageHandlers.delete(roomId);
    }

    isConnected(): boolean {
        return this.connected;
    }
}

export const socketService = new SocketService();
