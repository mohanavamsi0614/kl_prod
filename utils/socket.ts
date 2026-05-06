import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAccessToken } from './jwt';
// @ts-ignore
import cookie from 'cookie';
import logger from './logger';

let io: Server | null = null;

export const initSocket = (server: HttpServer) => {
    io = new Server(server, {
        cors: {
            origin: process.env.VITE_API_URL || 'http://localhost:5173',
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    io.use((socket, next) => {
        const cookies = cookie.parse(socket.handshake.headers.cookie || '');
        const token = socket.handshake.auth?.token || cookies.accessToken;

        if (!token) {
            return next(new Error('Authentication error'));
        }

        try {
            const decoded = verifyAccessToken(token);
            if (!decoded) {
                return next(new Error('Authentication error'));
            }
            (socket as any).userId = decoded.userId;
            next();
        } catch (err) {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        const userId = (socket as any).userId;
        logger.info({ userId, socketId: socket.id }, 'User connected to socket');
        
        socket.join(`user:${userId}`);

        socket.on('disconnect', () => {
            logger.info({ userId, socketId: socket.id }, 'User disconnected from socket');
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};

export const emitToUser = (userId: string, event: string, data: any) => {
    if (io) {
        io.to(`user:${userId}`).emit(event, data);
    }
};
