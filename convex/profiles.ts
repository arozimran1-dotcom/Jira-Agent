import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getForUser = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const saveForUser = mutation({
  args: {
    userId: v.string(),
    profile: v.object({
      id: v.string(),
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
      openaiApiKey: v.optional(v.union(v.null(), v.string())),
      selectedModelProvider: v.optional(v.union(v.null(), v.string())),
      selectedModelName: v.optional(v.union(v.null(), v.string())),
    }),
  },
  handler: async (ctx, args) => {
    const { userId, profile } = args;
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_userId_and_id", (q) => q.eq("userId", userId).eq("id", profile.id))
      .unique();

    const profileToSave = {
      id: profile.id,
      userId,
      name: profile.name,
      authType: profile.authType,
      directConn: profile.directConn,
      oauthTokens: profile.oauthTokens,
      selectedSite: profile.selectedSite,
      geminiApiKey: profile.geminiApiKey,
      openaiApiKey: (profile as any).openaiApiKey !== undefined ? (profile as any).openaiApiKey : null,
      selectedModelProvider: (profile as any).selectedModelProvider !== undefined ? (profile as any).selectedModelProvider : "google",
      selectedModelName: (profile as any).selectedModelName !== undefined ? (profile as any).selectedModelName : "gemini-3.5-flash",
    };

    if (existing) {
      await ctx.db.patch(existing._id, profileToSave);
      return { _id: existing._id, ...profileToSave };
    } else {
      const insertedId = await ctx.db.insert("profiles", profileToSave);
      return { _id: insertedId, ...profileToSave };
    }
  },
});

export const deleteForUser = mutation({
  args: { userId: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_userId_and_id", (q) => q.eq("userId", args.userId).eq("id", args.id))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
