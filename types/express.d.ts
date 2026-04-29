import { PublicUser } from "../middleware/auth";
import { Logger } from "pino";

// To make the file a module and avoid global namespace issues.
export { };

declare global {
	namespace Express {
		// These declarations merge with the existing ones in Express
		export interface Request {
			user?: PublicUser;
			log?: Logger; // Child logger with request ID context
			driveConnectionId?: string; // Google Drive connection ID (set by validateDriveConnection middleware)
		}

		// This declaration is needed for Passport to correctly type the user
		export interface User extends PublicUser { }
	}
}
