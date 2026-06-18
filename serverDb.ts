import * as crypto from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.warn("WARNING: CONVEX_URL is not defined in the environment. Convex queries will fail.");
}

const convex = new ConvexHttpClient(CONVEX_URL || "");

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
}

// Password hashing helper
export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

// User methods
export async function getUserByEmail(email: string): Promise<any | undefined> {
  try {
    const user = await convex.query(api.users.getByEmail, { email }) as any;
    if (user) {
      return {
        id: user._id,
        email: user.email,
        passwordHash: user.passwordHash,
        salt: user.salt,
        hasSetupProfile: user.hasSetupProfile || false
      };
    }
  } catch (err) {
    console.error("Convex getUserByEmail error:", err);
  }
  return undefined;
}

export async function getUserById(id: string): Promise<any | undefined> {
  try {
    const user = await convex.query(api.users.getById, { id }) as any;
    if (user) {
      return {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        salt: user.salt,
        hasSetupProfile: user.hasSetupProfile || false
      };
    }
  } catch (err) {
    console.error("Convex getUserById error:", err);
  }
  return undefined;
}

export async function markUserSetup(userId: string): Promise<void> {
  try {
    await convex.mutation(api.users.markProfileSetup, { userId });
  } catch (err) {
    console.error("Convex markUserSetup error:", err);
    throw err;
  }
}

export async function createUser(email: string, password: string): Promise<any> {
  const emailLower = email.toLowerCase();
  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);
  
  const result = await convex.mutation(api.users.create, {
    email: emailLower,
    passwordHash,
    salt
  }) as any;
  
  return result;
}

// Connection Profiles methods
export async function getProfilesForUser(userId: string): Promise<any[]> {
  try {
    return await convex.query(api.profiles.getForUser, { userId }) as any[];
  } catch (err) {
    console.error("Convex getProfilesForUser error:", err);
    return [];
  }
}

export async function saveProfileForUser(userId: string, profile: any): Promise<any> {
  const profileToSave = { ...profile };
  if (!profileToSave.id) {
    profileToSave.id = `profile-${crypto.randomUUID()}`;
  }
  
  // Ensure default structure doesn't break schema expectations
  if (profileToSave.directConn === undefined) {
    profileToSave.directConn = null;
  }
  if (profileToSave.oauthTokens === undefined) {
    profileToSave.oauthTokens = null;
  }
  if (profileToSave.selectedSite === undefined) {
    profileToSave.selectedSite = null;
  }
  if (profileToSave.geminiApiKey === undefined) {
    profileToSave.geminiApiKey = null;
  }

  return await convex.mutation(api.profiles.saveForUser, {
    userId,
    profile: profileToSave
  }) as any;
}

export async function deleteProfileForUser(userId: string, profileId: string): Promise<void> {
  try {
    await convex.mutation(api.profiles.deleteForUser, { userId, id: profileId });
  } catch (err) {
    console.error("Convex deleteProfileForUser error:", err);
  }
}

// Chat Sessions methods
export async function getSessionsForUser(userId: string): Promise<any[]> {
  try {
    return await convex.query(api.sessions.getForUser, { userId }) as any[];
  } catch (err) {
    console.error("Convex getSessionsForUser error:", err);
    return [];
  }
}

export async function saveSessionForUser(userId: string, session: any): Promise<any> {
  const sessionToSave = { ...session };
  if (!sessionToSave.id) {
    sessionToSave.id = `session-${crypto.randomUUID()}`;
  }
  
  if (!sessionToSave.createdAt) {
    sessionToSave.createdAt = Date.now();
  }
  if (!sessionToSave.messages) {
    sessionToSave.messages = [];
  }
  if (!sessionToSave.activeProfileId) {
    sessionToSave.activeProfileId = "default";
  }

  return await convex.mutation(api.sessions.saveForUser, {
    userId,
    session: sessionToSave
  }) as any;
}

export async function deleteSessionForUser(userId: string, sessionId: string): Promise<void> {
  try {
    await convex.mutation(api.sessions.deleteForUser, { userId, id: sessionId });
  } catch (err) {
    console.error("Convex deleteSessionForUser error:", err);
  }
}
