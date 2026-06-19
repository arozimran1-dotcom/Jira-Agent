/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import jwt from "jsonwebtoken";
import { 
  createUser, 
  getUserByEmail, 
  getUserById, 
  getProfilesForUser, 
  saveProfileForUser, 
  deleteProfileForUser, 
  getSessionsForUser, 
  saveSessionForUser, 
  deleteSessionForUser,
  hashPassword,
  markUserSetup
} from "./serverDb";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

const JWT_SECRET = process.env.JWT_SECRET || "default-super-secret-key-123456";

// Extend Express Request type to include userId and userEmail
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No authentication token provided" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function normalizeTaskIssueType(issuetype?: string | null): "Task" | "Story" | "Bug" | "Epic" {
  const normalized = (issuetype || "").trim().toLowerCase();
  if (normalized === "story") return "Story";
  if (normalized === "bug") return "Bug";
  if (normalized === "epic") return "Epic";
  return "Task";
}

function normalizeTaskPriority(priority?: string | null): "Highest" | "High" | "Medium" | "Low" | "Lowest" {
  const normalized = (priority || "").trim().toLowerCase();
  if (normalized === "highest") return "Highest";
  if (normalized === "high") return "High";
  if (normalized === "low") return "Low";
  if (normalized === "lowest") return "Lowest";
  return "Medium";
}

function normalizeRequestedModel(model?: string | null, provider?: string | null) {
  if (model === "gemini-3.5-flash" || provider === "google") {
    return { provider: "google", model: "gemini-3.5-flash" };
  }
  return { provider: "openai", model: "gpt-5.4-mini" };
}

function normalizeAgentResponse(payload: any, activeProject?: { key?: string | null; name?: string | null } | null) {
  const fallbackProject = (activeProject?.key || "").trim();
  const proposedLogs = Array.isArray(payload?.proposedLogs) ? payload.proposedLogs : [];
  const proposedTasks = Array.isArray(payload?.proposedTasks)
    ? payload.proposedTasks
        .map((task: any) => ({
          ...task,
          project: (task?.project || fallbackProject || "").trim(),
          summary: task?.summary || "",
          description: task?.description || "",
          issuetype: normalizeTaskIssueType(task?.issuetype),
          priority: normalizeTaskPriority(task?.priority)
        }))
        .filter((task: any) => task.project && task.summary)
    : [];

  return {
    explanation: payload?.explanation || "",
    proposedLogs,
    proposedTasks
  };
}

// Enable JSON body parsing with higher limit for bulk operations
app.use(express.json({ limit: "10mb" }));

// Auth Register Route
app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  try {
    const user = await createUser(email, password);
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ token, user: { id: user.id, email: user.email, hasSetupProfile: false } });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to register user" });
  }
});

// Auth Login Route
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const hash = hashPassword(password, user.salt);
    if (hash !== user.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, email: user.email, hasSetupProfile: user.hasSetupProfile || false } });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Login failed" });
  }
});

