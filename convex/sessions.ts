import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getForUser = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const saveForUser = mutation({
  args: {
    userId: v.string(),
    session: v.object({
      id: v.string(),
      name: v.string(),
      messages: v.array(v.any()),
      activeProfileId: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const { userId, session } = args;
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_userId_and_id", (q) => q.eq("userId", userId).eq("id", session.id))
      .unique();

    const sessionToSave = {
      id: session.id,
      userId,
      name: session.name,
      messages: session.messages,
      activeProfileId: session.activeProfileId,
      createdAt: session.createdAt,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, sessionToSave);
      return { _id: existing._id, ...sessionToSave };
    } else {
      const insertedId = await ctx.db.insert("sessions", sessionToSave);
      return { _id: insertedId, ...sessionToSave };
    }
  },
});

export const deleteForUser = mutation({
  args: { userId: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_userId_and_id", (q) => q.eq("userId", args.userId).eq("id", args.id))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
