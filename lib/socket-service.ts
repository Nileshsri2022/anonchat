// Socket.IO client service for real-time messaging
import { io, Socket } from 'socket.io-client';

class SocketService {
    private socket: Socket | null = null;
    private connected: boolean = false;
    private currentRoom: string | null = null;
    private messageHandlers: Map<string, (message: any) => void> = new Map();

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
                console.log('🔌 WebSocket connected');
                this.connected = true;
                resolve();
            });

            this.socket.on('disconnect', () => {
                console.log('🔌 WebSocket disconnected');
                this.connected = false;
            });

            this.socket.on('connect_error', (error) => {
                console.error('🔌 WebSocket connection error:', error.message);
                reject(error);
            });

            // Listen for incoming messages
            this.socket.on('message', (message: any) => {
                console.log('💬 Received message via WebSocket');
                if (this.currentRoom) {
                    const handler = this.messageHandlers.get(this.currentRoom);
                    if (handler) {
                        handler(message);
                    }
                }
            });

            // Listen for user events
            this.socket.on('user-joined', (data: { userId: string; username: string }) => {
                console.log(`👤 ${data.username} joined the room`);
            });

            this.socket.on('user-left', (data: { userId: string }) => {
                console.log(`👤 User ${data.userId} left the room`);
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
            console.log(`🔌 Joined room ${roomId.slice(0, 8)} via WebSocket`);
        }
    }

    leaveRoom(roomId: string, userId: string) {
        if (this.socket?.connected) {
            this.socket.emit('leave-room', roomId, userId);
            this.currentRoom = null;
            this.messageHandlers.delete(roomId);
        }
    }

    sendMessage(roomId: string, message: any) {
        if (this.socket?.connected) {
            this.socket.emit('new-message', roomId, message);
        }
    }

    onMessage(roomId: string, handler: (message: any) => void) {
        this.messageHandlers.set(roomId, handler);
    }

    isConnected(): boolean {
        return this.connected;
    }
}

export const socketService = new SocketService();
