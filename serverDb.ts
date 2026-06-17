import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const DB_FILE = path.join(process.cwd(), "server_db.json");

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
}

export interface DbSchema {
  users: User[];
  profiles: any[];
  sessions: any[];
}

function initDb(): DbSchema {
  if (!fs.existsSync(DB_FILE)) {
    const defaultData: DbSchema = {
      users: [],
      profiles: [],
      sessions: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), "utf8");
    return defaultData;
  }
  try {
    const content = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.error("Failed to read server DB file, resetting:", err);
    const defaultData: DbSchema = {
      users: [],
      profiles: [],
      sessions: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), "utf8");
    return defaultData;
  }
}

export function getDb(): DbSchema {
  return initDb();
}

export function saveDb(db: DbSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write server DB:", err);
  }
}

// Password hashing helper
export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

// User methods
export function getUserByEmail(email: string): User | undefined {
  const db = getDb();
  return db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

export function getUserById(id: string): User | undefined {
  const db = getDb();
  return db.users.find(u => u.id === id);
}

export function createUser(email: string, password: string): User {
  const db = getDb();
  const emailLower = email.toLowerCase();
  
  if (db.users.some(u => u.email.toLowerCase() === emailLower)) {
    throw new Error("User with this email already exists");
  }
  
  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);
  
  const newUser: User = {
    id: `user-${crypto.randomUUID()}`,
    email: emailLower,
    passwordHash,
    salt
  };
  
  db.users.push(newUser);
  saveDb(db);
  return newUser;
}

// Connection Profiles methods
export function getProfilesForUser(userId: string): any[] {
  const db = getDb();
  return db.profiles.filter(p => p.userId === userId);
}

export function saveProfileForUser(userId: string, profile: any): any {
  const db = getDb();
  
  // Clean credentials parameter
  const profileToSave = {
    ...profile,
    userId
  };
  
  const index = db.profiles.findIndex(p => p.id === profile.id && p.userId === userId);
  if (index !== -1) {
    db.profiles[index] = profileToSave;
  } else {
    if (!profileToSave.id) {
      profileToSave.id = `profile-${crypto.randomUUID()}`;
    }
    db.profiles.push(profileToSave);
  }
  
  saveDb(db);
  return profileToSave;
}

export function deleteProfileForUser(userId: string, profileId: string): void {
  const db = getDb();
  db.profiles = db.profiles.filter(p => !(p.id === profileId && p.userId === userId));
  saveDb(db);
}

// Chat Sessions methods
export function getSessionsForUser(userId: string): any[] {
  const db = getDb();
  return db.sessions.filter(s => s.userId === userId);
}

export function saveSessionForUser(userId: string, session: any): any {
  const db = getDb();
  
  const sessionToSave = {
    ...session,
    userId,
    updatedAt: Date.now()
  };
  
  const index = db.sessions.findIndex(s => s.id === session.id && s.userId === userId);
  if (index !== -1) {
    db.sessions[index] = sessionToSave;
  } else {
    if (!sessionToSave.id) {
      sessionToSave.id = `session-${crypto.randomUUID()}`;
    }
    db.sessions.push(sessionToSave);
  }
  
  saveDb(db);
  return sessionToSave;
}

export function deleteSessionForUser(userId: string, sessionId: string): void {
  const db = getDb();
  db.sessions = db.sessions.filter(s => !(s.id === sessionId && s.userId === userId));
  saveDb(db);
}
