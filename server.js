// Custom Next.js server with Socket.IO support
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server: SocketIOServer } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
// In dev mode: always use localhost (Windows sets HOSTNAME to computer name)
// In production: use HOSTNAME env var or 0.0.0.0 for Docker/Render
const hostname = dev ? 'localhost' : '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const server = createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl);
    });

    // Attach Socket.IO to the HTTP server.
    //
    // Socket origins are held to the same rule the REST routes enforce: this
    // relay serves one origin. Widening it is a deliberate, explicit act — set
    // ALLOWED_ORIGINS to a comma-separated list of origins (or '*' to disable the
    // check entirely, which you should only do behind your own proxy).
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    if (allowedOrigins.length > 0) {
        console.log('> Socket origins allowed:', allowedOrigins.join(', '));
    }

    // Strip a scheme so `ALLOWED_ORIGINS=https://app.example.com` and
    // `ALLOWED_ORIGINS=app.example.com` mean the same thing.
    function hostOf(value) {
        try {
            return new URL(value.includes('://') ? value : `https://${value}`).host.toLowerCase();
        } catch {
            return '';
        }
    }

    const renderHost = hostOf(process.env.RENDER_EXTERNAL_HOSTNAME || '');

    // The policy lives in allowRequest rather than in `cors.origin`, because only
    // here can the Origin be compared against the Host this relay is actually
    // being served on. Browsers send an Origin on WebSocket handshakes even for
    // same-origin requests, so a rule that cannot see the serving host breaks the
    // relay's own front end behind any proxy that rewrites Host.
    function originAllowed(req) {
        const origin = req.headers?.origin;
        if (!origin) return true; // not a browser CORS request
        if (allowedOrigins.includes('*')) return true;

        const originHost = hostOf(origin);
        if (!originHost) return false;
        if (allowedOrigins.some((allowed) => hostOf(allowed) === originHost)) return true;
        // Same-origin as the relay itself, whatever proxy is in front of it.
        if (originHost === (req.headers?.host || '').toLowerCase()) return true;
        if (renderHost && originHost === renderHost) return true;
        return false;
    }

    const io = new SocketIOServer(server, {
        path: '/socket.io',
        cors: {
            origin: (origin, cb) => cb(null, true),
            methods: ['GET', 'POST'],
            credentials: true,
        },
        allowRequest: (req, cb) => {
            if (originAllowed(req)) return cb(null, true);
            console.warn('[relay] socket origin rejected:', req.headers?.origin);
            return cb('Origin not allowed', false);
        },
    });

    // Make io globally available for API routes
    global.io = io;

    io.on('connection', (socket) => {

        // Join a chat room
        socket.on('join-room', (roomId, userId, username) => {
            socket.join(roomId);

            socket.to(roomId).emit('user-joined', {
                userId,
                username,
                timestamp: Date.now(),
            });
        });

        // Leave a chat room
        socket.on('leave-room', (roomId, userId) => {
            socket.leave(roomId);

            socket.to(roomId).emit('user-left', {
                userId,
                timestamp: Date.now(),
            });
        });

        // New message - broadcast to room
        socket.on('new-message', (roomId, message) => {
            socket.to(roomId).emit('message', message);
        });

    });

    server.listen(port, hostname, () => {
        console.log('> AnonChat relay ready on', `http://${hostname}:${port}`);
    });
});
