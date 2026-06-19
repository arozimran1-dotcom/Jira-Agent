import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

function normalizeSelectedModel(model?: string | null, provider?: string | null) {
  if (model === "gemini-3.5-flash" || provider === "google") {
    return { selectedModelProvider: "google", selectedModelName: "gemini-3.5-flash" };
  }
  return { selectedModelProvider: "openai", selectedModelName: "gpt-5.4-mini" };
}

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
    const normalizedModel = normalizeSelectedModel(
      (profile as any).selectedModelName,
      (profile as any).selectedModelProvider
    );
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
      selectedModelProvider: normalizedModel.selectedModelProvider,
      selectedModelName: normalizedModel.selectedModelName,
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