// Get Current User details
app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.userId!);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ id: user.id, email: user.email, hasSetupProfile: user.hasSetupProfile || false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Connection Profiles API
app.get("/api/user/profiles", requireAuth, async (req, res) => {
  try {
    const profiles = await getProfilesForUser(req.userId!);
    res.json(profiles);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user/profiles", requireAuth, async (req, res) => {
  try {
    const profile = req.body;
    const saved = await saveProfileForUser(req.userId!, profile);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/user/profiles/:id", requireAuth, async (req, res) => {
  try {
    await deleteProfileForUser(req.userId!, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user/mark-setup", requireAuth, async (req, res) => {
  try {
    await markUserSetup(req.userId!);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Chat Sessions API
app.get("/api/user/sessions", requireAuth, async (req, res) => {
  try {
    const sessions = await getSessionsForUser(req.userId!);
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user/sessions", requireAuth, async (req, res) => {
  try {
    const session = req.body;
    const saved = await saveSessionForUser(req.userId!, session);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/user/sessions/:id", requireAuth, async (req, res) => {
  try {
    await deleteSessionForUser(req.userId!, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to determine redirect URI for Atlassian OAuth
function getRedirectUri(req: express.Request): string {
  const host = req.headers.host || `localhost:${PORT}`;
  const protocol = req.headers["x-forwarded-proto"] || "http";
  
  // Use APP_URL if specified in env, otherwise build dynamically
  if (process.env.APP_URL) {
    // Remove trailing slash if present
    const cleanAppUrl = process.env.APP_URL.replace(/\/$/, "");
    return `${cleanAppUrl}/auth/callback`;
  }
  
  return `${protocol}://${host}/auth/callback`;
}

// 1. Get Atlassian OAuth Authorization URL
app.get("/api/auth/url", requireAuth, (req, res) => {
  const clientId = process.env.JIRA_CLIENT_ID;
  if (!clientId) {
    return res.status(400).json({ 
      error: "Jira Client ID is not configured on the server. Please define JIRA_CLIENT_ID in your environments." 
    });
  }

  const redirectUri = getRedirectUri(req);
  const state = Math.random().toString(36).substring(2, 15);
  
  // Scopes needed for Jira reading, writing workspace issues, transits, comments, and offline access
  const scopes = [
    // Classic Jira Scopes
    "read:jira-work",
    "write:jira-work",
    "read:jira-user",
    
    // Granular Jira Scopes (User, Issue, Worklog, Comments, Projects)
    "read:user:jira",
    "read:issue:jira",
    "read:issue-meta:jira",
    "read:issue.time-tracking:jira",
    "read:project:jira",
    "read:comment:jira",
    "write:comment:jira",
    "write:issue:jira",
    
    // Confluence Scopes (Spaces, Content summary, Pages)
    "read:confluence-space.summary",
    "read:confluence-content.summary",
    "read:confluence-content.all",
    
    // Offline access
    "offline_access"
  ].join(" ");

  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state: state,
    response_type: "code",
    prompt: "consent"
  });

  const authUrl = `https://auth.atlassian.com/authorize?${params.toString()}`;
  res.json({ url: authUrl, state });
});

// 2. OAuth Callback Route - exchange auth code for access/refresh tokens
app.all(["/auth/callback", "/auth/callback/"], async (req, res) => {
  const code = req.query.code as string;
  const error = req.query.error as string;
  const errorDescription = req.query.error_description as string;
  
  if (error || !code) {
    return res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #0f172a; color: #f1f5f9; text-align: center; padding: 20px;">
          <h1 style="color: #ef4444; margin-bottom: 12px; font-size: 24px;">Connection Failed</h1>
          <p style="color: #94a3b8; max-width: 450px; line-height: 1.6;">${errorDescription || error || "No authorization code received."}</p>
          <button onclick="window.close()" style="margin-top: 24px; padding: 10px 20px; background-color: #3b82f6; color: white; border: none; border-radius: 6px; font-weight: 500; cursor: pointer; transition: background-color 0.2s;">
            Close Window
          </button>
        </body>
      </html>
    `);
  }

  try {
    const clientId = process.env.JIRA_CLIENT_ID;
    const clientSecret = process.env.JIRA_CLIENT_SECRET;
    const redirectUri = getRedirectUri(req);

    if (!clientId || !clientSecret) {
      throw new Error("JIRA_CLIENT_ID or JIRA_CLIENT_SECRET is missing from the server environment.");
    }

    // Exchange code for tokens
    const response = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      })
    });

    const tokenData = await response.json();

    if (!response.ok) {
      throw new Error(tokenData.error_description || tokenData.error || "Failed to exchange authorization code");
    }

    // Send successful messages back to our parent React window
    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #0f172a; color: #f1f5f9; text-align: center; padding: 20px;">
          <div style="width: 60px; height: 60px; border-radius: 50%; background-color: #22c55e; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: 0 4px 10px rgba(34, 197, 94, 0.3);">
            <svg style="width: 32px; height: 32px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h1 style="color: #22c55e; margin-bottom: 8px; font-size: 24px;">Success!</h1>
          <p style="color: #94a3b8; font-size: 16px; margin-bottom: 4px;">Atlassian Jira successfully connected.</p>
          <p style="color: #64748b; font-size: 13px;">This window will close automatically shortly.</p>
          
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  tokens: ${JSON.stringify(tokenData)} 
                }, '*');
                setTimeout(() => {
                  window.close();
                }, 1200);
              } else {
                window.location.href = '/';
              }
            } catch (err) {
              console.error("PostMessage error:", err);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error("Atlassian OAuth exchange error:", err);
    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #0f172a; color: #f1f5f9; text-align: center; padding: 20px;">
          <h1 style="color: #ef4444; margin-bottom: 12px; font-size: 24px;">OAuth Integration Error</h1>
          <p style="color: #ef4444; background: rgba(239, 68, 68, 0.1); padding: 12px; border-radius: 6px; font-family: monospace; max-width: 500px; text-align: left; word-break: break-all;">${err.message || err}</p>
          <p style="color: #64748b; font-size: 14px; margin-top: 16px;">Make sure your Client Secret and Callback URLs are configured correctly on Atlassian Console.</p>
          <button onclick="window.close()" style="margin-top: 24px; padding: 10px 20px; background-color: #3b82f6; color: white; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;">
            Close Window
          </button>
        </body>
      </html>
    `);
  }
});

// 3. Refresh OAuth token endpoint
app.post("/api/auth/refresh", requireAuth, async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ error: "refresh_token is required" });
  }

  const clientId = process.env.JIRA_CLIENT_ID;
  const clientSecret = process.env.JIRA_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: "OAuth client credentials are not configured on the server." });
  }

  try {
    const response = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token
      })
    });

    const tokenData = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(tokenData);
    }

    res.json(tokenData);
  } catch (error: any) {
    console.error("Token refresh error:", error);
    res.status(500).json({ error: error.message || "Failed to refresh token" });
  }
});

