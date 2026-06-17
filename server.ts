/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Enable JSON body parsing with higher limit for bulk operations
app.use(express.json({ limit: "10mb" }));

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
app.get("/api/auth/url", (req, res) => {
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
app.post("/api/auth/refresh", async (req, res) => {
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
app.get("/api/jira/oauth/sites", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  try {
    const response = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: {
        Authorization: authHeader,
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

// 5. General Jira Proxy Route to deal with CORS and authentication
app.post("/api/jira/proxy", async (req, res) => {
  const authType = req.headers["x-jira-auth-type"] as string; // 'oauth' or 'basic'
  const endpoint = req.body.endpoint as string; // e.g. 'search', 'project', etc.
  const method = req.body.method as string || "GET";
  const bodyPayload = req.body.body; // post data if any

  if (!endpoint) {
    return res.status(400).json({ error: "endpoint is required" });
  }

  let targetUrl = "";
  let authorizationHeader = "";

  const isWiki = endpoint.startsWith("wiki/");

  if (authType === "oauth") {
    const cloudId = req.headers["x-jira-cloud-id"] as string;
    const accessToken = req.headers["x-jira-access-token"] as string;

    if (!cloudId || !accessToken) {
      return res.status(400).json({ error: "OAuth require x-jira-cloud-id and x-jira-access-token headers" });
    }

    if (isWiki) {
      targetUrl = `https://api.atlassian.com/ex/jira/${cloudId}/${endpoint}`;
    } else {
      targetUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/${endpoint}`;
    }
    authorizationHeader = `Bearer ${accessToken}`;
  } else if (authType === "basic") {
    const domain = req.headers["x-jira-domain"] as string;
    const email = req.headers["x-jira-email"] as string;
    const apiToken = req.headers["x-jira-api-token"] as string;

    if (!domain || !email || !apiToken) {
      return res.status(400).json({ error: "Basic Authentication requires domain, email, and api-token headers" });
    }

    // Clean domain
    const cleanDomain = domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (isWiki) {
      targetUrl = `https://${cleanDomain}/${endpoint}`;
    } else {
      targetUrl = `https://${cleanDomain}/rest/api/3/${endpoint}`;
    }
    authorizationHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
  } else {
    return res.status(400).json({ error: "Invalid or missing x-jira-auth-type header" });
  }

  // Add query parameters from request onto target URL
  if (req.body.query && Object.keys(req.body.query).length > 0) {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.body.query)) {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    }
    const separator = targetUrl.includes("?") ? "&" : "?";
    targetUrl = `${targetUrl}${separator}${queryParams.toString()}`;
  }

  try {
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

    res.status(response.status).json(responseData);
  } catch (error: any) {
    console.error(`Jira Proxy Error for ${method} to ${targetUrl}:`, error);
    res.status(500).json({ error: error.message || "Proxy connection to Jira failed" });
  }
});

// AI Agent Endpoint
app.post("/api/gemini/agent", async (req, res) => {
  const { prompt, issues } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  // Use server-side Gemini key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: "Gemini API Key is not configured on the server. Please define GEMINI_API_KEY in your Settings > Secrets panel."
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

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `User time-tracking prompt: "${prompt}"\n\nAvailable Jira Issues/Subtasks in project:\n${JSON.stringify(issuesContext, null, 2)}`,
      config: {
        systemInstruction: "You are Jira-Intelligence, a premium AI Assistant for Atlassian Jira specialized in time-tracking and workflow logging. " +
          "Your task is to parse user worklogs, progress updates, or work summaries and translate them into structured Jira time logs. " +
          "Follow these critical guidelines:\n" +
          "1. Match issues/subtasks carefully. If prompt mentions a code or issue key (such as 'pr-698' or '698'), look for an issue key (e.g. PR-698, PRODUCT-698) or summary that matches this pattern exactly or partially. DO NOT match to a generic issue (like MAR-50) if a better key match or ID match exists. Give maximum priority to any alphanumeric codes (e.g. 'pr-698') match against keys (e.g. key: 'PR-698') or summaries.\n" +
          "2. If the user mentions 'the same description as last log' or 'same description' or 'last log' for an issue, check the 'lastWorklogComment' of that matched issue. If it contains a comment, use that EXACT comment string verbatim as the proposed log's comment. If 'lastWorklogComment' is empty/not present, fallback to writing a complete, professional, human description of what they did.\n" +
          "3. Highlight which issues you matched and give an explanation of your matching process.\n" +
          "4. Duration must be formatted as normal Jira time tracking patterns (e.g., '1h 30m', '4h', '30m', '1d').\n" +
          "5. Status confidence: Use 'high' confidence when an issue key or ID matches perfectly, 'medium' for semantic title matches, and 'low' for fallbacks.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            explanation: {
              type: Type.STRING,
              description: "A summary explanation of what you processed, matched, and resolved from the user's prompt."
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
                  confidence: {
                    type: Type.STRING,
                    description: "Confidence status of issue matching: 'high', 'medium', or 'low'."
                  }
                },
                required: ["issueKey", "issueSummary", "timeSpent", "comment", "confidence"]
              }
            }
          },
          required: ["explanation", "proposedLogs"]
        }
      }
    });

    const dataText = response.text;
    if (!dataText) {
      throw new Error("Empty response from AI engine");
    }

    res.json(JSON.parse(dataText));
  } catch (error: any) {
    console.error("AI Agent Proxy Error:", error);
    res.status(500).json({ error: error.message || "Failed to query Jira AI agent" });
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
