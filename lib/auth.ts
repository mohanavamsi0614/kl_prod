import passport from "passport";
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";
import logger from "../utils/logger";
import { comparePassword } from "../utils/password";
import { encryptToken } from "../utils/encryption";
import { verifyAccessToken } from "../utils/jwt";
import prisma from "./prisma";

// Configure Google OAuth Strategy
// Only configure Google OAuth if credentials are present. This prevents startup crashes
// when env vars are not provided (useful for local container tests or non-Google deployments).
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback",
        passReqToCallback: true,
      },
      async (req: any, accessToken: string, refreshToken: string, params: any, profile: Profile, done: VerifyCallback) => {
        try {
          logger.info({ profileId: profile.id }, "Google OAuth callback received");
          
          // Extract granted scopes from Google OAuth response
          // Google returns scope as a space-separated string in params
          const grantedScopesFromGoogle = params?.scope ? params.scope.split(' ') : [];
          logger.info({ grantedScopesFromGoogle, profileId: profile.id }, "Scopes granted by Google");
          
          // Warn if Google returns empty scopes array
          if (grantedScopesFromGoogle.length === 0) {
              logger.warn({ 
                  profileId: profile.id,
                  params: params 
              }, "Google OAuth returned empty scopes array - will use fallback scopes");
          }

          // 1. Check if user is already logged in (Linking Mode)
          let currentUser = null;
          let category = 'Personal'; // Default category
          let service: string = 'AUTH'; // Default service for login (no service token creation)
          
          // Try to get user from state param first (more reliable across redirects)
          if (req.query && req.query.state) {
              try {
                  const stateJson = Buffer.from(req.query.state as string, 'base64').toString('utf8');
                  const state = JSON.parse(stateJson);
                  if (state.userId) {
                      currentUser = await prisma.user.findUnique({ where: { id: state.userId } });
                  }
                  if (state.category) {
                      category = state.category;
                  }
                  // Accept AUTH, GMAIL, CALENDAR, TASKS, or DRIVE as valid services
                  if (state.service && (state.service === 'GMAIL' || state.service === 'CALENDAR' || state.service === 'TASKS' || state.service === 'DRIVE' || state.service === 'AUTH')) {
                      service = state.service;
                  } else if (state.service) {
                      logger.warn({ invalidService: state.service }, 'Invalid service from state, using default AUTH');
                  }
              } catch (e) {
                  logger.warn({ err: e }, "Failed to parse OAuth state");
              }
          }

          // Fallback to cookie if state didn't work
          if (!currentUser && req.cookies?.accessToken) {
              const token = req.cookies.accessToken;
              const decoded = verifyAccessToken(token);
              if (decoded) {
                  currentUser = await prisma.user.findUnique({ where: { id: decoded.userId } });
              }
          }

          if (currentUser) {
              logger.info({ userId: currentUser.id }, "User is already logged in. Linking Google account.");
              
              // Check if this is a re-auth flow (reauth flag from state parameter)
              let reauthConnectionId = null;
              let reauthService = null;
              let stateUserId = null;
              
              if (req.query?.state) {
                  try {
                      const stateJson = Buffer.from(req.query.state as string, 'base64').toString('utf8');
                      const stateData = JSON.parse(stateJson);
                      
                      if (stateData.reauth) {
                          reauthConnectionId = stateData.connectionId;
                          reauthService = stateData.service;
                          stateUserId = stateData.userId;
                          logger.info({ reauthConnectionId, reauthService, stateUserId }, "Re-authentication flow detected from state parameter");
                      }
                  } catch (e) {
                      logger.warn({ error: e }, "Failed to parse OAuth state for reauth");
                  }
              }
              
              // If re-auth and user IDs match, update existing connection
              if (reauthConnectionId && reauthService && stateUserId === currentUser.id) {
                  const expiresAt = new Date(Date.now() + 3500 * 1000);
                  
                  // Use actual scopes granted by Google (not hardcoded)
                  const actualGrantedScopes = grantedScopesFromGoogle.length > 0 
                      ? grantedScopesFromGoogle.join(',')
                      : (reauthService === 'GMAIL' 
                          ? 'profile,email,https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.modify'
                          : reauthService === 'CALENDAR'
                              ? 'profile,email,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/calendar.events'
                              : reauthService === 'TASKS'
                                  ? 'profile,email,https://www.googleapis.com/auth/tasks'
                                  : reauthService === 'DRIVE'
                                      ? 'profile,email,https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/drive.file'
                                      : 'profile,email');
                  
                  try {
                      // Get existing connection to preserve refresh token if needed
                      const existingConnection = await prisma.serviceToken.findUnique({
                          where: { id: reauthConnectionId },
                          select: { encryptedRefreshToken: true }
                      });
                      
                      await prisma.serviceToken.update({
                          where: { id: reauthConnectionId },
                          data: {
                              encryptedAccessToken: encryptToken(accessToken),
                              // Preserve existing refresh token if Google doesn't provide a new one
                              encryptedRefreshToken: refreshToken ? encryptToken(refreshToken) : existingConnection?.encryptedRefreshToken,
                              grantedScopes: actualGrantedScopes,
                              expiresAt,
                          }
                      });
                      
                      logger.info({ reauthConnectionId, reauthService, userId: currentUser.id }, "Successfully updated connection with new scopes via state-based reauth");
                      
                      // Clear connections cache
                      const { clearCache, createCacheKey } = require('../utils/cache');
                      clearCache(createCacheKey('connections', currentUser.id));
                      
                      // Attach service info for redirect
                      (currentUser as any)._oauthService = reauthService;
                      return done(null, currentUser);
                  } catch (error) {
                      logger.error({ error, reauthConnectionId }, "Failed to update connection during state-based re-auth");
                      // Fall through to normal flow if update fails
                  }
              }
              
              // Normal linking flow (not re-auth)
              // Check if this Google account is already linked to *another* user
              const existingIdentity = await prisma.userAuthIdentity.findUnique({
                  where: {
                      provider_providerUid: {
                          provider: 'GOOGLE',
                          providerUid: profile.id
                      }
                  }
              });

              if (existingIdentity && existingIdentity.userId !== currentUser.id) {
                  // Check if the other user still has any Google service tokens for this email
                  // If not, the account was unlinked and can be claimed by current user
                  const otherUserTokens = await prisma.serviceToken.findFirst({
                      where: {
                          userId: existingIdentity.userId,
                          accountEmail: profile.emails?.[0]?.value || ''
                      }
                  });
                  
                  if (otherUserTokens) {
                      // Account is actively being used by someone else
                      return done(new Error("This Google account is already linked to another user."), undefined);
                  }
                  
                  // No tokens exist for the other user - delete their orphaned identity and allow new linking
                  logger.info({ 
                      existingUserId: existingIdentity.userId, 
                      newUserId: currentUser.id,
                      email: profile.emails?.[0]?.value 
                  }, "Transferring orphaned Google identity to new user");
                  
                  await prisma.userAuthIdentity.delete({
                      where: { id: existingIdentity.id }
                  });
              }

              // If not linked, or linked to self (re-auth), proceed to save tokens
              
              // Create/Update Identity (if not exists)
              if (!existingIdentity) {
                  await prisma.userAuthIdentity.create({
                      data: {
                          userId: currentUser.id,
                          provider: 'GOOGLE',
                          providerUid: profile.id,
                          identityData: { 
                              email: profile.emails?.[0]?.value, 
                              firstName: profile.name?.givenName, 
                              lastName: profile.name?.familyName 
                          }
                      }
                  });
              }

              // If service is AUTH (basic login while already authenticated), skip ServiceToken operations
              // AUTH is purely for authentication identity, not for service access tokens
              if (service === 'AUTH') {
                  logger.info({ userId: currentUser.id, service }, "AUTH flow - skipping ServiceToken update");
                  return done(null, currentUser);
              }

              // Save Service Tokens (only for GMAIL or CALENDAR services)
              const expiresAt = new Date(Date.now() + 3500 * 1000); // Approx 1 hour
              
              // Use actual scopes granted by Google (not hardcoded assumptions)
              const grantedScopes = grantedScopesFromGoogle.length > 0
                  ? grantedScopesFromGoogle.join(',')
                  : (service === 'GMAIL' 
                      ? 'profile,email,https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.modify'
                      : service === 'CALENDAR'
                          ? 'profile,email,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/calendar.events'
                          : service === 'TASKS'
                              ? 'profile,email,https://www.googleapis.com/auth/tasks'
                              : service === 'DRIVE'
                                  ? 'profile,email,https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/drive.file'
                                  : 'profile,email'); // Fallback
              
              // Get existing connection to preserve refresh token if needed
              const existingServiceToken = await prisma.serviceToken.findUnique({
                  where: {
                      userId_service_accountEmail: {
                          userId: currentUser.id,
                          service: service,
                          accountEmail: profile.emails?.[0]?.value || ''
                      }
                  },
                  select: { encryptedRefreshToken: true }
              });
              
              // Upsert the requested service token
              await prisma.serviceToken.upsert({
                  where: {
                      userId_service_accountEmail: {
                          userId: currentUser.id,
                          service: service,
                          accountEmail: profile.emails?.[0]?.value || ''
                      }
                  },
                  update: {
                      encryptedAccessToken: encryptToken(accessToken),
                      // Preserve existing refresh token if Google doesn't provide a new one
                      encryptedRefreshToken: refreshToken ? encryptToken(refreshToken) : existingServiceToken?.encryptedRefreshToken,
                      category: category, // Update category
                      grantedScopes: grantedScopes,
                      expiresAt,
                  },
                  create: {
                      userId: currentUser.id,
                      service: service,
                      accountEmail: profile.emails?.[0]?.value || '',
                      encryptedAccessToken: encryptToken(accessToken),
                      encryptedRefreshToken: refreshToken ? encryptToken(refreshToken) : null,
                      category: category, // Set category
                      grantedScopes: grantedScopes,
                      expiresAt,
                  }
              });
              
              // Clear connections cache so frontend can immediately see new connection
              const { clearCache, createCacheKey } = require('../utils/cache');
              clearCache(createCacheKey('connections', currentUser.id));

              // NOTE: Do NOT update CALENDAR token if linking GMAIL.
              // Each service (CALENDAR, GMAIL) needs its own properly-scoped token.
              // Overwriting calendar token with gmail-scoped token causes 403 errors.

              // Attach service info to user for redirect in callback
              (currentUser as any)._oauthService = service;
              return done(null, currentUser);
          }

          // 2. Not logged in (Login/Signup Mode)
          // Check if identity exists
          const identity = await prisma.userAuthIdentity.findUnique({
            where: {
              provider_providerUid: {
                provider: 'GOOGLE',
                providerUid: profile.id
              }
            },
            include: { user: true }
          });

          if (identity) {
            logger.info({ userId: identity.userId }, "Google identity found, logging in");
            
            // If service is AUTH (basic login), don't create/update ServiceTokens
            // AUTH is purely for authentication, not for service access
            if (service === 'AUTH') {
                logger.info({ userId: identity.userId, service }, "AUTH login - skipping ServiceToken creation");
                return done(null, identity.user);
            }
            
            // Update or create ServiceToken for this user
            // Only for GMAIL or CALENDAR services
            const expiresAt = new Date(Date.now() + 3500 * 1000); // Approx 1 hour
            const tokenService = service; // service is guaranteed to be GMAIL or CALENDAR here
            
            // Use actual scopes granted by Google (not hardcoded)
            const grantedScopes = grantedScopesFromGoogle.length > 0
                ? grantedScopesFromGoogle.join(',')
                : (tokenService === 'GMAIL' 
                    ? 'profile,email,https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.modify'
                    : tokenService === 'CALENDAR'
                        ? 'profile,email,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/calendar.events'
                        : tokenService === 'TASKS'
                            ? 'profile,email,https://www.googleapis.com/auth/tasks'
                            : tokenService === 'DRIVE'
                                ? 'profile,email,https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/drive.file'
                                : 'profile,email'); // Fallback for any other service type
            
            // Get existing connection to preserve refresh token if needed
            const existingIdentityToken = await prisma.serviceToken.findUnique({
                where: {
                    userId_service_accountEmail: {
                        userId: identity.userId,
                        service: tokenService,
                        accountEmail: profile.emails?.[0]?.value || ''
                    }
                },
                select: { encryptedRefreshToken: true }
            });
            
            await prisma.serviceToken.upsert({
                where: {
                    userId_service_accountEmail: {
                        userId: identity.userId,
                        service: tokenService,
                        accountEmail: profile.emails?.[0]?.value || ''
                    }
                },
                update: {
                    encryptedAccessToken: encryptToken(accessToken),
                    // Preserve existing refresh token if Google doesn't provide a new one
                    encryptedRefreshToken: refreshToken ? encryptToken(refreshToken) : existingIdentityToken?.encryptedRefreshToken,
                    grantedScopes: grantedScopes,
                    expiresAt,
                },
                create: {
                    userId: identity.userId,
                    service: tokenService,
                    accountEmail: profile.emails?.[0]?.value || '',
                    encryptedAccessToken: encryptToken(accessToken),
                    encryptedRefreshToken: refreshToken ? encryptToken(refreshToken) : null,
                    grantedScopes: grantedScopes,
                    expiresAt,
                }
            });
            
            // Clear connections cache so frontend can immediately see new/updated connection
            const { clearCache, createCacheKey } = require('../utils/cache');
            clearCache(createCacheKey('connections', identity.userId));

            return done(null, identity.user);
          }

          // Identity not found - return profile to handle linking/creation in controller
          logger.info({ profileId: profile.id }, "Google identity not found, proceeding to linking");
          // Attach tokens and scopes to profile for the controller to handle
          (profile as any).accessToken = accessToken;
          (profile as any).refreshToken = refreshToken;
          (profile as any).grantedScopes = grantedScopesFromGoogle;
          
          return done(null, profile as any);

        } catch (error) {
          logger.error({ error }, "Error during Google OAuth");
          return done(error as Error, undefined);
        }
      }
    )
  );
} else {
  logger.warn("Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it.");
}

// Configure Local Strategy (Phone/Email + Password)
passport.use(
  new LocalStrategy(
    {
      usernameField: 'username', // Frontend sends 'username' (can be phone or email)
      passwordField: 'password'
    },
    async (username, password, done) => {
      try {
        // Check if username is email or phone
        const isEmail = username.includes('@');
        
        const user = await prisma.user.findFirst({
          where: isEmail ? { email: username } : { whatsappPhone: username }
        });

        if (!user || !user.passwordHash) {
           return done(null, false, { message: 'Invalid phone number or password' });
        }

        const isValid = await comparePassword(password, user.passwordHash);

        if (!isValid) {
          return done(null, false, { message: 'Invalid credentials' });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

export default passport;