// 4. Accessible Resources (Jira Sites) List for OAuth 2.0
app.get("/api/jira/oauth/sites", requireAuth, async (req, res) => {
  const atlassianToken = req.headers["x-atlassian-access-token"] as string;
  if (!atlassianToken) {
    return res.status(400).json({ error: "Missing x-atlassian-access-token header" });
  }

  try {
    const response = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: {
        Authorization: `Bearer ${atlassianToken}`,
        Accept: "application/json"
      }
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error: any) {
    console.error("Fetch accessible sites error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch accessible resources" });
  }
});

// Helper to make internal Jira requests
async function makeInternalJiraRequest(endpoint: string, method: string, bodyPayload: any, query: any, authConfig: any) {
  const { authType, cloudId, accessToken, domain, email, apiToken } = authConfig;
  
  if (!endpoint) throw new Error("endpoint is required");

  let targetUrl = "";
  let authorizationHeader = "";

  const isWiki = endpoint.startsWith("wiki/");

  if (authType === "oauth") {
    if (!cloudId || !accessToken) throw new Error("OAuth require cloudId and accessToken");
    targetUrl = isWiki
      ? `https://api.atlassian.com/ex/confluence/${cloudId}/${endpoint}`
      : `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/${endpoint}`;
    authorizationHeader = `Bearer ${accessToken}`;
  } else if (authType === "basic") {
    if (!domain || !email || !apiToken) throw new Error("Basic Authentication requires domain, email, and apiToken");
    const cleanDomain = domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    targetUrl = isWiki ? `https://${cleanDomain}/${endpoint}` : `https://${cleanDomain}/rest/api/3/${endpoint}`;
    authorizationHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
  } else if (authType === "demo") {
    throw new Error("Demo mode does not support live Jira API calls");
  } else {
    throw new Error("Invalid or missing authType");
  }

  if (query && Object.keys(query).length > 0) {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) queryParams.append(key, String(value));
    }
    targetUrl = `${targetUrl}${targetUrl.includes("?") ? "&" : "?"}${queryParams.toString()}`;
  }

  const requestOptions: RequestInit = {
    method: method,
    headers: {
      Authorization: authorizationHeader,
      Accept: "application/json",
      "Content-Type": "application/json"
    }
  };

  if (method !== "GET" && bodyPayload) {
    requestOptions.body = JSON.stringify(bodyPayload);
  }

  const response = await fetch(targetUrl, requestOptions);
  const contentType = response.headers.get("content-type") || "";
  let responseData;
  if (contentType.includes("application/json")) {
    responseData = await response.json();
  } else {
    responseData = { text: await response.text() };
  }
  
  return { status: response.status, data: responseData };
}

