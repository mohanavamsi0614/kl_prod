import { Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";
import logger from "./logger";
import { verifyAccessToken } from "./jwt";

let io: SocketServer | null = null;
const userSockets = new Map<string, string[]>(); // userId -> socketIds[]

export const initSocket = (server: HttpServer) => {
    const allowedOrigins = [
        process.env.FRONTEND_URL,
        process.env.CLIENT_URL,
        "http://localhost:5173"
    ].filter(Boolean) as string[];

    io = new SocketServer(server, {
        cors: {
            origin: allowedOrigins.length > 0 ? allowedOrigins : false,
            methods: ["GET", "POST"]
        }
    });

    io.use((socket, next) => {
        let token = socket.handshake.auth.token || socket.handshake.query.token;
        
        // Fallback to cookies
        if (!token && socket.handshake.headers.cookie) {
            const cookies = socket.handshake.headers.cookie.split(';');
            const authCookie = cookies.find(c => c.trim().startsWith('accessToken='));
            if (authCookie) {
                token = authCookie.split('=')[1].trim();
            }
        }

        if (!token) {
            return next(new Error("Authentication error"));
        }

        try {
            const decoded = verifyAccessToken(token);
            if (decoded && decoded.userId) {
                (socket as any).userId = decoded.userId;
                next();
            } else {
                next(new Error("Invalid token"));
            }
        } catch (err) {
            next(new Error("Authentication error"));
        }
    });

    io.on("connection", (socket) => {
        const userId = (socket as any).userId;
        logger.info({ userId, socketId: socket.id }, "Socket connected");

        if (userId) {
            const sockets = userSockets.get(userId) || [];
            userSockets.set(userId, [...sockets, socket.id]);
        }

        socket.on("disconnect", () => {
            logger.info({ userId, socketId: socket.id }, "Socket disconnected");
            if (userId) {
                const sockets = userSockets.get(userId) || [];
                userSockets.set(userId, sockets.filter(id => id !== socket.id));
            }
        });
    });

    return io;
};

export const getIo = () => {
    if (!io) {
        throw new Error("Socket.io not initialized");
    }
    return io;
};

export const emitToUser = (userId: string, event: string, data: any) => {
    if (!io) return;
    const socketIds = userSockets.get(userId);
    if (socketIds) {
        socketIds.forEach(id => {
            io?.to(id).emit(event, data);
        });
    }
};
