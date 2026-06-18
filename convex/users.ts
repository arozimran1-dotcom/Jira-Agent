import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();
  },
});

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    try {
      const userDocId = ctx.db.normalizeId("users", args.id);
      if (userDocId) {
        const user = await ctx.db.get(userDocId);
        if (user) {
          return { id: user._id, email: user.email, passwordHash: user.passwordHash, salt: user.salt, hasSetupProfile: user.hasSetupProfile };
        }
      }
    } catch (e) {}
    return null;
  },
});

export const create = mutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
    salt: v.string(),
  },
  handler: async (ctx, args) => {
    const emailLower = args.email.toLowerCase();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", emailLower))
      .unique();
    if (existing) {
      throw new Error("User with this email already exists");
    }
    const insertedId = await ctx.db.insert("users", {
      email: emailLower,
      passwordHash: args.passwordHash,
      salt: args.salt,
      hasSetupProfile: false,
    });
    return { id: insertedId, email: emailLower };
  },
});

export const markProfileSetup = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    try {
      const userDocId = ctx.db.normalizeId("users", args.userId);
      if (userDocId) {
        await ctx.db.patch(userDocId, { hasSetupProfile: true });
      }
    } catch (e: any) {
      throw new Error("Failed to mark profile setup: " + e.message);
    }
  },
});