// 5. General Jira Proxy Route to deal with CORS and authentication
app.post("/api/jira/proxy", requireAuth, async (req, res) => {
  const authConfig = {
    authType: req.headers["x-jira-auth-type"] as string,
    cloudId: req.headers["x-jira-cloud-id"] as string,
    accessToken: req.headers["x-jira-access-token"] as string,
    domain: req.headers["x-jira-domain"] as string,
    email: req.headers["x-jira-email"] as string,
    apiToken: req.headers["x-jira-api-token"] as string,
  };

  try {
    const result = await makeInternalJiraRequest(req.body.endpoint, req.body.method || "GET", req.body.body, req.body.query, authConfig);
    res.status(result.status).json(result.data);
  } catch (error: any) {
    console.error(`Jira Proxy Error:`, error);
    res.status(500).json({ error: error.message || "Proxy connection to Jira failed" });
  }
});

// AI Agent Endpoint
app.post("/api/gemini/agent", requireAuth, async (req, res) => {
  const {
    prompt,
    issues,
    apiKey: clientApiKey,
    recentWorklogs,
    authConfig,
    userProfile,
    provider = "openai",
    model = "gpt-5.4-mini",
    openaiApiKey: clientOpenaiApiKey,
    conversationHistory = [],
    activeProject
  } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  const selectedModel = normalizeRequestedModel(model, provider);

  // Helper to extract plain text from ADF comment structure
  const extractTextFromADF = (comment: any): string => {
    if (!comment) return "";
    if (typeof comment === "string") return comment;
    if (comment.text) return comment.text;
    if (Array.isArray(comment.content)) {
      return comment.content.map(extractTextFromADF).join(" ");
    }
    if (comment.content) {
      return extractTextFromADF(comment.content);
    }
    return "";
  };

  const issuesContext = (issues || []).map((issue: any) => {
    let lastWorklogComment = "";
    
    // Extract latest worklog comment
    const worklogs = issue.fields?.worklog?.worklogs;
    if (Array.isArray(worklogs) && worklogs.length > 0) {
      const sorted = [...worklogs].sort((a: any, b: any) => {
        return new Date(b.created || 0).getTime() - new Date(a.created || 0).getTime();
      });
      lastWorklogComment = extractTextFromADF(sorted[0]?.comment);
    } else if (issue.fields?.worklog_fallback) {
      lastWorklogComment = issue.fields.worklog_fallback;
    }

    return {
      key: issue.key || issue.id,
      summary: issue.fields?.summary || "",
      description: issue.fields?.description || "",
      status: issue.fields?.status?.name || "",
      issuetype: issue.fields?.issuetype?.name || "",
      lastWorklogComment: lastWorklogComment
    };
  });

  const systemInstruction = "You are JIRA AI Agent, a sharp and efficient AI assistant for Atlassian Jira time-tracking and workflow. " +
    "Be concise — respond in 1-3 short sentences max unless detail is truly needed. Never write long paragraphs or bullet lists unless the user asks. " +
    "For greetings or casual chat, reply very briefly and naturally. " +
    "For time logging requests, ALWAYS propose logs immediately — never ask clarifying questions. Pick the best matching issue using your judgment. " +
    "For task/issue creation requests, ALWAYS propose the new task immediately — pick the most sensible project, type, and priority from context. " +
    "Rules:\n" +
    "1. Match issues using context, recent worklogs, and issue keys. Call searchJiraIssues only when no match exists in context.\n" +
    "2. Only use worklogs authored by the 'Current User'. 'Last task' = the most recent entry in User's Recent Worklogs.\n" +
    "3. Durations: use Jira format (e.g. '2h', '30m', '1h 30m').\n" +
    "4. Dates: 'started' field must be ISO 8601 at noon UTC: YYYY-MM-DDT12:00:00.000+0000. Infer date from context (today, yesterday, etc).\n" +
    "5. Confidence: 'high' = exact key match, 'medium' = semantic match, 'low' = fallback guess.\n" +
    "6. Spelling: auto-correct typos in comments silently.\n" +
    "7. NEVER add a References or Sources section. NEVER ask follow-up questions if you can make a reasonable guess.\n" +
    "8. For task creation: populate proposedTasks. Use the project key from Available Issues context. issuetype must be 'Task', 'Story', 'Bug', or 'Epic'. priority must be 'Highest', 'High', 'Medium', 'Low', or 'Lowest'.\n" +
    "9. Output: valid JSON only, schema: { \"explanation\": string, \"proposedLogs\": [...], \"proposedTasks\": [{ \"project\", \"summary\", \"description\", \"issuetype\", \"priority\" }] }";

  const contextBlock = `Current User: ${userProfile ? JSON.stringify(userProfile) : "Unknown User"}\nToday: ${new Date().toISOString().split("T")[0]}\nActive Project: ${activeProject ? JSON.stringify(activeProject) : "Unknown"}\n\nUser's Recent Worklogs:\n${JSON.stringify(recentWorklogs || [], null, 2)}\n\nAvailable Issues:\n${JSON.stringify(issuesContext, null, 2)}`;

  const messageContents = `${contextBlock}\n\nUser: "${prompt}"`;

  // Build prior chat turns for context (skip the welcome message)
  const priorTurns = (conversationHistory as any[]).filter(m => m.text && m.role !== "system");
  const geminiHistory = priorTurns.slice(0, -1).map((m: any) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }]
  }));

  if (selectedModel.provider === "openai") {
    const openaiApiKey = clientOpenaiApiKey || process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(400).json({
        error: "OpenAI API Key is missing. Please configure it in your User Profile or define OPENAI_API_KEY on the server."
      });
    }

    try {
      const priorOpenAI = priorTurns.slice(0, -1).map((m: any) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text
      }));
      const messages: any[] = [
        { role: "system", content: systemInstruction },
        ...priorOpenAI,
        { role: "user", content: messageContents }
      ];

      let completed = false;
      let responseJson: any = null;

      while (!completed) {
        const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiApiKey}`
          },
          body: JSON.stringify({
            model: selectedModel.model,
            messages: messages,
            tools: [
              {
                type: "function",
                function: {
                  name: "searchJiraIssues",
                  description: "Execute a Jira JQL search to find issues dynamically. E.g., `assignee = currentUser() AND issuetype = Epic`. Use this when you need to find issues that the user is talking about.",
                  parameters: {
                    type: "object",
                    properties: {
                      jql: { type: "string", description: "The JQL query string." }
                    },
                    required: ["jql"]
                  }
                }
              }
            ],
            response_format: { type: "json_object" }
          })
        });

        if (!apiResponse.ok) {
          const errData = await apiResponse.json().catch(() => ({}));
          throw new Error(errData.error?.message || `OpenAI API returned status ${apiResponse.status}`);
        }

        const resData = await apiResponse.json();
        const choice = resData.choices?.[0];
        if (!choice) {
          throw new Error("Empty response from OpenAI");
        }

        const message = choice.message;
        
        if (message.tool_calls && message.tool_calls.length > 0) {
          messages.push(message);

          for (const call of message.tool_calls) {
            if (call.function.name === "searchJiraIssues" && authConfig && authConfig.authType !== "demo") {
              let jql = "";
              try {
                const args = JSON.parse(call.function.arguments);
                jql = args.jql;
              } catch (e) {
                console.error("Failed to parse tool arguments:", call.function.arguments);
              }

              console.log("AI Agent (OpenAI) executing JQL Search:", jql);
              let searchRes: any;
              try {
                const results = await makeInternalJiraRequest("search", "GET", null, { jql, maxResults: 15, fields: "summary,description,status,issuetype" }, authConfig);
                searchRes = results.data;
              } catch (e: any) {
                console.error("Function Call Error:", e.message);
                searchRes = { error: e.message };
              }

              messages.push({
                role: "tool",
                tool_call_id: call.id,
                name: call.function.name,
                content: JSON.stringify(searchRes)
              });
            } else {
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                name: call.function.name,
                content: JSON.stringify({ error: "Cannot search Jira because auth credentials were not provided or in demo mode." })
              });
            }
          }
        } else {
          completed = true;
          try {
            responseJson = JSON.parse(message.content || "{}");
          } catch (err) {
            throw new Error("OpenAI did not return valid JSON: " + message.content);
          }
        }
      }

      res.json(normalizeAgentResponse(responseJson, activeProject));
    } catch (error: any) {
      console.error("OpenAI Agent Proxy Error:", error);
      res.status(500).json({ error: error.message || "Failed to query Jira OpenAI agent" });
    }

  } else {
    // Google Gemini Flow
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: "Gemini API Key is missing. Please configure it in your User Profile or define GEMINI_API_KEY on the server."
      });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });

      const chat = ai.chats.create({
        model: selectedModel.model,
        history: geminiHistory,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              explanation: {
                type: Type.STRING,
                description: "A natural, friendly, conversational reply to the user. E.g., 'Hi! How can I help you today?' or 'I have prepared your 2h log for PR-698. Let me know if you want to proceed!'"
              },
              proposedLogs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    issueKey: {
                      type: Type.STRING,
                      description: "The matched issue key (e.g. APP-101) or fallback."
                    },
                    issueSummary: {
                      type: Type.STRING,
                      description: "The summary/title of the matched issue."
                    },
                    timeSpent: {
                      type: Type.STRING,
                      description: "Jira formatted duration (e.g., '2h 15m' or '4h')."
                    },
                    comment: {
                      type: Type.STRING,
                      description: "Jira worklog comment explaining the work done."
                    },
                    started: {
                      type: Type.STRING,
                      description: "The absolute date and time the work was started, based on the user's prompt. Must be ISO 8601 format like YYYY-MM-DDThh:mm:ss.000+0000. If unspecified, use current date/time."
                    },
                    confidence: {
                      type: Type.STRING,
                      description: "Confidence status of issue matching: 'high', 'medium', or 'low'."
                    }
                  },
                  required: ["issueKey", "issueSummary", "timeSpent", "comment", "started", "confidence"]
                }
              },
              proposedTasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    project: {
                      type: Type.STRING,
                      description: "The Jira project key to create the issue in (e.g. 'APP', 'PR')."
                    },
                    summary: {
                      type: Type.STRING,
                      description: "Short title/summary of the new issue."
                    },
                    description: {
                      type: Type.STRING,
                      description: "Detailed description of the new issue."
                    },
                    issuetype: {
                      type: Type.STRING,
                      description: "Jira issue type: 'Task', 'Story', 'Bug', or 'Epic'."
                    },
                    priority: {
                      type: Type.STRING,
                      description: "Issue priority: 'Highest', 'High', 'Medium', 'Low', or 'Lowest'."
                    }
                  },
                  required: ["project", "summary", "description", "issuetype", "priority"]
                }
              }
            },
            required: ["explanation", "proposedLogs", "proposedTasks"]
          },
          tools: [{
            functionDeclarations: [{
              name: "searchJiraIssues",
              description: "Execute a Jira JQL search to find issues dynamically. E.g., `assignee = currentUser() AND issuetype = Epic`. Use this when you need to find issues that the user is talking about.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  jql: { type: Type.STRING, description: "The JQL query string." }
                },
                required: ["jql"]
              }
            }]
          }]
        }
      });

      let response = await chat.sendMessage({ message: messageContents });

      while (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        if (call.name === "searchJiraIssues" && authConfig && authConfig.authType !== "demo") {
          const jql = (call.args as any).jql;
          console.log("AI Agent executing JQL Search:", jql);
          try {
            const searchRes = await makeInternalJiraRequest("search", "GET", null, { jql, maxResults: 15, fields: "summary,description,status,issuetype" }, authConfig);
            response = await chat.sendMessage({ message: [{
              functionResponse: { name: call.name, response: searchRes.data }
            }] });
          } catch (e: any) {
            console.error("Function Call Error:", e.message);
            response = await chat.sendMessage({ message: [{
              functionResponse: { name: call.name, response: { error: e.message } }
            }] });
          }
        } else {
          response = await chat.sendMessage({ message: [{
            functionResponse: { name: call.name, response: { error: "Cannot search Jira because auth credentials were not provided or in demo mode." } }
          }] });
        }
      }

      const dataText = response.text;
      if (!dataText) {
        throw new Error("Empty response from AI engine");
      }

      res.json(normalizeAgentResponse(JSON.parse(dataText), activeProject));
    } catch (error: any) {
      console.error("AI Agent Proxy Error:", error);
      res.status(500).json({ error: error.message || "Failed to query Jira AI agent" });
    }
  }
});

// 6. Vite Dev Server + Production Routing Setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Setting up Vite middleware for development...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving static production assets from /dist...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Jira Dashboard Server running on http://localhost:${PORT}`);
  });
}

startServer();
