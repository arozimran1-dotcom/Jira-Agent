import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    salt: v.string(),
    hasSetupProfile: v.optional(v.boolean()),
  }).index("by_email", ["email"]),

  profiles: defineTable({
    id: v.string(), // custom string ID from frontend/backend
    userId: v.string(),
    name: v.string(),
    authType: v.string(),
    directConn: v.union(
      v.null(),
      v.object({
        domain: v.string(),
        email: v.string(),
        apiToken: v.string(),
      })
    ),
    oauthTokens: v.any(),
    selectedSite: v.any(),
    geminiApiKey: v.union(v.null(), v.string()),
  })
    .index("by_profile_id", ["id"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_id", ["userId", "id"]),

  sessions: defineTable({
    id: v.string(), // custom string ID from frontend/backend
    userId: v.string(),
    name: v.string(),
    messages: v.array(v.any()),
    activeProfileId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_session_id", ["id"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_id", ["userId", "id"]),
});
