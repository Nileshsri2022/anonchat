// Server configuration
// Change SERVER_URL to your deployed server URL

const config = {
    // Development
    development: {
        serverUrl: 'http://localhost:3000',
        wsUrl: 'ws://localhost:3000'
    },

    // Production - Render deployment (full WebSocket support)
    production: {
        serverUrl: process.env.SERVER_URL || 'https://anonchat-6rbu.onrender.com',
        wsUrl: process.env.WS_URL || 'wss://anonchat-6rbu.onrender.com'
    }
};

const env = process.env.NODE_ENV || 'development';

module.exports = {
    SERVER_URL: config[env]?.serverUrl || config.development.serverUrl,
    WS_URL: config[env]?.wsUrl || config.development.wsUrl,
    IS_PRODUCTION: env === 'production'
};
