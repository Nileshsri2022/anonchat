// Custom Next.js server with Socket.IO support
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server: SocketIOServer } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const server = createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl);
    });

    // Attach Socket.IO to the HTTP server
    const io = new SocketIOServer(server, {
        path: '/socket.io',
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    // Make io globally available for API routes
    global.io = io;

    io.on('connection', (socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);

        // Join a chat room
        socket.on('join-room', (roomId, userId, username) => {
            socket.join(roomId);
            console.log(`👤 ${username} joined room ${roomId.slice(0, 8)}`);

            socket.to(roomId).emit('user-joined', {
                userId,
                username,
                timestamp: Date.now(),
            });
        });

        // Leave a chat room
        socket.on('leave-room', (roomId, userId) => {
            socket.leave(roomId);
            console.log(`👤 User left room ${roomId.slice(0, 8)}`);

            socket.to(roomId).emit('user-left', {
                userId,
                timestamp: Date.now(),
            });
        });

        // New message - broadcast to room
        socket.on('new-message', (roomId, message) => {
            console.log(`💬 Broadcasting to room ${roomId.slice(0, 8)}`);
            socket.to(roomId).emit('message', message);
        });

        socket.on('disconnect', () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);
        });
    });

    server.listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
        console.log(`> Socket.IO ready`);
    });
});
