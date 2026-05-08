import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const initSocket = (token?: string) => {
    if (socket) {
        socket.disconnect();
    }

    socket = io({
        auth: token ? { token } : undefined,
        transports: ['websocket']
    });

    socket.on('connect', () => {
        console.log('Connected to real-time updates');
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
    });

    return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};
