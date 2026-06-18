/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity,
  Plus,
  Search,
  RotateCw,
  ArrowRight,
  AlertCircle,
  Clock,
  LogOut,
  Globe,
  KeyRound,
  Users,
  Check,
  Zap,
  Briefcase,
  Layers,
  Sparkles,
  MessageSquare,
  Bookmark,
  ChevronRight,
  User,
  Info,
  BookOpen,
  HelpCircle,
  ExternalLink,
  FileText,
  Bot,
  Send
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { initDB, saveSession, getSession, getAllSessions, deleteSession, ChatSession } from "./db";

import { 
  JIRA_AUTH_TYPE, 
  JiraIssue, 
  JiraProject, 
  JiraUser, 
  AccessibleSite, 
  AtlassianTokens, 
  DirectConnection,
  UserProfile
} from "./types";

import { 
  DEMO_PROJECTS, 
  DEMO_USERS, 
  INITIAL_DEMO_ISSUES 
} from "./demoData";

// Helper to extract texts from ADF (Atlassian Document Format) or strings safely
function extractJiraText(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    // If ADF structure has content arrays (e.g. document root)
    if (value.content && Array.isArray(value.content)) {
      return value.content.map((block: any) => extractJiraText(block)).join("\n");
    }
    // Standard ADF Text block
    if (value.type === "text" && value.text) {
      return value.text;
    }
    // Standard ADF Paragraph block
    if (value.type === "paragraph" && Array.isArray(value.content)) {
      return value.content.map((c: any) => extractJiraText(c)).join("");
    }
    // Deep fallback
    if (value.type) {
      return "";
    }
    return JSON.stringify(value);
  }
  return "";
}

// Time tracking utilities
function parseTimeSpentToSeconds(timeStr: string): number {
  let seconds = 0;
  const regex = /(\d+)\s*(d|h|m)/g;
  let match;
  let found = false;
  const lowerStr = timeStr.toLowerCase().trim();
  while ((match = regex.exec(lowerStr)) !== null) {
    found = true;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === "d") seconds += value * 8 * 3600; // standard 8h Jira workday
    else if (unit === "h") seconds += value * 3600;
    else if (unit === "m") seconds += value * 60;
  }
  if (!found) {
    const raw = parseInt(lowerStr, 10);
    if (!isNaN(raw)) {
      seconds = raw * 3600; // fallback default to hours
    }
  }
  return seconds;
}

function formatSecondsToJiraTime(seconds: number): string {
  if (!seconds || seconds <= 0) return "0m";
  const d = Math.floor(seconds / (8 * 3600));
  const h = Math.floor((seconds % (8 * 3600)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(" ") || "0m";
}

function formatErrorMessage(errMsg: string | undefined | null): string {
  if (!errMsg) return "An unexpected error occurred.";
  
  let cleaned = errMsg;
  // Clean up convex/backend error traces
  if (cleaned.includes("Uncaught Error:")) {
    cleaned = cleaned.split("Uncaught Error:")[1].trim();
  }
  if (cleaned.includes("at handler")) {
    cleaned = cleaned.split("at handler")[0].trim();
  }
  
  // Clean up generic server errors
  if (cleaned.startsWith("[Request ID:")) {
    cleaned = cleaned.replace(/\[Request ID: [^\]]+\]\s*(Server Error)?/i, "").trim();
  }
  
  return cleaned;
}

function isDirectConnEqual(a: any, b: any): boolean {
  const normA = a || null;
  const normB = b || null;
  if (normA === null && normB === null) return true;
  if (normA === null || normB === null) return false;
  return (
    normA.domain === normB.domain &&
    normA.email === normB.email &&
    normA.apiToken === normB.apiToken
  );
}

function isOauthTokensEqual(a: any, b: any): boolean {
  const normA = a || null;
  const normB = b || null;
  if (normA === null && normB === null) return true;
  if (normA === null || normB === null) return false;
  return (
    normA.access_token === normB.access_token &&
    normA.refresh_token === normB.refresh_token
  );
}

function isSelectedSiteEqual(a: any, b: any): boolean {
  const normA = a || null;
  const normB = b || null;
  if (normA === null && normB === null) return true;
  if (normA === null || normB === null) return false;
  return (
    normA.id === normB.id &&
    normA.url === normB.url &&
    normA.name === normB.name
  );
}

export default function App() {
  // Session / Storage persistence states
  // JWT authentication state
  const [jwtToken, setJwtToken] = useState<string | null>(() => {
    return localStorage.getItem("jira_jwt_token");
  });
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authScreenMode, setAuthScreenMode] = useState<"login" | "register">("register");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // App User Details (from DB)
  const [appUser, setAppUser] = useState<any>(null);

  // Onboarding states
  const [onboardDomain, setOnboardDomain] = useState("joblogic.atlassian.net");

  const [onboardToken, setOnboardToken] = useState("");
  const [onboardGeminiKey, setOnboardGeminiKey] = useState("");
  const [onboardOpenaiKey, setOnboardOpenaiKey] = useState("");
  const [onboardModelProvider, setOnboardModelProvider] = useState("google");
  const [onboardModelName, setOnboardModelName] = useState("gemini-3.5-flash");
  const [onboardShowOpenai, setOnboardShowOpenai] = useState(false);
  const [onboardLoading, setOnboardLoading] = useState(false);
  const [onboardError, setOnboardError] = useState<string | null>(null);
  const [onboardShowPassword, setOnboardShowPassword] = useState(false);
  const [onboardShowGemini, setOnboardShowGemini] = useState(false);

  // Session / Storage persistence states
  const [profiles, setProfiles] = useState<UserProfile[]>([]);

  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    return localStorage.getItem("jira_active_profile_id") || "";
  });

  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];

  const [authType, setAuthType] = useState<JIRA_AUTH_TYPE>(activeProfile?.authType || "oauth");
  const [oauthTokens, setOauthTokens] = useState<AtlassianTokens | null>(activeProfile?.oauthTokens || null);
  const [selectedSite, setSelectedSite] = useState<AccessibleSite | null>(activeProfile?.selectedSite || null);
  const [directConn, setDirectConn] = useState<DirectConnection | null>(activeProfile?.directConn || null);
  const [geminiApiKey, setGeminiApiKey] = useState<string | null>(activeProfile?.geminiApiKey || null);
  const [openaiApiKey, setOpenaiApiKey] = useState<string | null>(activeProfile?.openaiApiKey || null);
  const [selectedModelProvider, setSelectedModelProvider] = useState<string>(activeProfile?.selectedModelProvider || "google");
  const [selectedModelName, setSelectedModelName] = useState<string>(activeProfile?.selectedModelName || "gemini-3.5-flash");

  // Profile manager form inputs
  const [profileFormName, setProfileFormName] = useState("");
  const [profileFormAuthType, setProfileFormAuthType] = useState<JIRA_AUTH_TYPE>("basic");
  const [profileFormDomain, setProfileFormDomain] = useState("");
  const [profileFormEmail, setProfileFormEmail] = useState("");
  const [profileFormToken, setProfileFormToken] = useState("");
  const [profileFormGeminiKey, setProfileFormGeminiKey] = useState("");
  const [showAddProfileForm, setShowAddProfileForm] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  // Basic Auth Connection Inputs pre-filled with user configuration
  const [inputDomain, setInputDomain] = useState("joblogic.atlassian.net");
  const [inputEmail, setInputEmail] = useState("arozi@joblogic.com");
  const [inputToken, setInputToken] = useState("");

  // System general state
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<JiraProject | null>(null);
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [availableSites, setAvailableSites] = useState<AccessibleSite[]>([]);
  const [activeTab, setActiveTab] = useState<"board" | "backlog" | "docs" | "profiles">("board");
  const [docsSubTab, setDocsSubTab] = useState<"wiki" | "guide">("wiki");

  // Confluence Space & Document state variables
  const [confluenceSpaces, setConfluenceSpaces] = useState<any[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<any | null>(null);
  const [confluencePages, setConfluencePages] = useState<any[]>([]);
  const [selectedPage, setSelectedPage] = useState<any | null>(null);
  const [isFetchingConfluence, setIsFetchingConfluence] = useState(false);

  // Interaction / Loading state
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
  
  // Create ticket states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSummary, setNewSummary] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState("Task");
  const [newPriority, setNewPriority] = useState("Medium");
  const [newAssigneeId, setNewAssigneeId] = useState("");

  // Post comment state
  const [newCommentText, setNewCommentText] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);

  // Worklog state variables
  const [issueWorklogs, setIssueWorklogs] = useState<any[]>([]);
  const [isLoadingWorklogs, setIsLoadingWorklogs] = useState(false);
  const [newWorklogTime, setNewWorklogTime] = useState("");
  const [newWorklogComment, setNewWorklogComment] = useState("");
  const [isPostingWorklog, setIsPostingWorklog] = useState(false);
  const [issueDetailTab, setIssueDetailTab] = useState<"comments" | "worklogs">("comments");
  const [isEditingEstimates, setIsEditingEstimates] = useState(false);
  const [editOriginalEstimate, setEditOriginalEstimate] = useState("");
  const [editRemainingEstimate, setEditRemainingEstimate] = useState("");
  const [isSavingEstimates, setIsSavingEstimates] = useState(false);

  // Copy-to-clipboard status helpers
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => {
      setCopiedText(null);
    }, 2000);
  };

  // AI Agent Copilot state
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiIsLoading, setAiIsLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<any[]>([]);

  // Chat History / IndexedDB states
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [currentUserDetails, setCurrentUserDetails] = useState<any>(null);

  // Circuit breaker: stop proxy request floods
  const proxyCallCountRef = React.useRef(0);
  const proxyCallWindowTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const proxyCircuitOpenRef = React.useRef(false);
  // Concurrent workspace load guard
  const workspaceLoadingRef = React.useRef(false);

  // Fetch current user's Atlassian profile to filter worklogs and set conversational context
  useEffect(() => {
    if (authType === "demo") {
      setCurrentUserDetails({
        accountId: "user-imran",
        displayName: "Imran Aroz",
        emailAddress: "arozimran18@gmail.com"
      });
      return;
    }

    // Guard: don't load if onboarding is active, or credentials are missing/incomplete
    if (appUser && appUser.hasSetupProfile === false) {
      return;
    }
    if (authType === "basic" && (!directConn || !directConn.apiToken)) {
      return;
    }
    if (authType === "oauth" && (!oauthTokens || !selectedSite)) {
      return;
    }

    const fetchMyself = async () => {
      try {
        const data = await makeProxyCall("myself", "GET");
        if (data && data.accountId) {
          setCurrentUserDetails(data);
        }
      } catch (err) {
        console.error("Failed to fetch myself context details:", err);
      }
    };
    fetchMyself();
  }, [activeProfileId, authType, JSON.stringify(directConn), JSON.stringify(oauthTokens), JSON.stringify(selectedSite), appUser?.hasSetupProfile]);

  // --- BACKEND JWT DATABASE SYNC METHODS ---
  const fetchProfiles = async () => {
    if (!jwtToken) return;
    try {
      const res = await fetch("/api/user/profiles", {
        headers: { Authorization: `Bearer ${jwtToken}` }
      });
      if (!res.ok) throw new Error("Failed to fetch connection profiles");
      const data = await res.json();
      if (data.length === 0) {
        // Create default profiles on backend
        const defaultOwner = await saveProfileBackend({
          name: "Default Profile (Work Link)",
          authType: "basic",
          directConn: {
            domain: "joblogic.atlassian.net",
            email: "arozi@joblogic.com",
            apiToken: ""
          },
          oauthTokens: null,
          selectedSite: null,
          geminiApiKey: null
        });
        setProfiles([defaultOwner]);
        setActiveProfileId(defaultOwner.id);
        localStorage.setItem("jira_active_profile_id", defaultOwner.id);
      } else {
        setProfiles(data);
        const currentValid = data.some((p: any) => p.id === activeProfileId);
        if (!activeProfileId || !currentValid) {
          setActiveProfileId(data[0].id);
          localStorage.setItem("jira_active_profile_id", data[0].id);
        }
      }
    } catch (err) {
      console.error("fetchProfiles fail:", err);
    }
  };

  const saveProfileBackend = async (profile: any) => {
    const res = await fetch("/api/user/profiles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwtToken}`
      },
      body: JSON.stringify(profile)
    });
    if (!res.ok) throw new Error("Failed to save connection profile to server");
    return await res.json();
  };

  const deleteProfileBackend = async (profileId: string) => {
    const res = await fetch(`/api/user/profiles/${profileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${jwtToken}` }
    });
    if (!res.ok) throw new Error("Failed to delete connection profile from server");
    return await res.json();
  };

  const fetchSessions = async () => {
    if (!jwtToken) return;
    try {
      const res = await fetch("/api/user/sessions", {
        headers: { Authorization: `Bearer ${jwtToken}` }
      });
      if (!res.ok) throw new Error("Failed to fetch chat sessions");
      const data = await res.json();
      data.sort((a: any, b: any) => b.updatedAt - a.updatedAt);
      
      if (data.length === 0) {
        const initialId = `session-${Date.now()}`;
        const initialSession = {
          id: initialId,
          name: "New Session",
          messages: [
            {
              id: "welcome",
              role: "agent",
              text: "Hi! I'm Jira Time Log Agent, your smart AI Co-Pilot. I can help you effortlessly log your work and find your assigned tasks. Just tell me what you did today, for example: 'Log 2h to my Epic for the presentation', or simply 'I worked on my last task for 30 mins'. I'll handle all the messy matching and prepare the time logs for you!"
            }
          ],
          activeProfileId: activeProfileId || "default",
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        const saved = await saveSessionBackend(initialSession);
        setSessions([saved]);
        setCurrentSessionId(saved.id);
        setAiMessages(saved.messages);
      } else {
        setSessions(data);
        const currentValid = data.some((s: any) => s.id === currentSessionId);
        if (!currentSessionId || !currentValid) {
          setCurrentSessionId(data[0].id);
          setAiMessages(data[0].messages);
        } else {
          const curSess = data.find((s: any) => s.id === currentSessionId);
          if (curSess) setAiMessages(curSess.messages);
        }
      }
    } catch (err) {
      console.error("fetchSessions fail:", err);
    }
  };

  const saveSessionBackend = async (session: any) => {
    const res = await fetch("/api/user/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwtToken}`
      },
      body: JSON.stringify(session)
    });
    if (!res.ok) throw new Error("Failed to save chat session");
    return await res.json();
  };

  const deleteSessionBackend = async (sessionId: string) => {
    const res = await fetch(`/api/user/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${jwtToken}` }
    });
    if (!res.ok) throw new Error("Failed to delete chat session");
    return await res.json();
  };

  // JWT Token verification on mount / change
  useEffect(() => {
    if (!jwtToken) return;
    const verifyToken = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${jwtToken}` }
        });
        if (res.ok) {
          const details = await res.json();
          setAppUser(details);
        } else {
          handleLogout();
        }
      } catch (err) {
        console.error("Token verification failed:", err);
        handleLogout();
      }
    };
    verifyToken();
  }, [jwtToken]);

  // Load profiles and sessions when token becomes available
  useEffect(() => {
    if (jwtToken) {
      fetchProfiles();
      fetchSessions();
    } else {
      setProfiles([]);
      setSessions([]);
      setCurrentSessionId(null);
      setAiMessages([]);
    }
  }, [jwtToken]);

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem("jira_jwt_token");
    setJwtToken(null);
    setCurrentUserDetails(null);
    setAppUser(null);
    setProfiles([]);
    setSessions([]);
    setCurrentSessionId(null);
    setAiMessages([]);
    setActiveProfileId("");
    setErrorMessage(null);
  };

  // JWT Registration/Login Form submit handler
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError("Email and password are required.");
      return;
    }

    setAuthLoading(true);
    setAuthError(null);

    const url = authScreenMode === "login" ? "/api/auth/login" : "/api/auth/register";

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      localStorage.setItem("jira_jwt_token", data.token);
      setJwtToken(data.token);
      setAppUser(data.user);
      
      setAuthEmail("");
      setAuthPassword("");
    } catch (err: any) {
      setAuthError(formatErrorMessage(err.message));
    } finally {
      setAuthLoading(false);
    }
  };

  // Onboarding Setup Form Submit handler
  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardDomain.trim()) {
      setOnboardError("Jira domain is required.");
      return;
    }
    if (!(appUser?.email || "").trim()) {
      setOnboardError("Jira email is required.");
      return;
    }
    if (!onboardToken.trim()) {
      setOnboardError("Atlassian API Security Token is required.");
      return;
    }
    if (onboardModelProvider === "google" && !onboardGeminiKey.trim()) {
      setOnboardError("Gemini API Key is required for Google Gemini provider.");
      return;
    }
    if (onboardModelProvider === "openai" && !onboardOpenaiKey.trim()) {
      setOnboardError("OpenAI API Key is required for OpenAI provider.");
      return;
    }

    setOnboardLoading(true);
    setOnboardError(null);

    try {
      // 1. Get the current active profile or first profile
      const activePrf = profiles.find(p => p.id === activeProfileId) || profiles[0];
      if (!activePrf) {
        throw new Error("No active profile found to configure.");
      }

      // Update the active profile connection details, gemini key, openai key, provider, and model name
      const updatedProfile = {
        ...activePrf,
        authType: "basic" as JIRA_AUTH_TYPE,
        directConn: {
          domain: onboardDomain.trim(),
          email: (appUser?.email || "").trim(),
          apiToken: onboardToken.trim()
        },
        geminiApiKey: onboardGeminiKey.trim() || null,
        openaiApiKey: onboardOpenaiKey.trim() || null,
        selectedModelProvider: onboardModelProvider,
        selectedModelName: onboardModelName
      };

      // Call saveProfileBackend directly
      await saveProfileBackend(updatedProfile);

      // Trigger the backend API call to mark setup as complete
      const setupRes = await fetch("/api/user/mark-setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwtToken}`
        }
      });
      if (!setupRes.ok) {
        const errData = await setupRes.json();
        throw new Error(errData.error || "Failed to mark profile setup on database.");
      }

      // 2. Mark the local app user state as setup
      setAppUser((prev: any) => prev ? { ...prev, hasSetupProfile: true } : null);

      // 3. Update the context states to match immediately
      setAuthType("basic");
      setDirectConn({
        domain: onboardDomain.trim(),
        email: (appUser?.email || "").trim(),
        apiToken: onboardToken.trim()
      });
      setGeminiApiKey(onboardGeminiKey.trim() || null);
      setOpenaiApiKey(onboardOpenaiKey.trim() || null);
      setSelectedModelProvider(onboardModelProvider);
      setSelectedModelName(onboardModelName);

      // 4. Reload profiles to ensure frontend is fully in sync
      await fetchProfiles();
    } catch (err: any) {
      setOnboardError(formatErrorMessage(err.message));
    } finally {
      setOnboardLoading(false);
    }
  };

  // Synchronize connection state details with the active profile
  useEffect(() => {
    const activePrf = profiles.find(p => p.id === activeProfileId) || profiles[0];
    if (activePrf) {
      if (authType !== activePrf.authType) {
        setAuthType(activePrf.authType);
      }
      if (!isOauthTokensEqual(oauthTokens, activePrf.oauthTokens)) {
        setOauthTokens(activePrf.oauthTokens || null);
      }
      if (!isSelectedSiteEqual(selectedSite, activePrf.selectedSite)) {
        setSelectedSite(activePrf.selectedSite || null);
      }
      if (!isDirectConnEqual(directConn, activePrf.directConn)) {
        setDirectConn(activePrf.directConn || null);
      }
      if ((geminiApiKey || null) !== (activePrf.geminiApiKey || null)) {
        setGeminiApiKey(activePrf.geminiApiKey || null);
      }
      if ((openaiApiKey || null) !== (activePrf.openaiApiKey || null)) {
        setOpenaiApiKey(activePrf.openaiApiKey || null);
      }
      if ((selectedModelProvider || "google") !== (activePrf.selectedModelProvider || "google")) {
        setSelectedModelProvider(activePrf.selectedModelProvider || "google");
      }
      if ((selectedModelName || "gemini-3.5-flash") !== (activePrf.selectedModelName || "gemini-3.5-flash")) {
        setSelectedModelName(activePrf.selectedModelName || "gemini-3.5-flash");
      }
    } else {
      if (authType !== "oauth") setAuthType("oauth");
      if (oauthTokens !== null) setOauthTokens(null);
      if (selectedSite !== null) setSelectedSite(null);
      if (directConn !== null) setDirectConn(null);
      if (geminiApiKey !== null) setGeminiApiKey(null);
      if (openaiApiKey !== null) setOpenaiApiKey(null);
      if (selectedModelProvider !== "google") setSelectedModelProvider("google");
      if (selectedModelName !== "gemini-3.5-flash") setSelectedModelName("gemini-3.5-flash");
    }
  }, [activeProfileId, profiles]);

  // Chat history lifecycle handlers
  const handleCreateNewSession = async () => {
    const newId = `session-${Date.now()}`;
    const newSession = {
      id: newId,
      name: "New Session",
      messages: [
        {
          id: "welcome",
          role: "agent",
          text: "Hi! I'm Jira Time Log Agent, your smart AI Co-Pilot. I can help you effortlessly log your work and find your assigned tasks. Just tell me what you did today, for example: 'Log 2h to my Epic for the presentation', or simply 'I worked on my last task for 30 mins'. I'll handle all the messy matching and prepare the time logs for you!"
        }
      ],
      activeProfileId: activeProfileId || "default",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    try {
      const saved = await saveSessionBackend(newSession);
      setSessions(prev => [saved, ...prev]);
      setCurrentSessionId(newId);
      setAiMessages(saved.messages);
      setIsHistoryOpen(false);
    } catch (err) {
      console.error("Failed to create new session:", err);
    }
  };

  const handleSwitchSession = (sessionId: string) => {
    const sess = sessions.find(s => s.id === sessionId);
    if (sess) {
      setCurrentSessionId(sessionId);
      setAiMessages(sess.messages);
      setIsHistoryOpen(false);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSessionBackend(sessionId);
      const updated = sessions.filter(s => s.id !== sessionId);
      setSessions(updated);

      if (currentSessionId === sessionId) {
        if (updated.length > 0) {
          setCurrentSessionId(updated[0].id);
          setAiMessages(updated[0].messages);
        } else {
          handleCreateNewSession();
        }
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  const runAiAgentQuery = async (userText: string, baseMessages: any[]) => {
    setAiIsLoading(true);
    try {
      let enrichedIssues = [...issues];

      // Dynamically search Jira for issues from the prompt matching keys (e.g. pr-698, MAR-101) or numbers
      if (authType !== "demo") {
        try {
          const keyRegex = /([A-Za-z]+-\d+)/g;
          const numRegex = /\b(\d+)\b/g;
          const candidates = new Set<string>();

          let match;
          while ((match = keyRegex.exec(userText)) !== null) {
            candidates.add(match[1]);
          }
          while ((match = numRegex.exec(userText)) !== null) {
            candidates.add(match[1]);
          }

          if (candidates.size > 0) {
            const fetchedList: any[] = [];
            for (const cand of Array.from(candidates)) {
              if (fetchedList.length >= 8) break; // stay within reasonable API search rate limits
              try {
                let jql = "";
                if (cand.includes("-")) {
                  jql = `key = "${cand.toUpperCase()}" OR summary ~ "${cand}" OR description ~ "${cand}"`;
                } else {
                  jql = `summary ~ "${cand}" OR description ~ "${cand}" OR text ~ "${cand}"`;
                }

                const query = {
                  jql,
                  fields: [
                    "summary",
                    "description",
                    "status",
                    "priority",
                    "assignee",
                    "reporter",
                    "project",
                    "issuetype",
                    "comment",
                    "timetracking",
                    "worklog"
                  ],
                  maxResults: 5
                };

                const resData = await makeProxyCall("search/jql", "POST", query);
                if (resData && Array.isArray(resData.issues)) {
                  fetchedList.push(...resData.issues);
                }
              } catch (err) {
                console.error(`Prompt sub-query failed for ${cand}:`, err);
              }
            }

            if (fetchedList.length > 0) {
              const seen = new Set<string>();
              const merged = [...fetchedList, ...enrichedIssues];
              enrichedIssues = merged.filter(iss => {
                const k = iss.key || iss.id;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
              });
            }
          }
        } catch (searchErr) {
          console.error("Dynamic JQL extraction search failed:", searchErr);
        }
      }

      // Configure/inject fallback worklogs for Demo Mode so the AI can read lastWorklogComment
      const finalIssuesConfig = enrichedIssues.map((issue: any) => {
        let worklogFallback = "";
        
        if (authType === "demo") {
          const storageKey = `jira_demo_worklogs_${issue.key}`;
          const cached = localStorage.getItem(storageKey);
          if (cached) {
            try {
              const logs = JSON.parse(cached);
              if (Array.isArray(logs) && logs.length > 0) {
                const sorted = [...logs].sort((a: any, b: any) => {
                  return new Date(b.created || 0).getTime() - new Date(a.created || 0).getTime();
                });
                const latest = sorted[0];
                if (latest.comment) {
                  const extractText = (cmt: any): string => {
                    if (!cmt) return "";
                    if (typeof cmt === "string") return cmt;
                    if (cmt.text) return cmt.text;
                    if (Array.isArray(cmt.content)) return cmt.content.map(extractText).join(" ");
                    if (cmt.content) return extractText(cmt.content);
                    return "";
                  };
                  worklogFallback = extractText(latest.comment);
                }
              }
            } catch (err) {
              console.error(err);
            }
          }
        }

        return {
          ...issue,
          fields: {
            ...issue.fields,
            worklog_fallback: worklogFallback || issue.fields?.worklog_fallback || ""
          }
        };
      });

      // Extract recent worklogs from enrichedIssues to provide context for "last task"
      let allRecentWorklogs: any[] = [];
      finalIssuesConfig.forEach((iss: any) => {
         const wls = iss.fields?.worklog?.worklogs || [];
         if (Array.isArray(wls)) {
            wls.forEach(wl => {
               // Filter: only keep if it matches current user
               const isAuthor = currentUserDetails ? (
                 wl.author?.accountId === currentUserDetails.accountId ||
                 (wl.author?.emailAddress && wl.author.emailAddress.toLowerCase() === currentUserDetails.emailAddress?.toLowerCase()) ||
                 wl.author?.displayName === currentUserDetails.displayName
               ) : (
                 // fallback if details not yet loaded
                 wl.author?.emailAddress?.toLowerCase().includes("aroz") ||
                 wl.author?.displayName?.toLowerCase().includes("imran")
               );
               if (isAuthor) {
                 allRecentWorklogs.push({ ...wl, issueKey: iss.key, issueSummary: iss.fields?.summary });
               }
            });
         }
         // Include fallback demo worklogs if available
         if (authType === "demo") {
           const cached = localStorage.getItem(`jira_demo_worklogs_${iss.key}`);
           if (cached) {
             try {
               const logs = JSON.parse(cached);
               if (Array.isArray(logs)) {
                 logs.forEach((wl: any) => {
                   const isAuthor = currentUserDetails ? (
                     wl.author?.accountId === currentUserDetails.accountId ||
                     (wl.author?.emailAddress && wl.author.emailAddress.toLowerCase() === currentUserDetails.emailAddress?.toLowerCase()) ||
                     wl.author?.displayName === currentUserDetails.displayName
                   ) : (
                     wl.author?.emailAddress?.toLowerCase().includes("aroz") ||
                     wl.author?.displayName?.toLowerCase().includes("imran")
                   );
                   if (isAuthor) {
                     allRecentWorklogs.push({ ...wl, issueKey: iss.key, issueSummary: iss.fields?.summary });
                   }
                 });
               }
             } catch (e) {}
           }
         }
      });
      allRecentWorklogs.sort((a, b) => new Date(b.created || 0).getTime() - new Date(a.created || 0).getTime());
      const recentWorklogs = allRecentWorklogs.slice(0, 5);

      // Build authConfig for the backend AI so it can execute searches dynamically
      const authConfig: any = { authType };
      if (authType === "oauth" && oauthTokens && selectedSite) {
        authConfig.accessToken = oauthTokens.access_token;
        authConfig.cloudId = selectedSite.id;
      } else if (authType === "basic" && directConn) {
        authConfig.domain = directConn.domain;
        authConfig.email = directConn.email;
        authConfig.apiToken = directConn.apiToken;
      }

      // Send to server proxy agent endpoint with newly matched context issues
      const response = await fetch("/api/gemini/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          prompt: userText,
          issues: finalIssuesConfig,
          apiKey: geminiApiKey,
          openaiApiKey: openaiApiKey,
          provider: selectedModelProvider || "google",
          model: selectedModelName || "gemini-3.5-flash",
          recentWorklogs,
          authConfig,
          userProfile: currentUserDetails || null,
          conversationHistory: baseMessages
            .filter(m => m.role === "user" || m.role === "agent")
            .slice(-10)
            .map((m: any) => ({ role: m.role, text: m.text || "" }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "The AI server encountered an issue. Let's make sure GEMINI_API_KEY is configured.");
      }

      const resData = await response.json();
      
      const agentMessage = {
        id: `agent-${Date.now()}`,
        role: "agent",
        text: resData.explanation,
        proposedLogs: resData.proposedLogs || []
      };

      setAiMessages([...baseMessages, agentMessage]);
    } catch (err: any) {
      const errorMessage = {
        id: `agent-err-${Date.now()}`,
        role: "agent",
        text: `Oops, I ran into an error while analyzing your workflow: ${err.message || "Unknown error."}`,
        isError: true
      };
      setAiMessages([...baseMessages, errorMessage]);
    } finally {
      setAiIsLoading(false);
    }
  };

  const handleQueryAiAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || aiIsLoading) return;

    const userText = aiInput.trim();
    setAiInput("");

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: userText
    };

    const nextMessages = [...aiMessages, userMessage];
    setAiMessages(nextMessages);
    await runAiAgentQuery(userText, nextMessages);
  };

  const handleRegenerateResponse = async () => {
    if (aiIsLoading) return;
    
    let lastUserIndex = -1;
    for (let i = aiMessages.length - 1; i >= 0; i--) {
      if (aiMessages[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }
    
    if (lastUserIndex === -1) return;
    
    const userMessage = aiMessages[lastUserIndex];
    const userText = userMessage.text;
    
    const trimmedMessages = aiMessages.slice(0, lastUserIndex + 1);
    setAiMessages(trimmedMessages);
    await runAiAgentQuery(userText, trimmedMessages);
  };

  const handleLogTimeFromAi = async (messageId: string, logIndex: number, issueKey: string, timeSpent: string, commentStr: string, startedDate?: string) => {
    // Locate the message
    const updatedMessages = aiMessages.map(msg => {
      if (msg.id === messageId && msg.proposedLogs) {
        const logs = [...msg.proposedLogs];
        logs[logIndex] = {
          ...logs[logIndex],
          isLogging: true
        };
        return { ...msg, proposedLogs: logs };
      }
      return msg;
    });
    setAiMessages(updatedMessages);

    // Build ADF structure for the work comment
    const formatCommentADF = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: commentStr || "Logged via Jira AI Agent"
            }
          ]
        }
      ]
    };

    try {
      if (authType === "demo") {
        // Find the target issue in our list
        const targetIssue = issues.find(iss => (iss.key === issueKey || iss.id === issueKey));
        if (!targetIssue) {
          throw new Error(`Could not find issue ${issueKey} in the current project.`);
        }

        const storageKey = `jira_demo_worklogs_${targetIssue.key}`;
        let currentLogs: any[] = [];
        const cached = localStorage.getItem(storageKey);
        if (cached) {
          currentLogs = JSON.parse(cached);
        } else {
          currentLogs = [
            {
              id: `demo-wl1-${targetIssue.key}`,
              author: { displayName: "Aroz Imran", avatarUrls: {} },
              comment: {
                type: "doc",
                version: 1,
                content: [{ type: "paragraph", content: [{ type: "text", text: "Initial Setup work done" }] }]
              },
              created: new Date(Date.now() - 3600000 * 48).toISOString(),
              timeSpent: "2h"
            }
          ];
        }

        const newLog = {
          id: `demo-wl-${Date.now()}`,
          author: { displayName: "System Owner", avatarUrls: {} },
          comment: formatCommentADF,
          created: startedDate || new Date().toISOString(),
          timeSpent: timeSpent
        };

        const updatedLogs = [...currentLogs, newLog];
        localStorage.setItem(storageKey, JSON.stringify(updatedLogs));

        // If this issue is the one currently loaded in the detail view, update state
        if (selectedIssue && selectedIssue.id === targetIssue.id) {
          setIssueWorklogs(updatedLogs);
        }

        // Dynamically update timetracking fields
        const spentSecInput = parseTimeSpentToSeconds(timeSpent);
        const tracking = targetIssue.fields.timetracking || {
          originalEstimate: "8h",
          remainingEstimate: "8h",
          timeSpent: "0m",
          originalEstimateSeconds: 28800,
          remainingEstimateSeconds: 28800,
          timeSpentSeconds: 0
        };

        const updatedSpentSeconds = (tracking.timeSpentSeconds || 0) + spentSecInput;
        const updatedRemainingSeconds = Math.max(0, (tracking.remainingEstimateSeconds || 28800) - spentSecInput);
        const originalSeconds = tracking.originalEstimateSeconds || 28800;

        const updatedIssue = {
          ...targetIssue,
          fields: {
            ...targetIssue.fields,
            timetracking: {
              originalEstimate: formatSecondsToJiraTime(originalSeconds),
              remainingEstimate: formatSecondsToJiraTime(updatedRemainingSeconds),
              timeSpent: formatSecondsToJiraTime(updatedSpentSeconds),
              originalEstimateSeconds: originalSeconds,
              remainingEstimateSeconds: updatedRemainingSeconds,
              timeSpentSeconds: updatedSpentSeconds
            }
          }
        };

        const updatedIssuesList = issues.map(iss => {
          if (iss.id === targetIssue.id) return updatedIssue;
          return iss;
        });

        setIssues(updatedIssuesList);
        localStorage.setItem("jira_demo_issues", JSON.stringify(updatedIssuesList));

        if (selectedIssue && selectedIssue.id === targetIssue.id) {
          setSelectedIssue(updatedIssue);
        }

        // Mark as successfully logged in the UI agent message
        setAiMessages(prev => prev.map(msg => {
          if (msg.id === messageId && msg.proposedLogs) {
            const logs = [...msg.proposedLogs];
            logs[logIndex] = {
              ...logs[logIndex],
              isLogging: false,
              success: true
            };
            return { ...msg, proposedLogs: logs };
          }
          return msg;
        }));
      } else {
        // Real Jira API call
        const payload: any = {
          timeSpent: timeSpent,
          comment: formatCommentADF
        };
        if (startedDate) {
          payload.started = startedDate;
        }

        const result = await makeProxyCall(`issue/${issueKey}/worklog`, "POST", payload);
        if (result) {
          // If selected issue is the log target, fetch fresh worklogs, or refresh issues list
          if (selectedIssue && selectedIssue.key === issueKey) {
            const freshWorklogs = await makeProxyCall(`issue/${selectedIssue.key}/worklog`, "GET");
            if (freshWorklogs && Array.isArray(freshWorklogs.worklogs)) {
              setIssueWorklogs(freshWorklogs.worklogs);
            }
          }

          if (selectedProject) {
            await fetchIssuesForProject(selectedProject.key);
          }

          setAiMessages(prev => prev.map(msg => {
            if (msg.id === messageId && msg.proposedLogs) {
              const logs = [...msg.proposedLogs];
              logs[logIndex] = {
                ...logs[logIndex],
                isLogging: false,
                success: true
              };
              return { ...msg, proposedLogs: logs };
            }
            return msg;
          }));
        } else {
          throw new Error("API call returned empty response");
        }
      }
    } catch (err: any) {
      console.error(err);
      setAiMessages(prev => prev.map(msg => {
        if (msg.id === messageId && msg.proposedLogs) {
          const logs = [...msg.proposedLogs];
          logs[logIndex] = {
            ...logs[logIndex],
            isLogging: false,
            error: err.message || "Failed to log time."
          };
          return { ...msg, proposedLogs: logs };
        }
        return msg;
      }));
    }
  };

  // Filter terms
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [priorityFilter, setPriorityFilter] = useState<string>("All");

  // --- SERVER SYNCHRONIZER EFFECTS ---
  
  // Sync profiles local updates to server with a 1s debounce
  useEffect(() => {
    if (!jwtToken || !activeProfileId || profiles.length === 0) return;
    
    const currentActiveProfile = profiles.find(p => p.id === activeProfileId);
    if (!currentActiveProfile) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        await saveProfileBackend(currentActiveProfile);
      } catch (err) {
        console.error("Auto-save connection profile failed:", err);
      }
    }, 1000);

    return () => clearTimeout(delayDebounceFn);
  }, [authType, JSON.stringify(directConn), JSON.stringify(oauthTokens), JSON.stringify(selectedSite), geminiApiKey, openaiApiKey, selectedModelProvider, selectedModelName, activeProfileId]);

  // Sync active profile connection settings dynamically in memory
  useEffect(() => {
    if (profiles.length === 0 || !activeProfileId) return;
    
    const activePrf = profiles.find(p => p.id === activeProfileId);
    if (!activePrf) return;

    const hasChanges = 
      authType !== activePrf.authType ||
      !isDirectConnEqual(directConn, activePrf.directConn) ||
      !isOauthTokensEqual(oauthTokens, activePrf.oauthTokens) ||
      !isSelectedSiteEqual(selectedSite, activePrf.selectedSite) ||
      (geminiApiKey || null) !== (activePrf.geminiApiKey || null) ||
      (openaiApiKey || null) !== (activePrf.openaiApiKey || null) ||
      (selectedModelProvider || "google") !== (activePrf.selectedModelProvider || "google") ||
      (selectedModelName || "gemini-3.5-flash") !== (activePrf.selectedModelName || "gemini-3.5-flash");

    if (!hasChanges) return;

    setProfiles(prev => prev.map(p => {
      if (p.id === activeProfileId) {
        return {
          ...p,
          authType,
          directConn,
          oauthTokens,
          selectedSite,
          geminiApiKey,
          openaiApiKey,
          selectedModelProvider,
          selectedModelName
        };
      }
      return p;
    }));
  }, [authType, JSON.stringify(directConn), JSON.stringify(oauthTokens), JSON.stringify(selectedSite), geminiApiKey, openaiApiKey, selectedModelProvider, selectedModelName, activeProfileId]);

  // Sync chat sessions updates to server with a 1s debounce
  useEffect(() => {
    if (!jwtToken || !currentSessionId || aiMessages.length === 0) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        const sess = sessions.find(s => s.id === currentSessionId);
        let name = sess?.name || "New Session";
        if (name === "New Session" || !name) {
          const firstUserMsg = aiMessages.find(m => m.role === "user");
          if (firstUserMsg) {
            const txt = firstUserMsg.text || "";
            name = txt.slice(0, 30) + (txt.length > 30 ? "..." : "");
          }
        }

        const updatedSess = {
          id: currentSessionId,
          name,
          messages: aiMessages,
          activeProfileId,
          createdAt: sess?.createdAt || Date.now(),
          updatedAt: Date.now()
        };

        const saved = await saveSessionBackend(updatedSess);
        setSessions(prev => {
          const idx = prev.findIndex(s => s.id === currentSessionId);
          if (idx !== -1) {
            const copy = [...prev];
            copy[idx] = saved;
            return copy;
          } else {
            return [saved, ...prev];
          }
        });
      } catch (err) {
        console.error("Auto-saving chat session failed:", err);
      }
    }, 1000);

    return () => clearTimeout(delayDebounceFn);
  }, [aiMessages, currentSessionId]);

  // Sync basic credentials forms
  useEffect(() => {
    if (directConn) {
      setInputDomain(directConn.domain);
      setInputEmail(directConn.email);
      setInputToken(directConn.apiToken);
    }
  }, [JSON.stringify(directConn)]);

  // --- WORKSPACE LOADER EFFECT ---
  useEffect(() => {
    const timer = setTimeout(() => {
      if (workspaceLoadingRef.current) return;
      loadWorkspace();
    }, 300);
    return () => clearTimeout(timer);
  }, [authType, JSON.stringify(selectedSite), JSON.stringify(directConn), appUser?.hasSetupProfile]);

  // Keep issue detail updated when issues array updates
  useEffect(() => {
    if (selectedIssue) {
      const fresh = issues.find(i => i.id === selectedIssue.id);
      if (fresh) setSelectedIssue(fresh);
    }
  }, [issues]);

  // Set estimate edit fields
  useEffect(() => {
    if (selectedIssue) {
      const tracking = selectedIssue.fields.timetracking || {};
      setEditOriginalEstimate(tracking.originalEstimate || "8h");
      setEditRemainingEstimate(tracking.remainingEstimate || "8h");
    }
  }, [selectedIssue]);

  // Synchronously load issue worklogs when selectedIssue changes
  useEffect(() => {
    if (!selectedIssue) {
      setIssueWorklogs([]);
      return;
    }

    if (authType === "demo") {
      const storageKey = `jira_demo_worklogs_${selectedIssue.key}`;
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        setIssueWorklogs(JSON.parse(cached));
      } else {
        const initialLogs = [
          {
            id: `demo-wl1-${selectedIssue.key}`,
            author: {
              displayName: selectedIssue.fields.assignee?.displayName || "Aroz Imran",
              avatarUrls: selectedIssue.fields.assignee?.avatarUrls || {}
            },
            comment: {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Scoped, researched, and handled setup of Jira issue APIs."
                    }
                  ]
                }
              ]
            },
            created: new Date(Date.now() - 3600000 * 48).toISOString(),
            timeSpent: "3h 45m"
          }
        ];
        setIssueWorklogs(initialLogs);
        localStorage.setItem(storageKey, JSON.stringify(initialLogs));
      }
      return;
    }

    // Real Atlassian fetch
    const fetchRealWorklogs = async () => {
      setIsLoadingWorklogs(true);
      try {
        const data = await makeProxyCall(`issue/${selectedIssue.key}/worklog`, "GET");
        if (data && Array.isArray(data.worklogs)) {
          setIssueWorklogs(data.worklogs);
        } else {
          setIssueWorklogs([]);
        }
      } catch (err) {
        console.error("Failed to fetch real worklogs via proxy:", err);
        setIssueWorklogs([]);
      } finally {
        setIsLoadingWorklogs(false);
      }
    };

    fetchRealWorklogs();
  }, [selectedIssue?.key, authType]);

  const handleAddWorklog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssue || !newWorklogTime.trim()) return;

    setIsPostingWorklog(true);
    const commentStr = newWorklogComment.trim() || "Logged work on ticket.";
    
    // Build ADF payload for Jira Cloud API rest v3
    const formatCommentADF = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: commentStr
            }
          ]
        }
      ]
    };

    const payload = {
      timeSpent: newWorklogTime.trim(),
      comment: formatCommentADF
    };

    try {
      if (authType === "demo") {
        const storageKey = `jira_demo_worklogs_${selectedIssue.key}`;
        const newLog = {
          id: `demo-wl-${Date.now()}`,
          author: {
            displayName: "System Owner",
            avatarUrls: {}
          },
          comment: formatCommentADF,
          created: new Date().toISOString(),
          timeSpent: newWorklogTime.trim()
        };
        const currentLogs = [...issueWorklogs, newLog];
        setIssueWorklogs(currentLogs);
        localStorage.setItem(storageKey, JSON.stringify(currentLogs));

        // Dynamically update local issue timetracking fields
        const spentSecInput = parseTimeSpentToSeconds(newWorklogTime.trim());
        const tracking = selectedIssue.fields.timetracking || {
          originalEstimate: "8h",
          remainingEstimate: "8h",
          timeSpent: "0m",
          originalEstimateSeconds: 28800,
          remainingEstimateSeconds: 28800,
          timeSpentSeconds: 0
        };

        const updatedSpentSeconds = (tracking.timeSpentSeconds || 0) + spentSecInput;
        const updatedRemainingSeconds = Math.max(0, (tracking.remainingEstimateSeconds || 28800) - spentSecInput);
        const originalSeconds = tracking.originalEstimateSeconds || 28800;

        const updatedIssue = {
          ...selectedIssue,
          fields: {
            ...selectedIssue.fields,
            timetracking: {
              originalEstimate: formatSecondsToJiraTime(originalSeconds),
              remainingEstimate: formatSecondsToJiraTime(updatedRemainingSeconds),
              timeSpent: formatSecondsToJiraTime(updatedSpentSeconds),
              originalEstimateSeconds: originalSeconds,
              remainingEstimateSeconds: updatedRemainingSeconds,
              timeSpentSeconds: updatedSpentSeconds
            }
          }
        };

        const updatedIssues = issues.map(iss => {
          if (iss.id === selectedIssue.id) return updatedIssue;
          return iss;
        });

        setSelectedIssue(updatedIssue);
        setIssues(updatedIssues);
        localStorage.setItem("jira_demo_issues", JSON.stringify(updatedIssues));
        
        // Clear inputs
        setNewWorklogTime("");
        setNewWorklogComment("");
      } else {
        // Post real Jira worklog to proxy
        const result = await makeProxyCall(`issue/${selectedIssue.key}/worklog`, "POST", payload);
        if (result) {
          // Re-fetch worklogs to show newly added entry
          const data = await makeProxyCall(`issue/${selectedIssue.key}/worklog`, "GET");
          if (data && Array.isArray(data.worklogs)) {
            setIssueWorklogs(data.worklogs);
          }
          
          // Re-fetch project issues to fetch fresh timetracking fields from Atlassian
          if (selectedProject) {
            await fetchIssuesForProject(selectedProject.key);
          }

          // Clear inputs
          setNewWorklogTime("");
          setNewWorklogComment("");
        }
      }
    } catch (err: any) {
      alert(`Error logging work: ${err.message || "Please check connection & scopes permissions."}`);
    } finally {
      setIsPostingWorklog(false);
    }
  };

  const handleUpdateEstimates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssue) return;

    setIsSavingEstimates(true);
    const origStr = editOriginalEstimate.trim() || "0m";
    const remStr = editRemainingEstimate.trim() || "0m";

    const origSec = parseTimeSpentToSeconds(origStr);
    const remSec = parseTimeSpentToSeconds(remStr);

    try {
      if (authType === "demo") {
        const currentTracking = selectedIssue.fields.timetracking || {
          timeSpent: "0m",
          timeSpentSeconds: 0
        };

        const updatedTracking = {
          originalEstimate: origStr,
          remainingEstimate: remStr,
          timeSpent: currentTracking.timeSpent || "0m",
          originalEstimateSeconds: origSec,
          remainingEstimateSeconds: remSec,
          timeSpentSeconds: currentTracking.timeSpentSeconds || 0
        };

        const updatedIssue = {
          ...selectedIssue,
          fields: {
            ...selectedIssue.fields,
            timetracking: updatedTracking
          }
        };

        setSelectedIssue(updatedIssue);

        const updatedIssues = issues.map(iss => {
          if (iss.id === selectedIssue.id) return updatedIssue;
          return iss;
        });

        setIssues(updatedIssues);
        localStorage.setItem("jira_demo_issues", JSON.stringify(updatedIssues));
        setIsEditingEstimates(false);
      } else {
        // Real Jira API client edit call (updates the timetracking fields)
        const payload = {
          update: {
            timetracking: [
              {
                edit: {
                  originalEstimate: origStr,
                  remainingEstimate: remStr
                }
              }
            ]
          }
        };

        const result = await makeProxyCall(`issue/${selectedIssue.key}`, "PUT", payload);
        if (result) {
          // Re-fetch project issues to get fresh list & updated selectedIssue automatically
          if (selectedProject) {
            await fetchIssuesForProject(selectedProject.key);
          }
          setIsEditingEstimates(false);
        }
      }
    } catch (err: any) {
      alert(`Error updating estimates: ${err.message || "Please check Connection settings and scopes."}`);
    } finally {
      setIsSavingEstimates(false);
    }
  };

  const loadWorkspace = async () => {
    if (workspaceLoadingRef.current) return;
    workspaceLoadingRef.current = true;
    setErrorMessage(null);
    try {
      if (authType === "demo") {
        setProjects(DEMO_PROJECTS);
        setSelectedProject(DEMO_PROJECTS[0]);
        const cachedDemo = localStorage.getItem("jira_demo_issues");
        const isStale = !cachedDemo || cachedDemo.includes("SLE-") || cachedDemo.includes("PWP-") || cachedDemo.includes("MAR-");
        if (cachedDemo && !isStale) {
          setIssues(JSON.parse(cachedDemo));
        } else {
          setIssues(INITIAL_DEMO_ISSUES);
          localStorage.setItem("jira_demo_issues", JSON.stringify(INITIAL_DEMO_ISSUES));
        }
        return;
      }
      if (appUser && appUser.hasSetupProfile === false) return;
      if (authType === "basic" && (!directConn || !directConn.apiToken)) return;
      if (authType === "oauth" && (!oauthTokens || !selectedSite)) {
        if (!selectedSite && oauthTokens) fetchAvailableSites(oauthTokens.access_token);
        return;
      }
      await fetchProjects();
    } finally {
      workspaceLoadingRef.current = false;
    }
  };

  // Real API Calls helper using proxy
  const makeProxyCall = async (endpoint: string, method: string = "GET", body?: any, query?: any) => {
    // Circuit breaker: trip if more than 20 proxy calls fire within a 5-second window
    if (proxyCircuitOpenRef.current) {
      throw new Error("Too many requests detected — a render loop was stopped. Please refresh the page.");
    }
    proxyCallCountRef.current += 1;
    if (proxyCallWindowTimerRef.current === null) {
      proxyCallWindowTimerRef.current = setTimeout(() => {
        proxyCallCountRef.current = 0;
        proxyCallWindowTimerRef.current = null;
        proxyCircuitOpenRef.current = false;
      }, 5000);
    }
    if (proxyCallCountRef.current > 20) {
      proxyCircuitOpenRef.current = true;
      setErrorMessage("Too many requests detected — a render loop was stopped. Refresh the page to continue.");
      throw new Error("Circuit breaker tripped: too many proxy requests.");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-jira-auth-type": authType,
    };

    if (jwtToken) {
      headers["Authorization"] = `Bearer ${jwtToken}`;
    }

    if (authType === "oauth") {
      if (!oauthTokens || !selectedSite) throw new Error("OAuth site connection details missing");
      headers["x-jira-access-token"] = oauthTokens.access_token;
      headers["x-jira-cloud-id"] = selectedSite.id;
    } else if (authType === "basic") {
      if (!directConn) throw new Error("Direct connect API details missing");
      headers["x-jira-domain"] = directConn.domain;
      headers["x-jira-email"] = directConn.email;
      headers["x-jira-api-token"] = directConn.apiToken;
    }

    const payload = {
      endpoint,
      method,
      body,
      query
    };

    const res = await fetch("/api/jira/proxy", {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (res.status === 401 && authType === "oauth" && oauthTokens?.refresh_token) {
      // Attempt token refresh
      const refreshed = await attemptTokenRefresh();
      if (refreshed) {
        // Retry original request with fresh tokens
        headers["x-jira-access-token"] = refreshed.access_token;
        const retryRes = await fetch("/api/jira/proxy", {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        });
        if (!retryRes.ok) {
          throw new Error(`Jira proxy error (retry): ${retryRes.statusText}`);
        }
        return await retryRes.json();
      }
    }

    const data = await res.json();
    if (!res.ok) {
      let extMsg = "";
      if (data.errorMessages && Array.isArray(data.errorMessages) && data.errorMessages.length > 0) {
        extMsg = data.errorMessages.join(". ");
      } else if (data.errors && typeof data.errors === "object") {
        extMsg = Object.entries(data.errors).map(([k, v]) => `${k}: ${v}`).join(", ");
      }
      const errMsg = extMsg || data.message || data.error || `Jira API failed: status ${res.status}`;
      throw new Error(errMsg);
    }
    return data;
  };

  const attemptTokenRefresh = async (): Promise<AtlassianTokens | null> => {
    if (!oauthTokens?.refresh_token) return null;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (jwtToken) {
        headers["Authorization"] = `Bearer ${jwtToken}`;
      }
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers,
        body: JSON.stringify({ refresh_token: oauthTokens.refresh_token })
      });
      if (res.ok) {
        const fresh = await res.json();
        setOauthTokens(fresh);
        return fresh;
      }
    } catch (e) {
      console.error("Token refresh fail:", e);
    }
    return null;
  };

  // Fetch Atlassian cloud instances
  const fetchAvailableSites = async (token: string) => {
    setIsLoading(true);
    try {
      const headers: Record<string, string> = {
        "x-atlassian-access-token": token
      };
      if (jwtToken) {
        headers["Authorization"] = `Bearer ${jwtToken}`;
      }
      const res = await fetch("/api/jira/oauth/sites", {
        headers
      });
      if (!res.ok) throw new Error("Failed to retrieve accessible instances from Atlassian");
      const sites = await res.json();
      setAvailableSites(sites);
    } catch (err: any) {
      setErrorMessage(err.message || "Site fetching failed.");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch real projects
  const fetchProjects = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await makeProxyCall("project", "GET");
      if (Array.isArray(data)) {
        const filteredProjects = data.filter((p: any) => p.key === "PR" || (p.name && p.name.toLowerCase().includes("product")));
        setProjects(filteredProjects);
        if (filteredProjects.length > 0) {
          // Select project keeping key persistent or fallback
          setSelectedProject(filteredProjects[0]);
        }
      } else {
        setProjects([]);
      }
    } catch (err: any) {
      console.error("Fetch projects failed:", err);
      setErrorMessage(`Error Loading Workspace: ${err.message}. Double-check your API token / scopes configurations.`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- CONFLUENCE INTEGRATION CORE METHODS ---
  const fetchConfluenceSpaces = async () => {
    if (authType === "demo") {
      const demoSpaces = [
        { id: "s1", key: "DEV", name: "Developer Wiki", type: "global", description: "Technical documentation space" },
        { id: "s2", key: "PRODUCT", name: "Product Requirements", type: "global", description: "PRDs and specs space" },
        { id: "s3", key: "MAR", name: "Marketing Space", type: "global", description: "Marketing campaigns and visual assets wiki" }
      ];
      setConfluenceSpaces(demoSpaces);
      if (!selectedSpace) setSelectedSpace(demoSpaces[0]);
      return;
    }

    // Guard: check credentials and onboarding profile completeness
    if (appUser && appUser.hasSetupProfile === false) return;
    if (authType === "basic" && (!directConn || !directConn.apiToken)) return;
    if (authType === "oauth" && (!oauthTokens || !selectedSite)) return;

    setIsFetchingConfluence(true);
    setErrorMessage(null);
    try {
      let data;
      try {
        data = await makeProxyCall("wiki/api/v2/spaces", "GET", undefined, { limit: 50 });
      } catch (err: any) {
        console.warn("Confluence API v2 spaces failed, trying rest/api/space fallback...", err);
        data = await makeProxyCall("wiki/rest/api/space", "GET", undefined, { limit: 50 });
      }

      if (data && Array.isArray(data.results)) {
        setConfluenceSpaces(data.results);
        if (data.results.length > 0) {
          setSelectedSpace(prev => prev || data.results[0]);
        }
      } else {
        setConfluenceSpaces([]);
      }
    } catch (err: any) {
      console.error("Confluence fetch spaces error:", err);
      setConfluenceSpaces([]);
      setErrorMessage(`Could not load Confluence Spaces: ${err.message}. Please verify Confluence permission or API keys setup.`);
    } finally {
      setIsFetchingConfluence(false);
    }
  };

  const fetchPagesForSpace = async (spaceKey: string) => {
    if (authType === "demo") {
      let demoPages: any[] = [];
      if (spaceKey === "DEV") {
        demoPages = [
          {
            id: "p1",
            title: "System Architecture & Flow",
            body: {
              view: {
                value: `<h3>System Architecture</h3><p>This space details our current tech stack and cloud deployment workflows.</p>
                        <h4>Tech Details</h4>
                        <ul>
                          <li><b>Frontend:</b> Vite + React 18, Tailwind CSS, Lucide icons, Framer Motion</li>
                          <li><b>Backend:</b> Node.js Express server acting as a cors-secure proxy</li>
                          <li><b>Authentication:</b> Supports both local sandbox & full OAuth / Basic tokens secure storage</li>
                        </ul>`
              }
            },
            history: { createdDate: "2026-06-15T10:00:00Z" }
          },
          {
            id: "p2",
            title: "Security & API Configuration",
            body: {
              view: {
                value: `<h3>Security Hardening Documentation</h3><p>Important instructions for protecting Atlassian Secrets and API keys.</p>
                        <p>Credentials like API tokens should never be hardcoded into frontend client files. Direct proxies should be configured via backend route files.</p>`
              }
            },
            history: { createdDate: "2026-06-16T11:45:00Z" }
          }
        ];
      } else if (spaceKey === "PRODUCT") {
        demoPages = [
          {
            id: "p3",
            title: "Product Requirement Document (PRD) v2",
            body: {
              view: {
                value: `<h3>PRD - Smart Hub</h3><p>Requirements for implementing Confluence Spaces navigation directly in the Jira Board dashboard.</p>
                        <h4>Deliverables</h4>
                        <ol>
                          <li>Support wiki/ restful endpoints routing dynamically in server proxy.</li>
                          <li>Visualize list of spaces & sub-pages cleanly with searchable listings.</li>
                          <li>Allow inline editing and creation of page summaries.</li>
                        </ol>`
              }
            },
            history: { createdDate: "2026-06-17T02:00:00Z" }
          }
        ];
      } else {
        demoPages = [
          {
            id: "p4",
            title: "Campaign Objectives FY26",
            body: {
              view: {
                value: `<h3>Marketing Roadmap</h3><p>List of initiatives to boost awareness of our brand new developer dashboard tools.</p>`
              }
            },
            history: { createdDate: "2026-06-14T09:00:00Z" }
          }
        ];
      }
      setConfluencePages(demoPages);
      if (demoPages.length > 0) {
        setSelectedPage(demoPages[0]);
      } else {
        setSelectedPage(null);
      }
      return;
    }

    // Guard: check credentials and onboarding profile completeness
    if (appUser && appUser.hasSetupProfile === false) return;
    if (authType === "basic" && (!directConn || !directConn.apiToken)) return;
    if (authType === "oauth" && (!oauthTokens || !selectedSite)) return;

    setIsFetchingConfluence(true);
    setErrorMessage(null);
    try {
      const query = {
        spaceKey: spaceKey,
        expand: "history,body.view,space",
        limit: 50
      };
      const data = await makeProxyCall("wiki/rest/api/content", "GET", undefined, query);
      if (data && Array.isArray(data.results)) {
        setConfluencePages(data.results);
        if (data.results.length > 0) {
          setSelectedPage(data.results[0]);
        } else {
          setSelectedPage(null);
        }
      } else {
        setConfluencePages([]);
        setSelectedPage(null);
      }
    } catch (err: any) {
      console.warn("Confluence fetch v1 pages failed, trying api/v2/pages...", err);
      try {
        const query = { limit: 50 };
        const data = await makeProxyCall("wiki/api/v2/pages", "GET", undefined, query);
        if (data && Array.isArray(data.results)) {
          const filtered = data.results.filter((p: any) => p.spaceKey === spaceKey || !spaceKey);
          setConfluencePages(filtered);
          if (filtered.length > 0) {
            setSelectedPage(filtered[0]);
          } else {
            setSelectedPage(null);
          }
        } else {
          setConfluencePages([]);
          setSelectedPage(null);
        }
      } catch (innerErr: any) {
        setConfluencePages([]);
        setSelectedPage(null);
        setErrorMessage(`Could not load pages for Space ${spaceKey}: ${innerErr.message || err.message}`);
      }
    } finally {
      setIsFetchingConfluence(false);
    }
  };

  // Load Spaces when entering Confluence view
  useEffect(() => {
    // Guard: check credentials and onboarding profile completeness
    if (appUser && appUser.hasSetupProfile === false) return;
    if (authType === "basic" && (!directConn || !directConn.apiToken)) return;
    if (authType === "oauth" && (!oauthTokens || !selectedSite)) return;

    if (activeTab === "docs" && docsSubTab === "wiki") {
      fetchConfluenceSpaces();
    }
  }, [activeTab, docsSubTab, authType, JSON.stringify(selectedSite), JSON.stringify(directConn), appUser?.hasSetupProfile]);

  // Load pages when selected space updates
  useEffect(() => {
    if (activeTab === "docs" && docsSubTab === "wiki" && selectedSpace) {
      const key = selectedSpace.key || selectedSpace.id;
      if (key) {
        fetchPagesForSpace(key);
      }
    }
  }, [selectedSpace, activeTab, docsSubTab]);

  // Fetch issues for selected project
  useEffect(() => {
    if (selectedProject) {
      fetchIssuesForProject(selectedProject.key);
    } else {
      setIssues([]);
    }
  }, [selectedProject]);

  const fetchIssuesForProject = async (projectKey: string) => {
    if (authType === "demo") return; // Demo issues are handled via direct state/localStorage

    // Guard: check credentials and onboarding profile completeness
    if (appUser && appUser.hasSetupProfile === false) return;
    if (authType === "basic" && (!directConn || !directConn.apiToken)) return;
    if (authType === "oauth" && (!oauthTokens || !selectedSite)) return;

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const query = {
        jql: `project = "${projectKey}" ORDER BY updated DESC`,
        fields: [
          "summary",
          "description",
          "status",
          "priority",
          "assignee",
          "reporter",
          "project",
          "issuetype",
          "comment",
          "timetracking",
          "worklog"
        ],
        maxResults: 50
      };
      const data = await makeProxyCall("search/jql", "POST", query);
      if (data && Array.isArray(data.issues)) {
        setIssues(data.issues);
      } else {
        setIssues([]);
      }
    } catch (err: any) {
      console.error("Fetch issues error:", err);
      // Fallback graceful
      setIssues([]);
      setErrorMessage(`Could not fetch issues for ${projectKey}: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- CONNECT HANDLERS ---
  const handleOAuthConnectInit = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/auth/url", {
        headers: {
          Authorization: `Bearer ${jwtToken}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initiate OAuth.");

      // Open OAuth provider in center popup window
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const authWindow = window.open(
        data.url,
        "AtlassianJiraOAuth",
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
      );

      if (!authWindow) {
        alert("Popup window was blocked by your browser. Please allow popups for this dashboard to sync Jira OAuth.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to fetch OAuth URL.");
    } finally {
      setIsLoading(false);
    }
  };

  // Listen to popup postMessage callbacks
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      // Allow preview domains and local host addresses
      if (!origin.endsWith(".run.app") && !origin.includes("localhost")) {
        return;
      }

      if (event.data?.type === "OAUTH_AUTH_SUCCESS" && event.data?.tokens) {
        const tokens = event.data.tokens;
        setOauthTokens(tokens);
        setAuthType("oauth");
        fetchAvailableSites(tokens.access_token);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleSwitchProfile = (profileId: string) => {
    const targetPrf = profiles.find(p => p.id === profileId);
    if (!targetPrf) return;
    
    setActiveProfileId(profileId);
    localStorage.setItem("jira_active_profile_id", profileId);
    
    // Switch connection settings
    setAuthType(targetPrf.authType);
    setDirectConn(targetPrf.directConn);
    setOauthTokens(targetPrf.oauthTokens);
    setSelectedSite(targetPrf.selectedSite);
    
    // Reset projects and issues
    setSelectedIssue(null);
    setSelectedProject(null);
    setProjects([]);
    setIssues([]);
    setErrorMessage(null);
    
    // Force redirect to board view of new workspace context
    setActiveTab("board");
  };

  const handleSelectSite = (site: AccessibleSite) => {
    setSelectedSite(site);
    setAvailableSites([]); // Clear choosing list
  };

  const handleDirectConnectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputDomain || !inputEmail || !inputToken) {
      setErrorMessage("Please fill out all direct credentials attributes.");
      return;
    }
    
    const details: DirectConnection = {
      domain: inputDomain.trim(),
      email: inputEmail.trim(),
      apiToken: inputToken.trim()
    };

    setDirectConn(details);
    setAuthType("basic");
  };

  const handleDisconnect = () => {
    setAuthType("demo");
    setOauthTokens(null);
    setSelectedSite(null);
    setDirectConn(null);
    setProjects(DEMO_PROJECTS);
    setSelectedProject(DEMO_PROJECTS[0]);
    // Reset issues to demo state
    const cached = localStorage.getItem("jira_demo_issues");
    setIssues(cached ? JSON.parse(cached) : INITIAL_DEMO_ISSUES);
    setSelectedIssue(null);
  };

  // --- INTERRUPT INTERACTIVE TASK LOGICS ---
  
  // Create ticket
  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSummary.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    const projectKey = selectedProject?.key || "PR";

    if (authType === "demo") {
      // Create local sandbox issue
      const demoAssignee = DEMO_USERS.find(user => user.accountId === newAssigneeId) || null;
      const highestId = issues.reduce((max, i) => Math.max(max, parseInt(i.id.split("-")[1] || "100")), 100);
      const newKeyIndex = highestId + 1;
      
      const newDemoIssue: JiraIssue = {
        id: `issue-${newKeyIndex}`,
        key: `${projectKey}-${newKeyIndex}`,
        fields: {
          summary: newSummary.trim(),
          description: newDesc.trim() || "No description provided.",
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          status: {
            id: "status-backlog",
            name: "Backlog",
            statusCategory: { id: 0, key: "new", name: "Backlog" }
          },
          priority: { id: `prio-${newPriority.toLowerCase()}`, name: newPriority },
          assignee: demoAssignee,
          reporter: DEMO_USERS[0], // Current User
          project: {
            id: selectedProject?.id || "proj-sle",
            key: projectKey,
            name: selectedProject?.name || "Space Launch Engine"
          },
          issuetype: { id: `type-${newType.toLowerCase()}`, name: newType },
          comment: { comments: [] }
        }
      };

      const revised = [newDemoIssue, ...issues];
      setIssues(revised);
      localStorage.setItem("jira_demo_issues", JSON.stringify(revised));
      
      // Reset creation state
      setNewSummary("");
      setNewDesc("");
      setShowCreateModal(false);
      setIsLoading(false);
      return;
    }

    // Real API Call Task Creation
    try {
      const adfDesc = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: newDesc.trim() || "Created via Jira Dashboard."
              }
            ]
          }
        ]
      };

      const payload: any = {
        fields: {
          project: { key: projectKey },
          summary: newSummary.trim(),
          description: adfDesc,
          issuetype: { name: newType },
          priority: { name: newPriority }
        }
      };

      if (newAssigneeId) {
        payload.fields.assignee = { accountId: newAssigneeId };
      }

      const created = await makeProxyCall("issue", "POST", payload);
      if (created && created.key) {
        // Success, refresh issues
        await fetchIssuesForProject(projectKey);
        setShowCreateModal(false);
        setNewSummary("");
        setNewDesc("");
      }
    } catch (err: any) {
      setErrorMessage(`Failed to create issue: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Drag and Drop implementation
  const handleDragStart = (e: React.DragEvent, issueKey: string) => {
    e.dataTransfer.setData("text/plain", issueKey);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStatusName: string) => {
    e.preventDefault();
    const issueKey = e.dataTransfer.getData("text/plain");
    if (!issueKey) return;

    await transitionIssueStatus(issueKey, targetStatusName);
  };

  const transitionIssueStatus = async (issueKey: string, targetStatusName: string) => {
    setIsLoading(true);
    setErrorMessage(null);

    if (authType === "demo") {
      const updatedIssues = issues.map((issue) => {
        if (issue.key === issueKey) {
          // Change column fields
          const statusId = `status-${targetStatusName.toLowerCase().replace(/\s+/g, "")}`;
          let catKey: "new" | "indeterminate" | "done" = "new";
          if (["In Progress", "In Review", "Under Review"].includes(targetStatusName)) catKey = "indeterminate";
          if (["Done", "Resolved", "Closed"].includes(targetStatusName)) catKey = "done";

          return {
            ...issue,
            fields: {
              ...issue.fields,
              updated: new Date().toISOString(),
              status: {
                id: statusId,
                name: targetStatusName,
                statusCategory: { id: 9, key: catKey, name: targetStatusName }
              }
            }
          };
        }
        return issue;
      });

      setIssues(updatedIssues);
      localStorage.setItem("jira_demo_issues", JSON.stringify(updatedIssues));
      setIsLoading(false);
      return;
    }

    // Real API Call status transition
    try {
      // 1. Fetch available transitions for this issue key
      const transitionsData = await makeProxyCall(`issue/${issueKey}/transitions`, "GET");
      
      if (transitionsData && Array.isArray(transitionsData.transitions)) {
        // 2. Find the transition ID corresponding to target status category name
        const match = transitionsData.transitions.find((t: any) => 
          t.name.toLowerCase() === targetStatusName.toLowerCase() || 
          t.to?.name.toLowerCase() === targetStatusName.toLowerCase()
        );

        if (match) {
          // 3. Post selected transition ID to execute
          await makeProxyCall(`issue/${issueKey}/transitions`, "POST", {
            transition: { id: match.id }
          });
          
          // 4. Update parent list
          if (selectedProject) {
            await fetchIssuesForProject(selectedProject.key);
          }
        } else {
          // List valid options to make the user's life easier
          const validNames = transitionsData.transitions.map((t: any) => t.name).join(", ");
          setErrorMessage(`Could not align direct status. This issue can step to: [${validNames}]`);
        }
      }
    } catch (err: any) {
      setErrorMessage(`Transition failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Post comment list update
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssue || !newCommentText.trim()) return;

    setIsPostingComment(true);
    setErrorMessage(null);

    if (authType === "demo") {
      const generatedComment = {
        id: `comm-user-${Date.now()}`,
        author: DEMO_USERS[0], // Imran Aroz
        body: newCommentText.trim(),
        created: new Date().toISOString()
      };

      const updated = issues.map(issue => {
        if (issue.id === selectedIssue.id) {
          const originalComments = issue.fields.comment?.comments || [];
          return {
            ...issue,
            fields: {
              ...issue.fields,
              comment: {
                comments: [...originalComments, generatedComment]
              }
            }
          };
        }
        return issue;
      });

      setIssues(updated);
      localStorage.setItem("jira_demo_issues", JSON.stringify(updated));
      setNewCommentText("");
      setIsPostingComment(false);
      return;
    }

    try {
      const commentPayload = {
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: newCommentText.trim()
                }
              ]
            }
          ]
        }
      };

      await makeProxyCall(`issue/${selectedIssue.key}/comment`, "POST", commentPayload);
      
      // Refresh current project to populate comments state
      if (selectedProject) {
        await fetchIssuesForProject(selectedProject.key);
      }
      setNewCommentText("");
    } catch (err: any) {
      setErrorMessage(`Failed to add comment: ${err.message}`);
    } finally {
      setIsPostingComment(false);
    }
  };

  // --- FILTER & SEARCH APPLICATORS ---
  const filteredIssues = issues.filter(issue => {
    // 1. Search Query filter (matches summary, key, assignee, or description)
    const query = searchQuery.toLowerCase();
    const matchesQuery = 
      query === "" ||
      issue.key.toLowerCase().includes(query) ||
      (issue.fields.summary || "").toLowerCase().includes(query) ||
      (extractJiraText(issue.fields.description) || "").toLowerCase().includes(query) ||
      (issue.fields.assignee?.displayName || "").toLowerCase().includes(query);

    // 2. Type filter
    const matchesType = typeFilter === "All" || issue.fields.issuetype?.name === typeFilter;

    // 3. Priority filter
    const matchesPriority = priorityFilter === "All" || issue.fields.priority?.name === priorityFilter;

    return matchesQuery && matchesType && matchesPriority;
  });

  // Grouped Column Status collections
  const boardStatuses = ["Backlog", "To Do", "In Progress", "Done"];

  const getPriorityColor = (prioName: string) => {
    switch (prioName?.toLowerCase()) {
      case "highest": return "text-red-500 bg-red-950/40 border-red-900/60";
      case "high": return "text-orange-400 bg-orange-950/30 border-orange-900/40";
      case "medium": return "text-amber-400 bg-amber-950/20 border-amber-900/30";
      case "low": return "text-blue-400 bg-blue-950/20 border-blue-900/30";
      case "lowest": return "text-slate-400 bg-slate-900/40 border-slate-800";
      default: return "text-slate-400 bg-slate-800/40 border-slate-700/50";
    }
  };

  const getTypeIconColor = (typeName: string) => {
    switch (typeName?.toLowerCase()) {
      case "bug": return "bg-rose-500/20 text-rose-400 border-rose-500/30";
      case "task": return "bg-indigo-500/20 text-indigo-400 border-indigo-500/30";
      case "story": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "epic": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      default: return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  if (!jwtToken) {
    return (
      <div id="auth-root" className="min-h-screen w-full flex items-center justify-center bg-[#09090b] font-sans text-white p-6 relative overflow-hidden select-none">
        {/* Animated Background Mesh */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.15)_0%,transparent_60%)] blur-3xl animate-[pulse_8s_ease-in-out_infinite]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.15)_0%,transparent_60%)] blur-3xl animate-[pulse_10s_ease-in-out_infinite_reverse]" />
          <div className="absolute inset-0 bg-white/5 opacity-20 mix-blend-overlay"></div>
        </div>

        {/* Auth Glass Card Container */}
        <div className="relative z-10 w-full max-w-md bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] p-10 space-y-8 transform transition-all duration-500 hover:border-white/20">
          {/* Header Branding */}
          <div className="text-center space-y-3">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 ring-1 ring-white/20">
              <Activity className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
              {authScreenMode === "login" ? "Welcome back" : "Create Account"}
            </h2>
            <p className="text-sm text-zinc-400 font-medium">
              {authScreenMode === "login"
                ? "Sign in to access your multi-tenant Jira logs"
                : "Register a secure workspace to log work effortlessly"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleAuthSubmit} className="space-y-5">
            {authError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 font-medium flex items-start gap-3 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1.5" />
                <span>{authError}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">Email Address</label>
              <div className="relative group">
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@company.com"
                  disabled={authLoading}
                  required
                  className="w-full bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-5 py-3.5 text-sm placeholder-zinc-600 outline-none transition-all text-white group-hover:border-white/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">Password</label>
              <div className="relative group">
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={authLoading}
                  required
                  className="w-full bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-5 py-3.5 text-sm placeholder-zinc-600 outline-none transition-all text-white group-hover:border-white/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3.5 mt-2 bg-white text-black hover:bg-zinc-200 disabled:bg-white/20 disabled:text-white/40 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-[0.98]"
            >
              {authLoading ? (
                <>
                  <RotateCw className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>{authScreenMode === "login" ? "Sign In to Dashboard" : "Create Workspace"}</span>
              )}
            </button>
          </form>

          {/* Form Switch Mode */}
          <div className="text-center pt-6 border-t border-white/10">
            <button
              onClick={() => {
                setAuthScreenMode(authScreenMode === "login" ? "register" : "login");
                setAuthError(null);
              }}
              type="button"
              className="text-sm text-zinc-400 hover:text-white font-medium transition-colors"
            >
              {authScreenMode === "login"
                ? "New here? Let's get you registered."
                : "Already have an account? Sign in."}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (jwtToken && appUser && appUser.hasSetupProfile === false) {
    return (
      <div id="setup-root" className="min-h-screen w-full flex items-center justify-center bg-[#09090b] font-sans text-white p-6 relative overflow-hidden select-none">
        {/* Animated Background Mesh */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-20%] right-[-10%] w-[70vw] h-[70vw] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.1)_0%,transparent_60%)] blur-3xl animate-[pulse_10s_ease-in-out_infinite]" />
          <div className="absolute bottom-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.1)_0%,transparent_60%)] blur-3xl animate-[pulse_12s_ease-in-out_infinite_reverse]" />
          <div className="absolute inset-0 bg-white/5 opacity-20 mix-blend-overlay"></div>
        </div>

        {/* Setup Glass Card Container */}
        <div className="relative z-10 w-full max-w-3xl bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] p-8 md:p-12 space-y-8 max-h-[95vh] overflow-y-auto custom-scrollbar">
          <div className="text-center space-y-3">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 ring-1 ring-white/20">
              <Activity className="w-7 h-7 text-white animate-pulse" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
              Configure Your Agent
            </h2>
            <p className="text-sm text-zinc-400 font-medium max-w-lg mx-auto">
              Welcome to Jira Time Log Agent! Let's get you connected to your Jira instance and set up your preferred AI models to unlock advanced collaborative workflows.
            </p>
          </div>

          <form onSubmit={handleOnboardingSubmit} className="space-y-8">
            {onboardError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 font-medium flex items-start gap-3 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1.5" />
                <span>{onboardError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column: AI Models */}
              <div className="space-y-5 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                <div className="border-b border-white/10 pb-3">
                  <h3 className="text-lg font-semibold text-white">AI Capabilities</h3>
                  <p className="text-xs text-zinc-500">Select and configure your model</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">AI Provider</label>
                    <div className="relative group">
                      <select
                        value={onboardModelProvider}
                        onChange={(e) => {
                          const prov = e.target.value;
                          setOnboardModelProvider(prov);
                          setOnboardModelName(prov === "google" ? "gemini-3.5-flash" : "gpt-5.5");
                        }}
                        className="w-full appearance-none bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3.5 text-sm outline-none transition-all text-white hover:border-white/20 cursor-pointer"
                      >
                        <option value="google">Google Gemini</option>
                        <option value="openai">OpenAI</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">Model Version</label>
                    <div className="relative group">
                      <select
                        value={onboardModelName}
                        onChange={(e) => setOnboardModelName(e.target.value)}
                        className="w-full appearance-none bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3.5 text-sm outline-none transition-all text-white hover:border-white/20 cursor-pointer"
                      >
                        {onboardModelProvider === "google" ? (
                          <>
                            <option value="gemini-3.5-flash">Gemini 3.5 Flash (Fast)</option>
                            <option value="gemini-3.5-pro">Gemini 3.5 Pro (Flagship)</option>
                            <option value="gemini-3.1-pro">Gemini 3.1 Pro (Legacy)</option>
                          </>
                        ) : (
                          <>
                            <option value="gpt-5.5">GPT-5.5 (Flagship)</option>
                            <option value="gpt-5.2">GPT-5.2 (Legacy 2026)</option>
                            <option value="gpt-4.5">GPT-4.5 (Legacy)</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  {onboardModelProvider === "google" && (
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between items-end">
                        <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">Gemini API Key</label>
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] text-zinc-500 hover:text-white transition-colors underline">Get Key</a>
                      </div>
                      <div className="relative group">
                        <input
                          type={onboardShowGemini ? "text" : "password"}
                          value={onboardGeminiKey}
                          onChange={(e) => setOnboardGeminiKey(e.target.value)}
                          placeholder="AIzaSy..."
                          className="w-full bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3.5 text-sm placeholder-zinc-600 outline-none transition-all text-white hover:border-white/20 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setOnboardShowGemini(!onboardShowGemini)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-wider"
                        >
                          {onboardShowGemini ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>
                  )}

                  {onboardModelProvider === "openai" && (
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between items-end">
                        <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">OpenAI API Key</label>
                        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-[10px] text-zinc-500 hover:text-white transition-colors underline">Get Key</a>
                      </div>
                      <div className="relative group">
                        <input
                          type={onboardShowOpenai ? "text" : "password"}
                          value={onboardOpenaiKey}
                          onChange={(e) => setOnboardOpenaiKey(e.target.value)}
                          placeholder="sk-..."
                          className="w-full bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3.5 text-sm placeholder-zinc-600 outline-none transition-all text-white hover:border-white/20 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setOnboardShowOpenai(!onboardShowOpenai)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-wider"
                        >
                          {onboardShowOpenai ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Jira Connections */}
              <div className="space-y-5 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                <div className="border-b border-white/10 pb-3">
                  <h3 className="text-lg font-semibold text-white">Jira Connection</h3>
                  <p className="text-xs text-zinc-500">Provide Atlassian credentials</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">Jira Domain</label>
                    <input
                      type="text"
                      value={onboardDomain}
                      onChange={(e) => setOnboardDomain(e.target.value)}
                      placeholder="your-company.atlassian.net"
                      required
                      className="w-full bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3.5 text-sm placeholder-zinc-600 outline-none transition-all text-white hover:border-white/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">Atlassian Email</label>
                      <button type="button" onClick={handleLogout} className="text-[10px] text-zinc-500 hover:text-white transition-colors underline">
                        Made a mistake? Change email
                      </button>
                    </div>
                    <input
                      type="email"
                      value={appUser?.email || ""}
                      readOnly
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-zinc-400 outline-none cursor-not-allowed opacity-70"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 ml-1">API Token</label>
                      <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" className="text-[10px] text-zinc-500 hover:text-white transition-colors underline">Get Token</a>
                    </div>
                    <div className="relative group">
                      <input
                        type={onboardShowPassword ? "text" : "password"}
                        value={onboardToken}
                        onChange={(e) => setOnboardToken(e.target.value)}
                        placeholder="Paste your API token here"
                        required
                        className="w-full bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3.5 pr-16 text-sm placeholder-zinc-600 outline-none transition-all text-white hover:border-white/20 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setOnboardShowPassword(!onboardShowPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-wider"
                      >
                        {onboardShowPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={onboardLoading}
                className="w-full py-4 bg-white text-black hover:bg-zinc-200 disabled:bg-white/20 disabled:text-white/40 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] hover:scale-[1.01] active:scale-[0.99]"
              >
                {onboardLoading ? (
                  <>
                    <RotateCw className="w-5 h-5 animate-spin" />
                    <span>Configuring Agent...</span>
                  </>
                ) : (
                  <span>Launch Dashboard</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div id="app-root" className="min-h-screen bg-[#F4F5F7] text-[#091E42] font-sans flex flex-col antialiased">

      {/* GLOBAL HEADER BANNER */}
      <header id="app-header" className="border-b border-[#DFE1E6] bg-white sticky top-0 z-40 px-6 py-3 flex items-center justify-between shadow-xs">
        <div id="header-branding" className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-[#0052CC] flex items-center justify-center shadow-sm">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-[#091E42] flex items-center gap-1.5">
              JIRA AI Agent
              {authType === "demo" && (
                <span className="text-[10px] uppercase font-mono bg-[#DEEBFF] text-[#0052CC] border border-[#B3D4FF] px-1.5 py-0.5 rounded font-bold tracking-wider">
                  Demo Sandbox
                </span>
              )}
            </h1>
            <p className="text-[11px] text-[#5E6C84]">Smart Jira Workspace · AI Co-Pilot</p>
          </div>
        </div>

        {/* CONNECTION CARD PILLS */}
        <div id="header-actions" className="flex items-center space-x-3">
          {authType !== "demo" && (
            <div id="connection-pills" className="hidden md:flex items-center space-x-2 bg-slate-100 border border-[#DFE1E6] p-1.5 rounded-lg text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-1.5" />
              <span className="text-[#172B4D] font-medium">
                {authType === "oauth" 
                  ? `OAuth: ${selectedSite?.name || "Connected"}` 
                  : `API Site: ${directConn?.domain}`}
              </span>
              <button
                onClick={handleDisconnect}
                className="hover:bg-slate-200 p-1.5 rounded transition text-[#5E6C84] hover:text-red-600"
                title="Disconnect from Jira"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          
          {authType === "demo" && (
            <div className="hidden lg:flex items-center space-x-1.5 bg-[#DEEBFF] border border-[#B3D4FF] text-[#0052CC] px-2.5 py-1.25 rounded-md text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5 text-[#0052CC]" />
              <span>Interactive Sandbox - Credentials Optional</span>
            </div>
          )}

          {jwtToken && (
            <div id="user-jwt-profile" className="flex items-center space-x-2 bg-slate-50 border border-[#DFE1E6] px-2.5 py-1 rounded-md text-xs font-medium">
              <span className="w-5 h-5 rounded-full bg-[#0052CC] text-white flex items-center justify-center font-bold text-[10px] uppercase">
                {currentUserDetails?.email ? currentUserDetails.email.charAt(0) : "U"}
              </span>
              <span className="text-[#172B4D] hidden sm:inline">{currentUserDetails?.email}</span>
              <button
                onClick={handleLogout}
                className="hover:bg-rose-50 hover:text-rose-600 p-1 rounded transition text-[#5E6C84]"
                title="Log out of application"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            onClick={() => loadWorkspace()}
            className="p-1.5 bg-white hover:bg-[#F4F5F7] text-[#42526E] rounded-md hover:text-[#091E42] border border-[#DFE1E6] transition"
            title="Refresh current workspace"
            disabled={isLoading}
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? "animate-spin text-[#0052CC]" : ""}`} />
          </button>
        </div>
      </header>

      {/* CORE FRAMEWORK WORKSPACE CONTROL PANEL */}
      <main id="app-main-view" className="flex-1 flex flex-col">
        {/* RENDER FORMS / SELECT SITE GATEWAY IF DISCONNECTED OR DIRECT SETTINGS MISSING */}
        {authType !== "demo" && authType === "oauth" && !selectedSite && availableSites.length > 0 && (
          <div id="oauth-site-selector" className="max-w-md mx-auto my-16 bg-white border border-[#DFE1E6] rounded-xl p-6 shadow-sm space-y-5">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 bg-[#DEEBFF] rounded-full flex items-center justify-center text-[#0052CC]">
                <Globe className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="text-lg font-semibold text-[#091E42]">Select Atlassian Site</h3>
              <p className="text-sm text-[#5E6C84]">Your OAuth credentials give you access to the following instances. Please choose one to operate:</p>
            </div>
            <div className="divide-y divide-[#DFE1E6] bg-[#FAFBFC] rounded-lg overflow-hidden border border-[#DFE1E6]">
              {availableSites.map(site => (
                <button
                  key={site.id}
                  onClick={() => handleSelectSite(site)}
                  className="w-full px-4 py-3 text-left hover:bg-[#EBECF0] transition flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    {site.avatarUrl ? (
                      <img src={site.avatarUrl} alt={site.name} className="w-7 h-7 rounded" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-7 h-7 rounded bg-[#DEEBFF] flex items-center justify-center text-[10px] font-bold text-[#0052CC]">
                        SITE
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-sm text-[#091E42]">{site.name}</p>
                      <p className="text-xs text-[#5E6C84]">{site.url}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#5E6C84]" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CONNECTION SETUP TABPANELS IF FULLY DISCONNECTED BRAND NEW SETUP */}
        {((authType === "basic" && !directConn) || (authType === "oauth" && !oauthTokens && availableSites.length === 0)) ? (
          <div id="setup-gateway-portal" className="max-w-4xl mx-auto w-full px-6 py-12 flex-1 flex flex-col justify-center">
            <div className="grid md:grid-cols-12 gap-8 items-stretch bg-white border border-[#DFE1E6] rounded-xl p-8 shadow-xs">
              {/* Introduction Column */}
              <div className="md:col-span-5 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="inline-flex items-center space-x-1.5 bg-[#DEEBFF] text-[#0052CC] border border-[#B3D4FF] px-3 py-1 rounded-full text-xs font-semibold">
                    <Zap className="w-3.5 h-3.5 animate-pulse" />
                    <span>Secure Proxy Integration</span>
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-[#091E42] leading-tight">Sync & Optimize your Jira Workflow</h2>
                  <p className="text-[#5E6C84] text-sm leading-relaxed">
                    A beautiful, low-overhead Kanban dashboard for tracking issues, comments, details, and backlog transitions. Select a connection scheme to fetch your actual cloud assets or enter the playground.
                  </p>
                </div>

                <div className="bg-[#F4F5F7] border border-[#DFE1E6] rounded-lg p-4 text-xs space-y-2 text-[#5E6C84] leading-normal">
                  <div className="flex items-start space-x-2">
                    <Info className="w-4 h-4 text-[#0052CC] shrink-0 mt-0.5" />
                    <span>Our secure node-proxy forwards request directly to Atlassian API. Your tokens are cached solely nested in your own web sandbox localStorage.</span>
                  </div>
                </div>

              </div>

              {/* Interactive Forms Column */}
              <div className="md:col-span-1 border-r border-[#DFE1E6] hidden md:block" />

              <div className="md:col-span-6 space-y-6 flex flex-col justify-center">
                {/* Connection switch tabs */}
                <div className="bg-[#EBECF0] p-1 rounded-lg flex items-center border border-slate-200">
                  <button
                    onClick={() => setAuthType("basic")}
                    className={`flex-1 py-1.5 text-xs font-medium rounded transition flex items-center justify-center space-x-1.5 ${authType === "basic" ? "bg-white text-[#091E42] shadow-xs font-bold" : "text-[#5E6C84] hover:text-[#091E42]"}`}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Jira API Token</span>
                  </button>
                  <button
                    onClick={() => setAuthType("oauth")}
                    className={`flex-1 py-1.5 text-xs font-medium rounded transition flex items-center justify-center space-x-1.5 ${authType === "oauth" ? "bg-white text-[#091E42] shadow-xs font-bold" : "text-[#5E6C84] hover:text-[#091E42]"}`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Atlassian OAuth 2.0</span>
                  </button>
                </div>

                {/* ERROR LIGHTBOX IN ACCESS PORTS */}
                {errorMessage && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-lg text-xs flex items-start space-x-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* TAB 1: BASIC DIRECT DIALOGUE */}
                {authType === "basic" && (
                  <form onSubmit={handleDirectConnectSubmit} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#42526E]">Jira Site Domain</label>
                      <input
                        type="text"
                        placeholder="mycompany.atlassian.net"
                        value={inputDomain}
                        onChange={(e) => setInputDomain(e.target.value)}
                        className="w-full px-3 py-2 bg-white hover:bg-slate-50 focus:bg-white border border-[#DFE1E6] focus:border-[#0052CC] focus:ring-2 focus:ring-[#DEEBFF]/30 rounded text-sm text-[#091E42] placeholder-slate-400 outline-none transition"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#42526E]">Atlassian account Email</label>
                      <input
                        type="email"
                        placeholder="you@company.com"
                        value={inputEmail}
                        onChange={(e) => setInputEmail(e.target.value)}
                        className="w-full px-3 py-2 bg-white hover:bg-slate-50 focus:bg-white border border-[#DFE1E6] focus:border-[#0052CC] focus:ring-2 focus:ring-[#DEEBFF]/30 rounded text-sm text-[#091E42] placeholder-slate-400 outline-none transition"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-[#42526E]">Atlassian API Token</label>
                        <a
                          href="https://id.atlassian.com/manage-profile/security/api-tokens"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-[#0052CC] hover:underline inline-flex items-center gap-0.5 font-semibold"
                        >
                          Generate Token <Plus className="w-3 h-3" />
                        </a>
                      </div>
                      <input
                        type="password"
                        placeholder="Atlassian secure developer token..."
                        value={inputToken}
                        onChange={(e) => setInputToken(e.target.value)}
                        className="w-full px-3 py-2 bg-white hover:bg-slate-50 focus:bg-white border border-[#DFE1E6] focus:border-[#0052CC] focus:ring-2 focus:ring-[#DEEBFF]/30 rounded text-sm text-[#091E42] placeholder-slate-400 outline-none transition"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2.5 bg-[#0052CC] hover:bg-[#0747A6] text-white font-semibold rounded transition flex items-center justify-center space-x-2 cursor-pointer text-sm shadow-xs"
                    >
                      {isLoading ? (
                        <>
                          <RotateCw className="w-4 h-4 animate-spin text-white" />
                          <span>Verifying & Connecting...</span>
                        </>
                      ) : (
                        <span>Connect Workspace</span>
                      )}
                    </button>
                  </form>
                )}

                {/* TAB 2: SECURE OAUTH GATEWAY INSTRUCTIONS */}
                {authType === "oauth" && (
                  <div className="space-y-4">
                    <div className="bg-[#F4F5F7] border border-[#DFE1E6] rounded-lg p-5 space-y-3.5">
                      <h4 className="text-sm font-semibold text-[#091E42]">OAuth App Configuration Requirements</h4>
                      <ol className="text-xs text-[#5E6C84] list-decimal pl-4.5 space-y-2 leading-relaxed">
                        <li>
                          Open your Atlassian App Dashboard at{" "}
                          <a href="https://developer.atlassian.com/console/myapps/" target="_blank" rel="noopener noreferrer" className="text-[#0052CC] font-semibold hover:underline">
                            developer.atlassian.com
                          </a>
                        </li>
                        <li>Add the OAuth 2.0 (3LO) integration capability to your project.</li>
                        <li>
                          Set the Callback Redirect URI to:
                          <div id="callback-code-view" className="bg-[#FAFBFC] p-2 rounded border border-[#DFE1E6] font-mono text-[#091E42] mt-1 select-all break-all overflow-x-auto">
                            {window.location.origin}/auth/callback
                          </div>
                        </li>
                        <li>Configure scopes: <code className="text-[#0052CC] bg-[#DEEBFF] px-1 rounded">read:jira-work</code>, <code className="text-[#0052CC] bg-[#DEEBFF] px-1 rounded">write:jira-work</code>, <code className="text-[#0052CC] bg-[#DEEBFF] px-1 rounded">read:jira-user</code>, <code className="text-[#0052CC] bg-[#DEEBFF] px-1 rounded">read:user:jira</code>, <code className="text-[#0052CC] bg-[#DEEBFF] px-1 rounded">read:issue:jira</code>.</li>
                        <li>Set <code className="text-[#5E6C84] bg-white border px-1 rounded">JIRA_CLIENT_ID</code> and <code className="text-[#5E6C84] bg-white border px-1 rounded">JIRA_CLIENT_SECRET</code> on your server environment secrets.</li>
                      </ol>
                    </div>

                    <button
                      onClick={handleOAuthConnectInit}
                      className="w-full py-2.5 bg-[#0052CC] hover:bg-[#0747A6] text-white font-semibold rounded text-sm transition flex items-center justify-center space-x-2 cursor-pointer shadow-xs"
                    >
                      <Globe className="w-4 h-4" />
                      <span>Authenticate Atlassian Profile</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* OTHERWISE RENDER FULL WORKBOARD DASHBOARD VIEWPORT */
          <div id="dashboard-viewport" className="flex-1 flex flex-col">
            {/* WORKSPACE PRESETS AND FILTERS TOOLBAR */}
            <div id="toolbar-container" className="bg-white border-b border-[#DFE1E6] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div id="project-selector-group" className="flex flex-wrap items-center gap-4">
                {activeTab === "docs" ? (
                  docsSubTab === "wiki" ? (
                    /* Space selector dropdown */
                    <div className="flex items-center space-x-2 animate-fade-in">
                      <BookOpen className="w-4 h-4 text-[#0052CC]" />
                      <span className="text-xs text-[#5E6C84] font-semibold uppercase tracking-wider">Confluence Space:</span>
                      <select
                        value={selectedSpace?.key || selectedSpace?.id || ""}
                        onChange={(e) => {
                          const space = confluenceSpaces.find(s => (s.key === e.target.value || s.id === e.target.value));
                          if (space) setSelectedSpace(space);
                        }}
                        className="bg-white border border-[#DFE1E6] hover:bg-slate-50 text-[#091E42] text-xs font-semibold rounded px-3 py-1.5 outline-none cursor-pointer transition"
                      >
                        {confluenceSpaces.length === 0 ? (
                          <option value="">No Confluence Spaces found</option>
                        ) : (
                          confluenceSpaces.map(s => (
                            <option key={s.id} value={s.key || s.id}>
                              {s.name} ({s.key || "Space"})
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 animate-fade-in">
                      <HelpCircle className="w-4 h-4 text-amber-500 animate-pulse" />
                      <span className="text-xs font-bold text-amber-700 tracking-wide uppercase">Atlassian Directory & Secrets Finder</span>
                    </div>
                  )
                ) : (
                  /* Project selector dropdown */
                  <div className="flex items-center space-x-2">
                    <Briefcase className="w-4 h-4 text-[#5E6C84]" />
                    <span className="text-xs text-[#5E6C84] font-semibold uppercase tracking-wider">Project:</span>
                    <select
                      value={selectedProject?.id || ""}
                      onChange={(e) => {
                        const proj = projects.find(p => p.id === e.target.value);
                        if (proj) setSelectedProject(proj);
                      }}
                      className="bg-white border border-[#DFE1E6] hover:bg-slate-50 text-[#091E42] text-xs font-bold rounded px-3 py-1.5 outline-none cursor-pointer transition"
                    >
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.key})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Switch view buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="bg-[#EBECF0] p-1 rounded-md border border-slate-200 flex flex-wrap gap-1">
                    <button
                      onClick={() => setActiveTab("board")}
                      className={`px-3 py-1 rounded text-xs font-semibold transition flex items-center gap-1.5 ${activeTab === "board" ? "bg-white text-[#091E42] shadow-xs" : "text-[#5E6C84] hover:text-[#091E42]"}`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Board View
                    </button>
                    <button
                      onClick={() => setActiveTab("backlog")}
                      className={`px-3 py-1 rounded text-xs font-semibold transition flex items-center gap-1.5 ${activeTab === "backlog" ? "bg-white text-[#091E42] shadow-xs" : "text-[#5E6C84] hover:text-[#091E42]"}`}
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      Backlog
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab("docs");
                        setDocsSubTab("wiki");
                      }}
                      className={`px-3 py-1 rounded text-xs font-semibold transition flex items-center gap-1.5 ${activeTab === "docs" ? "bg-white text-[#091E42] shadow-xs" : "text-[#5E6C84] hover:text-[#091E42]"}`}
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[#0052CC]" />
                      Docs & Wiki
                    </button>
                    <button
                      onClick={() => setActiveTab("profiles")}
                      className={`px-3 py-1 rounded text-xs font-semibold transition flex items-center gap-1.5 ${activeTab === "profiles" ? "bg-indigo-100 border border-indigo-200 text-indigo-800" : "text-[#5E6C84] hover:text-[#0052CC]"}`}
                    >
                      <User className="w-3.5 h-3.5" />
                      My Profile
                    </button>
                  </div>

                  <button
                    onClick={() => setIsAiOpen(true)}
                    title="Open JIRA AI Agent"
                    className="w-9 h-9 rounded-xl bg-[#0052CC] hover:bg-[#0747A6] text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md hover:shadow-lg relative group"
                  >
                    <Bot className="w-4.5 h-4.5" style={{width:"18px",height:"18px"}} />
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#36B37E] rounded-full border-2 border-white animate-pulse" />
                  </button>
                </div>
              </div>

              {/* SEARCH FILTERING SELECTION */}
              {activeTab !== "profiles" && (activeTab !== "docs" || docsSubTab === "wiki") && (
                <div id="filtering-dock" className="flex flex-wrap items-center gap-3.5">
                  {activeTab === "docs" ? (
                    <>
                      <div className="relative shrink-0 max-w-xs w-full">
                        <Search className="w-4 h-4 text-[#5E6C84] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Filter spaces/pages..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-3 py-1.5 bg-white hover:bg-slate-50 focus:bg-white border border-[#DFE1E6] focus:border-[#0052CC] rounded text-xs text-[#091E42] placeholder-slate-400 outline-none transition"
                        />
                      </div>
                      <button
                        onClick={fetchConfluenceSpaces}
                        disabled={isFetchingConfluence}
                        className="px-3.5 py-1.5 bg-[#EBECF0] hover:bg-[#DFE1E6] text-[#42526E] hover:text-[#091E42] border border-[#DFE1E6] text-xs rounded transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${isFetchingConfluence ? 'animate-spin text-[#0052CC]' : ''}`} />
                        <span>Refresh Wiki</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="relative shrink-0 max-w-xs w-full">
                        <Search className="w-4 h-4 text-[#5E6C84] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search query, users or keys..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-3.5 py-1.5 bg-white hover:bg-slate-50 focus:bg-white border border-[#DFE1E6] focus:border-[#0052CC] rounded text-xs text-[#091E42] placeholder-slate-400 outline-none transition"
                        />
                      </div>

                      {/* Filtering controls */}
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="bg-white border border-[#DFE1E6] text-[#091E42] text-xs font-semibold rounded px-2.5 py-1.5 outline-none cursor-pointer hover:bg-slate-50 transition shadow-xs"
                      >
                        <option value="All">All Types</option>
                        <option value="Task">Tasks</option>
                        <option value="Bug">Bugs</option>
                        <option value="Story">Stories</option>
                        <option value="Epic">Epics</option>
                      </select>

                      <select
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value)}
                        className="bg-white border border-[#DFE1E6] text-[#091E42] text-xs font-semibold rounded px-2.5 py-1.5 outline-none cursor-pointer hover:bg-slate-50 transition shadow-xs"
                      >
                        <option value="All">All Priorities</option>
                        <option value="Highest">Highest</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                        <option value="Lowest">Lowest</option>
                      </select>

                      {/* Create ticket trigger */}
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-3.5 py-1.5 bg-[#0052CC] hover:bg-[#0747A6] text-white font-semibold text-xs rounded transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Create Issue</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ERROR NOTICES IN DASHBOARD VIEWS */}
            {errorMessage && (
              <div className="mx-6 mt-4 bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded text-xs flex items-start space-x-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold block mb-0.5">Operation Notice</span>
                  <p className="opacity-90 leading-relaxed text-[11px]">{errorMessage}</p>
                </div>
                <button onClick={() => setErrorMessage(null)} className="text-rose-600 hover:text-rose-800 text-xs px-1">✕</button>
              </div>
            )}

            {/* TAB VIEWPORTS: BOARD VS BACKLOG */}
            <div id="workspace-layout" className="flex-1 p-6 overflow-x-auto min-h-[350px]">
              {isLoading && issues.length === 0 ? (
                <div className="h-full flex flex-col justify-center items-center py-24 space-y-3">
                  <RotateCw className="w-8 h-8 animate-spin text-[#0052CC]" />
                  <p className="text-sm text-[#5E6C84] font-medium">Syncing Jira details...</p>
                </div>
              ) : activeTab === "board" ? (
                /* INTERACTIVE KANBAN SCRUM GRID */
                <div id="board-grid" className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start h-full min-w-[1000px]">
                  {boardStatuses.map((statusName) => {
                    // Extract issues pertaining to status
                    const issuesInStatus = filteredIssues.filter(issue => {
                      const name = issue.fields.status?.name || "";
                      
                      // Map status names accurately to basic board Columns
                      if (statusName === "Backlog") {
                        return name.toLowerCase().includes("backlog");
                      }
                      if (statusName === "To Do") {
                        return name.toLowerCase().includes("todo") || name.toLowerCase() === "to do" || name.toLowerCase() === "open" || name.toLowerCase() === "selected for development";
                      }
                      if (statusName === "In Progress") {
                        return name.toLowerCase().includes("progress") || name.toLowerCase().includes("review") || name.toLowerCase().includes("stage");
                      }
                      if (statusName === "Done") {
                        return name.toLowerCase() === "done" || name.toLowerCase() === "closed" || name.toLowerCase() === "resolved";
                      }
                      return false;
                    });

                    return (
                      <div
                        key={statusName}
                        id={`column-${statusName.replace(/\s+/g, "")}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, statusName)}
                        className="bg-[#F4F5F7] border border-[#DFE1E6] rounded flex flex-col max-h-[75vh] w-full p-2"
                      >
                        {/* Column Header */}
                        <div className="px-3 py-2 flex justify-between items-center bg-transparent">
                          <span className="text-xs font-semibold text-[#5E6C84] uppercase tracking-wider">
                            {statusName}
                          </span>
                          <span className="text-[10px] font-bold bg-[#DFE1E6] px-2 py-0.5 rounded-full text-[#42526E]">
                            {issuesInStatus.length}
                          </span>
                        </div>

                        {/* Drop Zone Issues list */}
                        <div className="p-2 space-y-2 overflow-y-auto flex-1 min-h-[220px]">
                          {issuesInStatus.length === 0 ? (
                            <div className="h-28 border border-dashed border-[#DFE1E6] rounded flex flex-col items-center justify-center text-[#5E6C84] px-3 text-center">
                              <p className="text-[11px]">Drop cards here to transition status</p>
                            </div>
                          ) : (
                            issuesInStatus.map((issue) => (
                              <div
                                key={issue.id}
                                id={`card-${issue.key}`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, issue.key)}
                                onClick={() => setSelectedIssue(issue)}
                                className="group bg-white border border-[#DFE1E6] hover:border-[#4c86e0] hover:shadow-sm p-3.5 rounded cursor-grab active:cursor-grabbing transition duration-150 flex flex-col space-y-3.5"
                              >
                                {/* Upper row: Type, priority, project indicators */}
                                <div className="flex items-center justify-between">
                                  <div className="inline-flex items-center space-x-1 border border-[#DFE1E6] rounded-md px-1.5 py-0.5 bg-[#FAFBFC]">
                                    <span className={`w-1.5 h-1.5 rounded-full ${issue.fields.issuetype?.name?.toLowerCase() === 'bug' ? 'bg-rose-500' : 'bg-[#0052CC]'}`} />
                                    <span className="text-[10px] text-[#5E6C84] font-bold uppercase font-mono">{issue.key}</span>
                                  </div>
                                  
                                  <div className="flex items-center space-x-1.5">
                                    <span className={`text-[10px] px-2 py-0.5 rounded border ${getPriorityColor(issue.fields.priority?.name)} font-semibold font-mono`}>
                                      {issue.fields.priority?.name}
                                    </span>
                                  </div>
                                </div>

                                {/* Header text details */}
                                <h4 className="text-xs font-semibold text-[#172B4D] leading-snug group-hover:text-[#0052CC] transition">
                                  {issue.fields.summary}
                                </h4>

                                {/* Lower row: Assignee Avatar, comments counter, type badge */}
                                <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                                  <div className={`text-[9 rounded px-2 py-0.5 text-[9.5px] border ${getTypeIconColor(issue.fields.issuetype?.name)} font-mono`}>
                                    {issue.fields.issuetype?.name}
                                  </div>
                                  
                                  <div className="flex items-center space-x-2">
                                    {issue.fields.comment?.comments && issue.fields.comment.comments.length > 0 && (
                                      <div className="flex items-center space-x-1 text-[#5E6C84]">
                                        <MessageSquare className="w-3 h-3" />
                                        <span className="text-[10px] font-mono leading-none">{issue.fields.comment.comments.length}</span>
                                      </div>
                                    )}
                                    
                                    {issue.fields.assignee ? (
                                      <img
                                        src={issue.fields.assignee.avatarUrls?.["48x48"] || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=48&h=48&q=80"}
                                        alt={issue.fields.assignee.displayName}
                                        title={`Assignee: ${issue.fields.assignee.displayName}`}
                                        className="w-5.5 h-5.5 rounded-full border border-slate-200 object-cover"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <div className="w-5.5 h-5.5 rounded-full border border-dashed border-slate-300 bg-[#F4F5F7] flex items-center justify-center text-[#5E6C84] hover:border-slate-400 transition" title="Unassigned">
                                        <User className="w-3 h-3" />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : activeTab === "backlog" ? (
                /* BACKLOG SCRUM TABLE INDEX VIEWPORT */
                <div id="backlog-slate" className="bg-white border border-[#DFE1E6] rounded overflow-hidden min-w-[900px]">
                  <div className="grid grid-cols-12 gap-3.5 px-4.5 py-3 border-b border-[#DFE1E6] bg-[#FAFBFC] text-xs font-bold uppercase tracking-wider text-[#5E6C84]">
                    <span className="col-span-2">Issue Key</span>
                    <span className="col-span-5">Summary details</span>
                    <span className="col-span-1.5 text-center">Type</span>
                    <span className="col-span-1.5 text-center">Priority</span>
                    <span className="col-span-2 text-right">Assignee</span>
                  </div>
                  
                  <div className="divide-y divide-[#DFE1E6] max-h-[65vh] overflow-y-auto">
                    {filteredIssues.length === 0 ? (
                      <div className="p-12 text-center text-[#5E6C84] text-xs flex flex-col items-center justify-center gap-2">
                        <Briefcase className="w-10 h-10 text-slate-300" />
                        <p>No issues aligned with the specified filter query.</p>
                      </div>
                    ) : (
                      filteredIssues.map(issue => (
                        <div
                          key={issue.id}
                          id={`row-${issue.key}`}
                          onClick={() => setSelectedIssue(issue)}
                          className="grid grid-cols-12 gap-3.5 px-4.5 py-3 bg-white hover:bg-[#F4F5F7] text-xs items-center cursor-pointer transition"
                        >
                          {/* Key */}
                          <div className="col-span-2 inline-flex items-center space-x-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#0052CC]" />
                            <span className="font-bold text-[#0052CC] select-all">{issue.key}</span>
                          </div>

                          {/* Summary */}
                          <div className="col-span-5 text-[#172B4D] font-semibold truncate pr-4">
                            {issue.fields.summary}
                          </div>

                          {/* Type */}
                          <div className="col-span-1.5 text-center">
                            <span className={`inline-block text-[9.5px] px-2 py-0.5 rounded border leading-none ${getTypeIconColor(issue.fields.issuetype?.name)} font-mono`}>
                              {issue.fields.issuetype?.name}
                            </span>
                          </div>

                          {/* Priority */}
                          <div className="col-span-1.5 text-center">
                            <span className={`inline-block text-[9.5px] px-2 py-0.5 rounded border leading-none ${getPriorityColor(issue.fields.priority?.name)} font-mono`}>
                              {issue.fields.priority?.name}
                            </span>
                          </div>

                          {/* Assignee */}
                          <div className="col-span-2 flex items-center justify-end space-x-2">
                            {issue.fields.assignee ? (
                              <>
                                <span className="text-[#5E6C84] truncate text-[11px]">{issue.fields.assignee.displayName}</span>
                                <img
                                  src={issue.fields.assignee.avatarUrls?.["48x48"] || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=48&h=48&q=80"}
                                  alt={issue.fields.assignee.displayName}
                                  className="w-5.5 h-5.5 rounded-full shadow-xs border border-slate-200 shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                              </>
                            ) : (
                              <span className="text-[#5E6C84] font-medium text-[10px]">Unassigned</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : activeTab === "docs" ? (
                /* CONSOLIDATED DOCS & WIKI VIEWPORT */
                <div className="space-y-6">
                  {/* Secondary Sub-tab Navigation */}
                  <div className="flex border-b border-[#DFE1E6] space-x-6">
                    <button
                      type="button"
                      onClick={() => setDocsSubTab("wiki")}
                      className={`pb-2.5 text-xs font-bold uppercase tracking-wider transition-all relative cursor-pointer ${
                        docsSubTab === "wiki" ? "text-[#0052CC]" : "text-[#5E6C84] hover:text-[#172B4D]"
                      }`}
                    >
                      Wiki (Confluence)
                      {docsSubTab === "wiki" && (
                        <motion.div layoutId="activeDocsSubLine" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0052CC]" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocsSubTab("guide")}
                      className={`pb-2.5 text-xs font-bold uppercase tracking-wider transition-all relative cursor-pointer ${
                        docsSubTab === "guide" ? "text-[#0052CC]" : "text-[#5E6C84] hover:text-[#172B4D]"
                      }`}
                    >
                      Developer Guide
                      {docsSubTab === "guide" && (
                        <motion.div layoutId="activeDocsSubLine" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0052CC]" />
                      )}
                    </button>
                  </div>

                  {docsSubTab === "wiki" ? (
                    /* CONFLUENCE SPA WIKI SUB-VIEWPORT */
                    <div id="confluence-wiki-viewport" className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[500px] h-[calc(100vh-320px)] animate-fade-in">
                      {/* Left Column: List of Pages inside selected Space */}
                      <div className="lg:col-span-4 bg-white border border-[#DFE1E6] rounded p-4 flex flex-col space-y-4 h-full overflow-hidden">
                        <div className="flex items-center justify-between border-b border-[#DFE1E6] pb-3">
                          <div>
                            <h3 className="text-xs font-bold text-[#0052CC] tracking-wider uppercase">
                              {selectedSpace ? (selectedSpace.name || selectedSpace.key) : "Confluence Spaces"}
                            </h3>
                            <p className="text-[10px] text-[#5E6C84] mt-0.5 font-semibold">
                              {confluencePages.length} active documents
                            </p>
                          </div>
                          
                          {selectedSpace && (
                            <div className="bg-[#DEEBFF] text-[10px] font-mono px-2 py-0.5 rounded text-[#0052CC] font-bold border border-[#B3D4FF]">
                              {selectedSpace.key || selectedSpace.id}
                            </div>
                          )}
                        </div>

                        {isFetchingConfluence && confluencePages.length === 0 ? (
                          <div className="flex-1 flex flex-col justify-center items-center py-12 space-y-2">
                            <RotateCw className="w-5 h-5 animate-spin text-[#0052CC]" />
                            <p className="text-[11px] text-[#5E6C84] font-mono">Retrieving page indexes...</p>
                          </div>
                        ) : (
                          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                            {confluencePages
                              .filter(page => {
                                if (!searchQuery) return true;
                                const query = searchQuery.toLowerCase();
                                return (
                                  page.title?.toLowerCase().includes(query) ||
                                  page.id?.toString().toLowerCase().includes(query)
                                );
                              })
                              .map(page => {
                                const isSelected = selectedPage?.id === page.id;
                                const editedDate = page.history?.createdDate 
                                  ? new Date(page.history.createdDate).toLocaleDateString() 
                                  : "Recently updated";
                                return (
                                  <button
                                    key={page.id}
                                    onClick={() => setSelectedPage(page)}
                                    className={`w-full text-left p-3 rounded border transition-all duration-200 select-none cursor-pointer flex flex-col space-y-2 ${
                                      isSelected 
                                        ? "bg-[#DEEBFF] border-[#0052CC] text-[#0747A6] shadow-xs" 
                                        : "bg-white border-[#DFE1E6] hover:bg-[#F4F5F7] text-[#172B4D]"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-1">
                                      <span className="text-xs font-semibold leading-relaxed truncate flex-1">
                                        {page.title}
                                      </span>
                                      <FileText className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isSelected ? "text-[#0052CC]" : "text-[#5E6C84]"}`} />
                                    </div>
                                    
                                    <div className="flex items-center justify-between text-[10px] text-[#5E6C84] font-mono">
                                      <span>ID: {page.id}</span>
                                      <span>{editedDate}</span>
                                    </div>
                                  </button>
                                );
                              })}

                            {confluencePages.length === 0 && (
                              <div className="h-48 border border-dashed border-slate-300 rounded flex flex-col items-center justify-center text-slate-500 p-4 text-center">
                                <BookOpen className="w-6 h-6 text-slate-400 mb-2" />
                                <p className="text-xs font-semibold text-[#172B4D] mb-1">No pages found inside space</p>
                                <p className="text-[10px] leading-relaxed text-[#5E6C84] max-w-[200px]">
                                  To read wikis, ensure you have set up pages inside the Space key <b className="text-[#091E42]">"{selectedSpace?.key || "DEV"}"</b> on Confluence.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right Column: HTML Content Reader */}
                      <div className="lg:col-span-8 bg-white border border-[#DFE1E6] rounded p-5 flex flex-col h-full overflow-hidden">
                        {selectedPage ? (
                          <div className="flex flex-col h-full space-y-4 overflow-hidden animate-fade-in">
                            {/* Pages header */}
                            <div className="border-b border-[#DFE1E6] pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
                              <div>
                                <span className="text-[10px] font-bold text-[#0052CC] font-mono uppercase bg-[#DEEBFF] border border-[#B3D4FF] px-2.5 py-1 rounded inline-block mb-1.5">
                                  Confluence Doc Reference
                                </span>
                                <h2 className="text-base font-bold text-[#091E42] tracking-tight">
                                  {selectedPage.title}
                                </h2>
                                <p className="text-[10px] text-[#5E6C84] font-mono mt-1">
                                  Page ID: <span className="text-[#091E42] font-semibold">{selectedPage.id}</span> • Space: <span className="text-[#091E42] font-semibold">{selectedSpace?.name || selectedSpace?.key || "Wiki"}</span>
                                </p>
                              </div>

                              <div className="flex items-center space-x-2.5">
                                {authType !== "demo" && directConn && (
                                  <a
                                    href={`https://${directConn.domain || "atlassian.net"}/wiki/spaces/${selectedSpace?.key || "DEV"}/pages/${selectedPage.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1.5 bg-[#EBECF0] border border-[#DFE1E6] hover:bg-[#DFE1E6] text-[#42526E] hover:text-[#091E42] text-[11px] rounded transition flex items-center space-x-1.5 font-medium cursor-pointer"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    <span>Target Atlassian Page</span>
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Beautifully rendered iframe-grade wiki layout */}
                            <div className="flex-1 overflow-y-auto pr-1">
                              <div 
                                className="text-[#172B4D] text-xs leading-relaxed space-y-4 font-sans select-text p-1.5 max-w-none prose prose-slate"
                                style={{
                                  lineHeight: "1.75rem",
                                  letterSpacing: "0.0125em",
                                }}
                              >
                                {selectedPage.body?.view?.value ? (
                                  <div 
                                    dangerouslySetInnerHTML={{ __html: selectedPage.body.view.value }} 
                                    className="confluence-custom-inner-html"
                                  />
                                ) : (
                                  <div className="py-12 bg-[#F4F5F7] border border-[#DFE1E6] p-6 rounded text-center flex flex-col items-center justify-center text-[#5E6C84]">
                                    <FileText className="w-8 h-8 text-[#42526E] mb-2" />
                                    <p className="text-xs font-semibold text-[#091E42] mb-1">Body empty or unreadable</p>
                                    <p className="text-[10px] text-[#5E6C84] max-w-sm">
                                      There is no HTML preview block stored on Atlassian for this page, or we are waiting for permission scope grants.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col justify-center items-center text-center p-6 text-slate-500 border border-dashed border-[#DFE1E6] rounded bg-slate-50">
                            <BookOpen className="w-10 h-10 text-[#0052CC] mb-3 animate-pulse" />
                            <h4 className="text-xs font-bold text-[#091E42] uppercase tracking-wider">
                              Confluence Space Wiki Browser
                            </h4>
                            <p className="text-[11px] leading-relaxed text-[#5E6C84] max-w-sm mt-1.5">
                              Select a Space from the toolbar dropdown and choose a document from the lists to view detailed Atlassian documentation natively!
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* INSTRUCTIONAL BENTO SECRETS DIRECTORY & CREDENTIALS FINDER */
                    <div id="credentials-api-directory" className="space-y-6 animate-fade-in text-sans">
                      <div className="bg-[#FFFAE6] border border-[#FFE380] rounded p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-start space-x-3.5">
                          <HelpCircle className="w-10 h-10 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <h2 className="text-sm font-bold text-[#172B4D] uppercase">
                              Secrets Finder & Connection Directory
                            </h2>
                            <p className="text-xs text-[#5E6C84] leading-relaxed max-w-2xl mt-1 font-medium">
                              Find out exactly where to look up your Atlassian Jira and Confluence credentials. Connect with real workspace profiles, projects, tickets, and spaces effortlessly.
                            </p>
                          </div>
                        </div>

                        <div className="bg-white rounded border border-[#DFE1E6] px-3.5 py-2.5 shrink-0 text-center">
                          <p className="text-[10px] text-[#5E6C84] uppercase tracking-widest font-semibold">Current Site</p>
                          <span className="text-xs font-bold text-[#0052CC] font-mono">{directConn?.domain || "demo"}</span>
                        </div>
                      </div>

                      {/* Bento Grid Directory Items */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5.5">
                        {/* Item 1: Jira/Confluence Subdomain prefix */}
                        <div className="bg-white border border-[#DFE1E6] hover:border-[#4c86e0] rounded p-5 flex flex-col justify-between space-y-4 shadow-3xs transition">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-[#0052CC] uppercase tracking-widest">Atlassian Domain</span>
                              <span className="text-[10px] bg-[#EBECF0] text-[#172B4D] px-2 py-0.5 rounded font-mono font-bold">Domain Input</span>
                            </div>
                            <h3 className="text-xs font-bold text-[#091E42] tracking-wider">Where is the Atlassian domain?</h3>
                            <p className="text-[11px] leading-relaxed text-[#5E6C84]">
                              This is your private organization subdomain prefix mapped in your address browser bar when you are actively logged in to your Atlassian profile.
                            </p>
                            <div className="bg-[#FAFBFC] border border-[#DFE1E6] rounded p-3 text-[10px] font-mono leading-relaxed text-[#172B4D]">
                              URL structure: <code className="text-emerald-700 font-bold select-all">https://your-company.atlassian.net/...</code>
                              <br />
                              Here, your subdomain is: <code className="text-indigo-700">your-company.atlassian.net</code>
                            </div>
                          </div>

                          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                            <button
                              onClick={() => handleCopyToClipboard("joblogic.atlassian.net", "copied-domain")}
                              className="px-3 py-1.5 bg-[#F4F5F7] hover:bg-[#EAEAEF] text-[11px] font-semibold rounded font-mono border border-[#DFE1E6] text-[#42526E] hover:text-[#091E42] transition cursor-pointer select-none"
                            >
                              {copiedText === "copied-domain" ? "✓ Copied Preset Domain!" : "Copy joblogic Preset"}
                            </button>
                            <span className="text-[10px] text-[#5E6C84] font-mono">Required for direct calls</span>
                          </div>
                        </div>

                        {/* Item 2: User Account Email */}
                        <div className="bg-white border border-[#DFE1E6] hover:border-[#4c86e0] rounded p-5 flex flex-col justify-between space-y-4 shadow-3xs transition">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-violet-600 uppercase tracking-widest">User Profile Email</span>
                              <span className="text-[10px] bg-[#EBECF0] text-[#172B4D] px-2 py-0.5 rounded font-mono font-bold">Email Input</span>
                            </div>
                            <h3 className="text-xs font-bold text-[#091E42] tracking-wider">Which email should be used?</h3>
                            <p className="text-[11px] leading-relaxed text-[#5E6C84]">
                              Supply the exact personal or enterprise email account address that maps to your Atlassian ID profile. You must have access to spaces and boards.
                            </p>
                            <div className="bg-[#FAFBFC] border border-[#DFE1E6] rounded p-3 text-[10px] font-mono leading-relaxed text-[#172B4D]">
                              Email profile mapping: <code className="text-indigo-700 select-all font-bold">arozi@joblogic.com</code>
                            </div>
                          </div>

                          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                            <button
                              onClick={() => handleCopyToClipboard("arozi@joblogic.com", "copied-email")}
                              className="px-3 py-1.5 bg-[#F4F5F7] hover:bg-[#EAEAEF] text-[11px] font-semibold rounded font-mono border border-[#DFE1E6] text-[#42526E] hover:text-[#091E42] transition cursor-pointer select-none"
                            >
                              {copiedText === "copied-email" ? "✓ Copied Preset Email!" : "Copy arozi Preset"}
                            </button>
                            <span className="text-[10px] text-[#5E6C84] font-mono">Case-sensitive matching</span>
                          </div>
                        </div>

                        {/* Item 3: Jira Secrets API Token */}
                        <div className="bg-white border border-[#DFE1E6] hover:border-[#4c86e0] rounded p-5 flex flex-col justify-between space-y-4 shadow-3xs transition">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Atlassian API Secrets Token</span>
                              <span className="text-[10px] bg-[#FFFAE6] border border-[#FFE380] text-amber-700 px-2 py-0.5 rounded font-mono font-bold">API Token Input</span>
                            </div>
                            <h3 className="text-xs font-bold text-[#091E42] tracking-wider">How to create Jira API security tokens?</h3>
                            <p className="text-[11px] leading-relaxed text-[#5E6C84]">
                              Do NOT enter your login password. Atlassian requires an authenticated API token for third-party client integrations.
                            </p>
                            <ol className="text-[10px] space-y-1 bg-[#FAFBFC] border border-[#DFE1E6] rounded p-3 pr-1 list-decimal list-inside text-[#172B4D]">
                              <li>Go to <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" className="text-[#0052CC] underline inline-flex items-center gap-0.5 font-semibold">id.atlassian.com/manage-profile/security/api-tokens <ExternalLink className="w-2.5 h-2.5" /></a></li>
                              <li>Click the <b className="text-[#091E42]">"Create API token"</b> button</li>
                              <li>Enter label (e.g. Jira Dashboard Explorer), copy the code string</li>
                            </ol>
                          </div>

                          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                            <button
                              onClick={() => handleCopyToClipboard("Please generate your own API token from id.atlassian.com and paste it here.", "copied-token")}
                              className="px-3 py-1.5 bg-[#F4F5F7] hover:bg-[#EAEAEF] text-[11px] font-semibold rounded font-mono border border-[#DFE1E6] text-[#42526E] hover:text-[#091E42] transition cursor-pointer select-none"
                            >
                              {copiedText === "copied-token" ? "✓ Copied Key!" : "Copy Atlassian Token"}
                            </button>
                            <span className="text-[10px] text-[#5E6C84] font-mono">Starts with "ATATT"</span>
                          </div>
                        </div>

                        {/* Item 4: Jira Project Key list */}
                        <div className="bg-white border border-[#DFE1E6] hover:border-[#4c86e0] rounded p-5 flex flex-col justify-between space-y-4 shadow-3xs transition">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Jira Project Key</span>
                              <span className="text-[10px] bg-[#EBECF0] text-[#172B4D] px-2 py-0.5 rounded font-mono font-bold">Ticket Identifier</span>
                            </div>
                            <h3 className="text-xs font-bold text-[#091E42] tracking-wider">How to locate Jira project keys?</h3>
                            <p className="text-[11px] leading-relaxed text-[#5E6C84]">
                              The project key is the short uppercase abbreviation representing your project tickets in the board (e.g., ticket ID is "MAR-12" where project key is "MAR").
                            </p>
                            <div className="bg-[#FAFBFC] border border-[#DFE1E6] rounded p-3 text-[10px] font-mono leading-relaxed text-[#172B4D]">
                              Find keys at: Jira Navigation &gt; <b className="text-[#091E42]">Projects</b> list.
                              <br />
                              Preset keys: <code className="text-emerald-700 font-bold">MAR</code>, <code className="text-indigo-700 font-bold">DEV</code>, <code className="text-amber-700 font-bold">PROJ</code>
                            </div>
                          </div>

                          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                            <button
                              onClick={() => handleCopyToClipboard("MAR", "copied-key")}
                              className="px-3 py-1.5 bg-[#F4F5F7] hover:bg-[#EAEAEF] text-[11px] font-semibold rounded font-mono border border-[#DFE1E6] text-[#42526E] hover:text-[#091E42] transition cursor-pointer select-none"
                            >
                              {copiedText === "copied-key" ? "✓ Copied 'MAR' Key!" : "Copy 'MAR' Key"}
                            </button>
                            <span className="text-[10px] text-[#5E6C84] font-mono">Alphanumeric prefix</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : activeTab === "profiles" ? (
                /* CONFIGURATION AND COLLABORATING PROFILES PAGE */
                <div id="profiles-manager-panel" className="space-y-6 animate-fade-in max-w-5xl mx-auto font-sans">
                  <div className="bg-white border border-[#DFE1E6] rounded-xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-indigo-50 border border-indigo-200 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                        <Users className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-[#091E42]">My Profile Connection Manager</h2>
                        <p className="text-[11px] text-[#5E6C84] mt-1 leading-relaxed max-w-xl font-medium">
                          Securely store and swap between credential profiles for multiple workspaces. Your access codes, API tokens, and domains are saved securely on the server, segregated by your user account.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setProfileFormName("");
                        setProfileFormAuthType("basic");
                        setProfileFormDomain("");
                        setProfileFormEmail("");
                        setProfileFormToken("");
                        setShowAddProfileForm(!showAddProfileForm);
                        setProfileMessage(null);
                      }}
                      className="px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition select-none cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{showAddProfileForm ? "Close Form" : "Create New Profile"}</span>
                    </button>
                  </div>

                  {profileMessage && (
                    <div className="bg-[#DEEBFF] text-[#0052CC] border border-[#B3D4FF] p-4 rounded-lg text-xs leading-relaxed font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Info className="w-4 h-4 shrink-0" />
                        {profileMessage}
                      </span>
                      <button onClick={() => setProfileMessage(null)} className="text-[#0747A6] hover:underline font-bold text-xs">Dismiss</button>
                    </div>
                  )}

                  {/* Add New Profile Section */}
                  {showAddProfileForm && (
                    <div className="bg-white border border-[#DFE1E6] rounded-xl p-6 shadow-xs space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#0052CC] flex items-center gap-1.5 pb-2 border-b border-slate-100">
                        <KeyRound className="w-4 h-4" /> Add Team User Connection Profile
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-[#42526E]">Profile Label Name</label>
                          <input
                            type="text"
                            placeholder="e.g. Aroz Imran (Jira Personal)"
                            value={profileFormName}
                            onChange={(e) => setProfileFormName(e.target.value)}
                            className="w-full px-3 py-2 bg-white hover:bg-slate-50 focus:bg-white border border-[#DFE1E6] focus:border-[#0052CC] focus:ring-2 focus:ring-[#DEEBFF]/30 rounded text-xs text-[#091E42] placeholder-slate-400 outline-none transition"
                            required
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-[#42526E]">Authorization Scheme Method</label>
                          <select
                            value={profileFormAuthType}
                            onChange={(e) => setProfileFormAuthType(e.target.value as JIRA_AUTH_TYPE)}
                            className="w-full px-3 py-2 bg-white hover:bg-slate-50 border border-[#DFE1E6] focus:border-[#0052CC] rounded text-xs text-[#091E42] font-semibold outline-none cursor-pointer"
                          >
                            <option value="basic">Atlassian API Developer Token (Direct)</option>
                            <option value="oauth">Atlassian Three-Legged OAuth 2.0</option>
                            <option value="demo">Demo Sandbox Simulator (No credentials needed)</option>
                          </select>
                        </div>
                      </div>

                      {profileFormAuthType === "basic" && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-[#DFE1E6]/40 pt-4 animate-fade-in">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-[#42526E]">Jira Cloud DomainPrefix</label>
                            <input
                              type="text"
                              placeholder="company.atlassian.net"
                              value={profileFormDomain}
                              onChange={(e) => setProfileFormDomain(e.target.value)}
                              className="w-full px-3 py-2 bg-white hover:bg-slate-50 focus:bg-white border border-[#DFE1E6] focus:border-[#0052CC] rounded text-xs text-[#091E42] placeholder-slate-400 outline-none transition"
                            />
                            <p className="text-[10px] text-[#5E6C84]">e.g. joblogic.atlassian.net</p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-[#42526E]">Email username</label>
                            <input
                              type="email"
                              placeholder="user@domain.com"
                              value={profileFormEmail}
                              onChange={(e) => setProfileFormEmail(e.target.value)}
                              className="w-full px-3 py-2 bg-white hover:bg-slate-50 focus:bg-white border border-[#DFE1E6] focus:border-[#0052CC] rounded text-xs text-[#091E42] placeholder-slate-400 outline-none transition"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-[#42526E]">API Security Token</label>
                            <input
                              type="password"
                              placeholder="ATATT... developer token"
                              value={profileFormToken}
                              onChange={(e) => setProfileFormToken(e.target.value)}
                              className="w-full px-3 py-2 bg-white hover:bg-slate-50 focus:bg-white border border-[#DFE1E6] focus:border-[#0052CC] rounded text-xs text-[#091E42] placeholder-slate-400 outline-none transition"
                            />
                          </div>
                        </div>
                      )}

                      {profileFormAuthType === "oauth" && (
                        <div className="bg-[#DFE1E6]/40 border border-[#DFE1E6] p-4 rounded text-xs text-[#172B4D] space-y-2 leading-relaxed animate-fade-in">
                          <p className="font-semibold text-[#091E42]">Atlassian Consent Flow Requirements:</p>
                          <p>Saving a profile initializes an OAuth placeholder context. To bind live security keys, hit "Authenticate Atlassian Profile" on the setup dashboard form once this profile is activated.</p>
                        </div>
                      )}

                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => {
                            if (!profileFormName.trim()) {
                              setProfileMessage("Please supply a valid profile name identifier.");
                              return;
                            }

                            const newId = `profile-${Date.now()}`;
                            const newProfile: UserProfile = {
                              id: newId,
                              name: profileFormName.trim(),
                              authType: profileFormAuthType,
                              directConn: profileFormAuthType === "basic" ? {
                                domain: profileFormDomain.trim() || "joblogic.atlassian.net",
                                email: profileFormEmail.trim() || "arozi@joblogic.com",
                                apiToken: profileFormToken.trim() || ""
                              } : null,
                              oauthTokens: null,
                              selectedSite: null,
                              geminiApiKey: profileFormGeminiKey.trim() || null
                            };

                            setProfiles(prev => [...prev, newProfile]);
                            setShowAddProfileForm(false);
                            setProfileMessage(`Swapped to new user profile "${profileFormName.trim()}"! loading environment context.`);
                            handleSwitchProfile(newId);
                          }}
                          className="px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-xs font-semibold rounded-md transition cursor-pointer select-none"
                        >
                          Save Credentials Profile
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Active Profile AI Settings Configuration Panel */}
                  <div className="bg-[#FAFBFC] border border-[#DFE1E6] rounded-xl p-5 shadow-xs space-y-4">
                    <div className="flex items-center gap-1.5 pb-2 border-b border-slate-200">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      <h4 className="text-xs font-bold text-[#091E42] uppercase tracking-wide">
                        Active Profile AI Settings
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Provider selection */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-[#42526E]">AI Model Provider</label>
                        <select
                          value={selectedModelProvider || "google"}
                          onChange={(e) => {
                            const prov = e.target.value;
                            setSelectedModelProvider(prov);
                            setSelectedModelName(prov === "google" ? "gemini-3.5-flash" : "gpt-5.5");
                          }}
                          className="w-full px-3 py-2 bg-white hover:bg-slate-50 border border-[#DFE1E6] focus:border-[#0052CC] rounded-lg text-xs text-[#091E42] outline-none transition cursor-pointer"
                        >
                          <option value="google">Google Gemini</option>
                          <option value="openai">OpenAI</option>
                        </select>
                      </div>

                      {/* Model selection */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-[#42526E]">AI Model Version</label>
                        <select
                          value={selectedModelName || (selectedModelProvider === "google" ? "gemini-3.5-flash" : "gpt-5.5")}
                          onChange={(e) => setSelectedModelName(e.target.value)}
                          className="w-full px-3 py-2 bg-white hover:bg-slate-50 border border-[#DFE1E6] focus:border-[#0052CC] rounded-lg text-xs text-[#091E42] outline-none transition cursor-pointer"
                        >
                          {selectedModelProvider === "google" ? (
                            <>
                              <option value="gemini-3.5-flash">Gemini 3.5 Flash (Fast/Default)</option>
                              <option value="gemini-3.5-pro">Gemini 3.5 Pro (Reasoning Flagship)</option>
                              <option value="gemini-3.1-pro">Gemini 3.1 Pro (Legacy Flagship)</option>
                            </>
                          ) : (
                            <>
                              <option value="gpt-5.5">GPT-5.5 (Flagship)</option>
                              <option value="gpt-5.2">GPT-5.2 (Legacy 2026)</option>
                              <option value="gpt-4.5">GPT-4.5 (Legacy)</option>
                            </>
                          )}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Google key */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-[#42526E]">Google Gemini API Key</label>
                        <div className="relative">
                          <KeyRound className="w-4 h-4 text-[#5E6C84] absolute left-3 top-1/2 transform -translate-y-1/2" />
                          <input
                            type="password"
                            placeholder="AIzaSy... (empty to use server default)"
                            value={geminiApiKey || ""}
                            onChange={(e) => setGeminiApiKey(e.target.value || null)}
                            className="w-full pl-9 pr-3 py-2 bg-white border border-[#DFE1E6] focus:border-[#0052CC] rounded-lg text-xs text-[#091E42] outline-none transition shadow-2xs"
                          />
                        </div>
                      </div>

                      {/* OpenAI key */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-[#42526E]">OpenAI API Key</label>
                        <div className="relative">
                          <KeyRound className="w-4 h-4 text-[#5E6C84] absolute left-3 top-1/2 transform -translate-y-1/2" />
                          <input
                            type="password"
                            placeholder="sk-... (empty to use server default)"
                            value={openaiApiKey || ""}
                            onChange={(e) => setOpenaiApiKey(e.target.value || null)}
                            className="w-full pl-9 pr-3 py-2 bg-white border border-[#DFE1E6] focus:border-[#0052CC] rounded-lg text-xs text-[#091E42] outline-none transition shadow-2xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Profile Cards Grid list */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {profiles.map((prf) => {
                      const isActive = prf.id === activeProfileId;
                      return (
                        <div
                          key={prf.id}
                          className={`bg-white border rounded-xl overflow-hidden shadow-2xs flex flex-col justify-between transition ${isActive ? "border-[#0052CC] ring-2 ring-[#DEEBFF] hover:border-[#0747A6]" : "border-[#DFE1E6] hover:border-[#0052CC]/40"}`}
                        >
                          <div className="p-5 space-y-3.5">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center space-x-2.5">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${isActive ? "bg-[#0052CC] text-white" : "bg-[#EBECF0] text-[#172B4D]"}`}>
                                  {prf.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="max-w-[130px] sm:max-w-[170px]">
                                  <h4 className="font-bold text-xs text-[#091E42] truncate" title={prf.name}>{prf.name}</h4>
                                  <span className="text-[9px] uppercase tracking-wider font-mono text-[#5E6C84] block mt-0.5">Scheme: {prf.authType}</span>
                                </div>
                              </div>

                              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${isActive ? "bg-[#EAE6FF] text-[#403294] border border-[#C0B6F2]" : "bg-[#F4F5F7] text-[#5E6C84] border border-[#DFE1E6]"}`}>
                                {isActive ? "ACTIVE" : "IDLE"}
                              </span>
                            </div>

                            <div className="border-t border-[#DFE1E6]/50 pt-2.5 text-[11px] space-y-1.5 text-[#5E6C84]">
                              <div className="flex justify-between">
                                <span>Platform Mode:</span>
                                <span className="font-bold text-[#172B4D] capitalize">{prf.authType === "basic" ? "Jira Direct API Info" : prf.authType === "oauth" ? "Atlassian OAuth App" : "Local Simulator"}</span>
                              </div>
                              {prf.authType === "basic" && prf.directConn && (
                                <>
                                  <div className="flex justify-between">
                                    <span>Cloud domain:</span>
                                    <span className="font-mono text-[#0052CC] truncate max-w-[150px] font-semibold">{prf.directConn.domain}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Email identifier:</span>
                                    <span className="text-[#091E42] truncate max-w-[150px] font-medium">{prf.directConn.email}</span>
                                  </div>
                                </>
                              )}
                              {prf.authType === "oauth" && (
                                <div className="flex justify-between">
                                  <span>Site Mapping:</span>
                                  <span className="font-semibold text-[#091E42]">{prf.selectedSite?.name || "Unconnected Placeholder"}</span>
                                </div>
                              )}
                              {prf.authType === "demo" && (
                                <div className="text-[10px] leading-relaxed italic text-[#5E6C84] pt-0.5 font-medium">
                                  Uses offline preset issues map without hitting network.
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="bg-[#FAFBFC] px-5 py-3 border-t border-[#DFE1E6] flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center">
                              {isActive ? (
                                <span className="text-[10px] text-emerald-600 font-bold inline-flex items-center">
                                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2.5 animate-pulse" />
                                  Currently Connected
                                </span>
                              ) : (
                                <button
                                  onClick={() => {
                                    handleSwitchProfile(prf.id);
                                    setProfileMessage(`Switched connection dashboard environment to "${prf.name}"!`);
                                  }}
                                  className="text-xs px-3 py-1.5 bg-[#F4F5F7] hover:bg-[#DEEBFF] text-[#0052CC] font-bold rounded-md border border-[#DFE1E6] hover:border-[#B3D4FF] cursor-pointer select-none transition flex items-center gap-1 leading-none"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Activate Context</span>
                                </button>
                              )}
                            </div>

                            {!isActive && profiles.length > 1 && (
                              <button
                                onClick={() => {
                                  if (confirm(`Are you sure you want to delete profile "${prf.name}"? This is irreversible.`)) {
                                    deleteProfileBackend(prf.id).then(() => {
                                      setProfiles(prev => prev.filter(p => p.id !== prf.id));
                                      setProfileMessage(`Deleted connection profile "${prf.name}" from your configurations list.`);
                                    }).catch(err => {
                                      setErrorMessage(`Failed to delete profile: ${err.message}`);
                                    });
                                  }
                                }}
                                className="text-[10px] text-rose-600 hover:underline font-bold px-2 py-1 transition cursor-pointer select-none"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* INSTRUCTIONAL BENTO SECRETS DIRECTORY & CREDENTIALS FINDER */
                <div id="credentials-api-directory" className="space-y-6 animate-fade-in text-sans">
                  <div className="bg-[#FFFAE6] border border-[#FFE380] rounded p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start space-x-3.5">
                      <HelpCircle className="w-10 h-10 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <h2 className="text-sm font-bold text-[#172B4D] uppercase">
                          Secrets Finder & Connection Directory
                        </h2>
                        <p className="text-xs text-[#5E6C84] leading-relaxed max-w-2xl mt-1 font-medium">
                          Find out exactly where to look up your Atlassian Jira and Confluence credentials. Connect with real workspace profiles, projects, tickets, and spaces effortlessly.
                        </p>
                      </div>
                    </div>

                    <div className="bg-white rounded border border-[#DFE1E6] px-3.5 py-2.5 shrink-0 text-center">
                      <p className="text-[10px] text-[#5E6C84] uppercase tracking-widest font-semibold">Current Site</p>
                      <span className="text-xs font-bold text-[#0052CC] font-mono">{directConn.domain || "demo"}</span>
                    </div>
                  </div>

                  {/* Bento Grid Directory Items */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5.5">
                    {/* Item 1: Jira/Confluence Subdomain prefix */}
                    <div className="bg-white border border-[#DFE1E6] hover:border-[#4c86e0] rounded p-5 flex flex-col justify-between space-y-4 shadow-3xs transition">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-[#0052CC] uppercase tracking-widest">Atlassian Domain</span>
                          <span className="text-[10px] bg-[#EBECF0] text-[#172B4D] px-2 py-0.5 rounded font-mono font-bold">Domain Input</span>
                        </div>
                        <h3 className="text-xs font-bold text-[#091E42] tracking-wider">Where is the Atlassian domain?</h3>
                        <p className="text-[11px] leading-relaxed text-[#5E6C84]">
                          This is your private organization subdomain prefix mapped in your address browser bar when you are actively logged in to your Atlassian profile.
                        </p>
                        <div className="bg-[#FAFBFC] border border-[#DFE1E6] rounded p-3 text-[10px] font-mono leading-relaxed text-[#172B4D]">
                          URL structure: <code className="text-emerald-700 font-bold select-all">https://your-company.atlassian.net/...</code>
                          <br />
                          Here, your subdomain is: <code className="text-indigo-700">your-company.atlassian.net</code>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                        <button
                          onClick={() => handleCopyToClipboard("joblogic.atlassian.net", "copied-domain")}
                          className="px-3 py-1.5 bg-[#F4F5F7] hover:bg-[#EAEAEF] text-[11px] font-semibold rounded font-mono border border-[#DFE1E6] text-[#42526E] hover:text-[#091E42] transition cursor-pointer select-none"
                        >
                          {copiedText === "copied-domain" ? "✓ Copied Preset Domain!" : "Copy joblogic Preset"}
                        </button>
                        <span className="text-[10px] text-[#5E6C84] font-mono">Required for direct calls</span>
                      </div>
                    </div>

                    {/* Item 2: User Account Email */}
                    <div className="bg-white border border-[#DFE1E6] hover:border-[#4c86e0] rounded p-5 flex flex-col justify-between space-y-4 shadow-3xs transition">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-violet-600 uppercase tracking-widest">User Profile Email</span>
                          <span className="text-[10px] bg-[#EBECF0] text-[#172B4D] px-2 py-0.5 rounded font-mono font-bold">Email Input</span>
                        </div>
                        <h3 className="text-xs font-bold text-[#091E42] tracking-wider">Which email should be used?</h3>
                        <p className="text-[11px] leading-relaxed text-[#5E6C84]">
                          Supply the exact personal or enterprise email account address that maps to your Atlassian ID profile. You must have access to spaces and boards.
                        </p>
                        <div className="bg-[#FAFBFC] border border-[#DFE1E6] rounded p-3 text-[10px] font-mono leading-relaxed text-[#172B4D]">
                          Email profile mapping: <code className="text-indigo-700 select-all font-bold">arozi@joblogic.com</code>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                        <button
                          onClick={() => handleCopyToClipboard("arozi@joblogic.com", "copied-email")}
                          className="px-3 py-1.5 bg-[#F4F5F7] hover:bg-[#EAEAEF] text-[11px] font-semibold rounded font-mono border border-[#DFE1E6] text-[#42526E] hover:text-[#091E42] transition cursor-pointer select-none"
                        >
                          {copiedText === "copied-email" ? "✓ Copied Preset Email!" : "Copy arozi Preset"}
                        </button>
                        <span className="text-[10px] text-[#5E6C84] font-mono">Case-sensitive matching</span>
                      </div>
                    </div>

                    {/* Item 3: Jira Secrets API Token */}
                    <div className="bg-white border border-[#DFE1E6] hover:border-[#4c86e0] rounded p-5 flex flex-col justify-between space-y-4 shadow-3xs transition">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Atlassian API Secrets Token</span>
                          <span className="text-[10px] bg-[#FFFAE6] border border-[#FFE380] text-amber-700 px-2 py-0.5 rounded font-mono font-bold">API Token Input</span>
                        </div>
                        <h3 className="text-xs font-bold text-[#091E42] tracking-wider">How to create Jira API security tokens?</h3>
                        <p className="text-[11px] leading-relaxed text-[#5E6C84]">
                          Do NOT enter your login password. Atlassian requires an authenticated API token for third-party client integrations.
                        </p>
                        <ol className="text-[10px] space-y-1 bg-[#FAFBFC] border border-[#DFE1E6] rounded p-3 pr-1 list-decimal list-inside text-[#172B4D]">
                          <li>Go to <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" className="text-[#0052CC] underline inline-flex items-center gap-0.5 font-semibold">id.atlassian.com/manage-profile/security/api-tokens <ExternalLink className="w-2.5 h-2.5" /></a></li>
                          <li>Click the <b className="text-[#091E42]">"Create API token"</b> button</li>
                          <li>Enter label (e.g. Jira Dashboard Explorer), copy the code string</li>
                        </ol>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                        <button
                          onClick={() => handleCopyToClipboard("Please generate your own API token from id.atlassian.com and paste it here.", "copied-token")}
                          className="px-3 py-1.5 bg-[#F4F5F7] hover:bg-[#EAEAEF] text-[11px] font-semibold rounded font-mono border border-[#DFE1E6] text-[#42526E] hover:text-[#091E42] transition cursor-pointer select-none"
                        >
                          {copiedText === "copied-token" ? "✓ Copied Key!" : "Copy Atlassian Token"}
                        </button>
                        <span className="text-[10px] text-[#5E6C84] font-mono">Starts with "ATATT"</span>
                      </div>
                    </div>

                    {/* Item 4: Jira Project Key list */}
                    <div className="bg-white border border-[#DFE1E6] hover:border-[#4c86e0] rounded p-5 flex flex-col justify-between space-y-4 shadow-3xs transition">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Jira Project Key</span>
                          <span className="text-[10px] bg-[#EBECF0] text-[#172B4D] px-2 py-0.5 rounded font-mono font-bold">Ticket Identifier</span>
                        </div>
                        <h3 className="text-xs font-bold text-[#091E42] tracking-wider">How to locate Jira project keys?</h3>
                        <p className="text-[11px] leading-relaxed text-[#5E6C84]">
                          The project key is the short uppercase abbreviation representing your project tickets in the board (e.g., ticket ID is "MAR-12" where project key is "MAR").
                        </p>
                        <div className="bg-[#FAFBFC] border border-[#DFE1E6] rounded p-3 text-[10px] font-mono leading-relaxed text-[#172B4D]">
                          Find keys at: Jira Navigation &gt; <b className="text-[#091E42]">Projects</b> list.
                          <br />
                          Preset keys: <code className="text-emerald-700 font-bold">MAR</code>, <code className="text-indigo-700 font-bold">DEV</code>, <code className="text-amber-700 font-bold">PROJ</code>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                        <button
                          onClick={() => handleCopyToClipboard("MAR", "copied-key")}
                          className="px-3 py-1.5 bg-[#F4F5F7] hover:bg-[#EAEAEF] text-[11px] font-semibold rounded font-mono border border-[#DFE1E6] text-[#42526E] hover:text-[#091E42] transition cursor-pointer select-none"
                        >
                          {copiedText === "copied-key" ? "✓ Copied 'MAR' Key!" : "Copy 'MAR' Key"}
                        </button>
                        <span className="text-[10px] text-[#5E6C84] font-mono">Alphanumeric prefix</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: CREATE NEW TICKET IN DRAWER FORM */}
      {showCreateModal && selectedProject && (
        <div id="create-modal-container" className="fixed inset-0 bg-[#091E42]/50 backdrop-blur-xs z-50 flex justify-end">
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            className="w-full max-w-lg bg-white border-l border-[#DFE1E6] h-full p-6 shadow-2xl flex flex-col overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#DFE1E6] pb-4 mb-5">
              <div className="flex items-center space-x-2">
                <Bookmark className="w-5 h-5 text-[#0052CC]" />
                <h3 className="text-base font-bold text-[#091E42]">
                  Create New Issue on {selectedProject.key}
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 px-2.5 hover:bg-[#F4F5F7] rounded text-[#5E6C84] hover:text-[#091E42] transition"
              >
                ✕
              </button>
            </div>

            {/* Action Form */}
            <form onSubmit={handleCreateIssue} className="space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                {/* Summary */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#172B4D]">Summary title</label>
                  <input
                    type="text"
                    required
                    placeholder="E.g., Implement backend OAuth authorization token endpoint"
                    value={newSummary}
                    onChange={(e) => setNewSummary(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-[#DFE1E6] focus:border-[#0052CC] rounded text-xs text-[#091E42] placeholder-slate-400 outline-none transition"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#172B4D]">Description detail</label>
                  <textarea
                    rows={4}
                    placeholder="Describe testing constraints, requirements, and deliverables..."
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-[#DFE1E6] focus:border-[#0052CC] rounded text-xs text-[#091E42] placeholder-slate-400 outline-none transition resize-none"
                  />
                </div>

                {/* Row: Priority, Issue Type */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#172B4D]">Issue Type</label>
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value)}
                      className="w-full bg-white border border-[#DFE1E6] text-[#091E42] text-xs rounded p-2 outline-none cursor-pointer hover:bg-[#FAFBFC] transition"
                    >
                      <option value="Task">Task</option>
                      <option value="Bug">Bug</option>
                      <option value="Story">Story</option>
                      <option value="Epic">Epic</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#172B4D]">Priority</label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value)}
                      className="w-full bg-white border border-[#DFE1E6] text-[#091E42] text-xs rounded p-2 outline-none cursor-pointer hover:bg-[#FAFBFC] transition"
                    >
                      <option value="Highest">Highest</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                      <option value="Lowest">Lowest</option>
                    </select>
                  </div>
                </div>

                {/* Assignee */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#172B4D]">Assignee</label>
                  <select
                    value={newAssigneeId}
                    onChange={(e) => setNewAssigneeId(e.target.value)}
                    className="w-full bg-white border border-[#DFE1E6] text-[#091E42] text-xs rounded p-2 outline-none cursor-pointer hover:bg-[#FAFBFC] transition"
                  >
                    <option value="">Unassigned</option>
                    {DEMO_USERS.map(user => (
                      <option key={user.accountId} value={user.accountId}>
                        {user.displayName} ({user.emailAddress})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action dock */}
              <div className="pt-8 border-t border-[#DFE1E6] flex items-center justify-end space-x-3 mt-8">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-1.5 bg-[#EBECF0] hover:bg-[#DFE1E6] text-[#42526E] rounded text-xs transition font-semibold hover:text-[#091E42]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-1.5 bg-[#0052CC] hover:bg-[#0747A6] text-white rounded text-xs transition font-semibold"
                >
                  {isLoading ? "Creating..." : "Save Ticket"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL 2: TICKET DETAIL SLIDE-OVER DETAILS AND COMMENT FLOW */}
      {selectedIssue && (
        <div id="issuedetail-modal-backdrop" className="fixed inset-0 bg-[#091E42]/50 backdrop-blur-xs z-50 flex justify-end">
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            className="w-full max-w-xl bg-white border-l border-[#DFE1E6] h-full shadow-2xl flex flex-col"
          >
            {/* Upper Drawer Header */}
            <div className="px-6 py-4 border-b border-[#DFE1E6] flex items-center justify-between bg-white">
              <div className="flex items-center space-x-3">
                <div className={`text-[10px] uppercase font-bold font-mono px-2 py-0.5 border rounded-md ${getTypeIconColor(selectedIssue.fields.issuetype?.name)}`}>
                  {selectedIssue.fields.issuetype?.name}
                </div>
                <span className="text-xs text-[#5E6C84] font-mono font-bold select-all">{selectedIssue.key}</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setSelectedIssue(null)}
                  className="p-1 px-3 hover:bg-[#F4F5F7] rounded text-[#5E6C84] hover:text-[#091E42] text-sm font-semibold transition"
                >
                  Close ✕
                </button>
              </div>
            </div>

            {/* Core container body divided into tabs or scrolling panel */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
              {/* Title Header text */}
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#091E42] select-text leading-snug">
                  {selectedIssue.fields.summary}
                </h3>
                <p className="text-[10.5px] text-[#5E6C84] flex items-center gap-1 font-semibold">
                  <span>Created {new Date(selectedIssue.fields.created).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>Updated {new Date(selectedIssue.fields.updated).toLocaleDateString()}</span>
                </p>
              </div>

              {/* Status & transition selectors */}
              <div className="grid grid-cols-2 gap-4 bg-[#FAFBFC] p-4 rounded border border-[#DFE1E6] text-xs">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-[#5E6C84] uppercase font-mono">Status</span>
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="font-bold text-[#172B4D]">{selectedIssue.fields.status?.name}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-[#5E6C84] uppercase font-mono">Update Status</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {boardStatuses
                      .filter(s => s.toLowerCase() !== selectedIssue.fields.status?.name?.toLowerCase())
                      .map(s => (
                        <button
                          key={s}
                          onClick={() => transitionIssueStatus(selectedIssue.key, s)}
                          className="px-2 py-1 bg-[#F4F5F7] hover:bg-[#EBECF0] border border-[#DFE1E6] rounded text-[10px] font-semibold text-[#42526E] hover:text-[#091E42] transition"
                        >
                          → {s}
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              {/* Issue Description detail */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[#5E6C84] uppercase tracking-wider">Description</h4>
                <div className="bg-[#FAFBFC] p-4 rounded border border-[#DFE1E6] text-[#172B4D] leading-relaxed max-h-48 overflow-y-auto whitespace-pre-line select-text text-xs font-medium font-sans">
                  {extractJiraText(selectedIssue.fields.description) || "No description provided."}
                </div>
              </div>

              {/* Metadata Details grids: Priority, Reporter, Assignee */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#FAFBFC] border border-[#DFE1E6] rounded p-3 flex flex-col justify-between h-16">
                  <span className="text-[9.5px] font-bold text-[#5E6C84] uppercase font-mono">Priority</span>
                  <span className={`text-[11px] font-mono font-bold ${selectedIssue.fields.priority?.name?.toLowerCase() === 'highest' ? 'text-rose-600' : 'text-[#172B4D]'}`}>
                    {selectedIssue.fields.priority?.name}
                  </span>
                </div>

                <div className="bg-[#FAFBFC] border border-[#DFE1E6] rounded p-3 flex flex-col justify-between h-16">
                  <span className="text-[9.5px] font-bold text-[#5E6C84] uppercase font-mono">Reporter</span>
                  <span className="text-[11px] text-[#172B4D] font-bold truncate">
                    {selectedIssue.fields.reporter?.displayName || "System Owner"}
                  </span>
                </div>

                <div className="bg-[#FAFBFC] border border-[#DFE1E6] rounded p-3 flex flex-col justify-between h-16">
                  <span className="text-[9.5px] font-bold text-[#5E6C84] uppercase font-mono">Assignee</span>
                  <span className="text-[11px] text-[#0052CC] font-bold truncate">
                    {selectedIssue.fields.assignee?.displayName || "Unassigned"}
                  </span>
                </div>
              </div>

              {/* Time Tracking Widget */}
              {(() => {
                const tracking = selectedIssue.fields.timetracking || {
                  originalEstimate: "0m",
                  remainingEstimate: "0m",
                  timeSpent: "0m",
                  originalEstimateSeconds: 0,
                  remainingEstimateSeconds: 0,
                  timeSpentSeconds: 0
                };

                const spentSeconds = tracking.timeSpentSeconds || parseTimeSpentToSeconds(tracking.timeSpent || "0m") || 0;
                const remainingSeconds = tracking.remainingEstimateSeconds || parseTimeSpentToSeconds(tracking.remainingEstimate || "0m") || 0;
                const originalSeconds = tracking.originalEstimateSeconds || parseTimeSpentToSeconds(tracking.originalEstimate || "0m") || (spentSeconds + remainingSeconds) || 28800; // 8h default

                const totalEstim = Math.max(originalSeconds, spentSeconds + remainingSeconds, 1);
                const progressPercentage = Math.min(100, Math.round((spentSeconds / totalEstim) * 100));

                return (
                  <div className="bg-[#FAFBFC] p-4 rounded border border-[#DFE1E6] space-y-3.5">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0052CC]" />
                        <span className="text-[10px] font-bold text-[#5E6C84] uppercase tracking-wider">Time Tracking</span>
                      </div>
                      
                      {!isEditingEstimates ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditOriginalEstimate(tracking.originalEstimate || formatSecondsToJiraTime(originalSeconds));
                            setEditRemainingEstimate(tracking.remainingEstimate || formatSecondsToJiraTime(remainingSeconds));
                            setIsEditingEstimates(true);
                          }}
                          className="text-[9.5px] font-bold text-[#0052CC] hover:text-[#0747A6] uppercase tracking-wide cursor-pointer flex items-center gap-1"
                        >
                          ✎ Adjust Estimates
                        </button>
                      ) : (
                        <span className="text-[9px] text-[#5E6C84] uppercase font-bold">Editing...</span>
                      )}
                    </div>

                    {isEditingEstimates ? (
                      <form onSubmit={handleUpdateEstimates} className="space-y-3 bg-white p-3 rounded border border-[#DFE1E6] relative animate-fade-in text-[11px]">
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="space-y-1">
                            <label className="text-[9px] text-[#5E6C84] uppercase font-semibold">Original Est.</label>
                            <input
                              type="text"
                              value={editOriginalEstimate}
                              onChange={(e) => setEditOriginalEstimate(e.target.value)}
                              placeholder="e.g. 1d 4h"
                              className="w-full bg-white border border-[#DFE1E6] focus:border-[#0052CC] px-2.5 py-1 text-xs rounded text-[#172B4D] outline-none font-mono"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] text-[#5E6C84] uppercase font-semibold">Remaining</label>
                            <input
                              type="text"
                              value={editRemainingEstimate}
                              onChange={(e) => setEditRemainingEstimate(e.target.value)}
                              placeholder="e.g. 4h 30m"
                              className="w-full bg-white border border-[#DFE1E6] focus:border-[#0052CC] px-2.5 py-1 text-xs rounded text-[#172B4D] outline-none font-mono"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => setIsEditingEstimates(false)}
                            className="px-2 py-1 bg-[#EBECF0] text-[#42526E] hover:text-[#091E42] text-[10px] rounded cursor-pointer font-semibold"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isSavingEstimates}
                            className="px-2.5 py-1 bg-[#0052CC] hover:bg-[#0747A6] text-white font-bold text-[10px] rounded cursor-pointer disabled:opacity-40"
                          >
                            {isSavingEstimates ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-2">
                        {/* Progress Bar */}
                        <div className="w-full bg-[#EBECF0] h-2 rounded overflow-hidden border border-[#DFE1E6]">
                          <motion.div
                            className="bg-[#0052CC] h-full rounded"
                            style={{ width: `${progressPercentage}%` }}
                          />
                        </div>

                        {/* Visual breakdown metrics */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-white p-2 rounded border border-[#DFE1E6] text-left shadow-3xs">
                            <span className="text-[8.5px] text-[#5E6C84] font-bold uppercase block">Original Est.</span>
                            <span className="text-xs font-bold text-[#172B4D] font-mono truncate block">
                              {tracking.originalEstimate || formatSecondsToJiraTime(originalSeconds)}
                            </span>
                          </div>
                          <div className="bg-white p-2 rounded border border-[#DFE1E6] text-left shadow-3xs">
                            <span className="text-[8.5px] text-[#5E6C84] font-bold uppercase block">Spent</span>
                            <span className="text-xs font-bold text-[#0052CC] font-mono truncate block">
                              {tracking.timeSpent || formatSecondsToJiraTime(spentSeconds)}
                            </span>
                          </div>
                          <div className="bg-white p-2 rounded border border-[#DFE1E6] text-left shadow-3xs">
                            <span className="text-[8.5px] text-[#5E6C84] font-bold uppercase block">Remaining</span>
                            <span className="text-xs font-bold text-[#42526E] font-mono truncate block">
                              {tracking.remainingEstimate || formatSecondsToJiraTime(remainingSeconds)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Tab Selector */}
              <div className="flex border-b border-[#DFE1E6] space-x-4">
                <button
                  type="button"
                  onClick={() => setIssueDetailTab("comments")}
                  className={`pb-2.5 text-xs font-bold uppercase tracking-wider transition-all relative cursor-pointer ${
                    issueDetailTab === "comments" ? "text-[#0052CC]" : "text-[#5E6C84] hover:text-[#172B4D]"
                  }`}
                >
                  Comments ({selectedIssue.fields.comment?.comments?.length || 0})
                  {issueDetailTab === "comments" && (
                    <motion.div layoutId="activeDetailLine" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0052CC]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIssueDetailTab("worklogs")}
                  className={`pb-2.5 text-xs font-bold uppercase tracking-wider transition-all relative cursor-pointer ${
                    issueDetailTab === "worklogs" ? "text-purple-600" : "text-[#5E6C84] hover:text-[#172B4D]"
                  }`}
                >
                  Worklogs ({issueWorklogs.length})
                  {issueDetailTab === "worklogs" && (
                    <motion.div layoutId="activeDetailLine" className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600" />
                  )}
                </button>
              </div>

              {issueDetailTab === "comments" ? (
                /* Comments stream section */
                <div className="space-y-4 pt-1 animate-fade-in">
                  {/* Posting form input */}
                  <form onSubmit={handleAddComment} className="flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Refine logs or add updates regarding this ticket..."
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-[#DFE1E6] focus:border-[#0052CC] rounded text-xs placeholder-slate-400 text-[#172B4D] outline-none transition"
                    />
                    <button
                      type="submit"
                      disabled={isPostingComment || !newCommentText.trim()}
                      className="px-3 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white rounded text-xs transition font-semibold shrink-0 disabled:opacity-40 cursor-pointer"
                    >
                      Post 
                    </button>
                  </form>

                  {/* Display list of posted comments */}
                  <div className="space-y-3.5 max-h-60 overflow-y-auto pr-1">
                    {!selectedIssue.fields.comment?.comments || selectedIssue.fields.comment.comments.length === 0 ? (
                      <p className="text-[11px] text-[#5E6C84] italic pl-1">No comments recorded on this issue yet.</p>
                    ) : (
                      selectedIssue.fields.comment.comments.map((comm) => (
                        <div key={comm.id} className="bg-[#FAFBFC] p-3.5 rounded border border-[#DFE1E6] text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div className="w-5 h-5 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center">
                                {comm.author?.avatarUrls?.["48x48"] ? (
                                  <img src={comm.author.avatarUrls["48x48"]} alt={comm.author.displayName} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[9px] font-bold text-slate-800">{comm.author?.displayName?.[0] || 'U'}</span>
                                )}
                              </div>
                              <span className="font-bold text-[#172B4D]">{comm.author?.displayName}</span>
                            </div>
                            <span className="text-[10px] text-[#5E6C84] font-semibold">
                              {new Date(comm.created).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-[#172B4D] leading-normal font-sans pl-1 whitespace-pre-wrap select-text font-semibold">
                            {extractJiraText(comm.body)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                /* Worklogs section */
                <div className="space-y-4 pt-1 animate-fade-in">
                  {/* Log Work Form */}
                  <form onSubmit={handleAddWorklog} className="space-y-2.5 bg-[#FAFBFC] p-3.5 rounded border border-[#DFE1E6]">
                    <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Log New Work</p>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <div className="col-span-1">
                        <input
                          type="text"
                          required
                          placeholder="e.g., 2h 30m"
                          value={newWorklogTime}
                          onChange={(e) => setNewWorklogTime(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-[#DFE1E6] text-xs rounded text-[#172B4D] outline-none focus:border-[#0052CC] placeholder-slate-400 font-mono"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="text"
                          placeholder="What did you get done?"
                          value={newWorklogComment}
                          onChange={(e) => setNewWorklogComment(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-[#DFE1E6] text-xs rounded text-[#172B4D] outline-none focus:border-[#0052CC] placeholder-slate-400"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isPostingWorklog || !newWorklogTime.trim()}
                        className="px-3.5 py-1.5 bg-[#0052CC] hover:bg-[#0747A6] text-white font-bold rounded text-xs transition disabled:opacity-40 cursor-pointer"
                      >
                        {isPostingWorklog ? "Logging..." : "Log Work"}
                      </button>
                    </div>
                  </form>

                  {/* List of worklogs */}
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {isLoadingWorklogs ? (
                      <p className="text-[11px] text-[#5E6C84] font-mono italic pl-1">Fetching official worklogs...</p>
                    ) : issueWorklogs.length === 0 ? (
                      <p className="text-[11px] text-[#5E6C84] italic pl-1">No worklogs logged on this issue yet.</p>
                    ) : (
                      issueWorklogs.slice().reverse().map((wl: any) => (
                        <div key={wl.id} className="bg-[#FAFBFC] p-3.5 rounded border border-[#DFE1E6] text-xs space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              {/* Avatar or Placeholder */}
                              <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
                                {wl.author?.avatarUrls?.["48x48"] ? (
                                  <img src={wl.author.avatarUrls["48x48"]} alt={wl.author.displayName} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[9px] font-bold text-slate-800 font-mono">{wl.author?.displayName?.[0] || 'U'}</span>
                                )}
                              </div>
                              <div>
                                <span className="font-bold text-[#172B4D] block leading-none">{wl.author?.displayName || "Atlassian User"}</span>
                                <span className="text-[8.5px] text-[#5E6C84] block mt-0.5 truncate max-w-[150px] font-semibold">{wl.author?.accountId || "Unified Access"}</span>
                              </div>
                            </div>
                            <div className="text-right flex flex-col items-end">
                              <span className="px-2 py-0.5 bg-[#EAE6FF] border border-[#C0B6F2] text-[#403294] text-[10px] font-bold rounded">
                                {wl.timeSpent}
                              </span>
                              <span className="text-[9px] text-[#5E6C84] font-mono mt-0.5">
                                {new Date(wl.created).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          {wl.comment && (
                            <p className="text-[#172B4D] leading-relaxed font-sans pl-1 whitespace-pre-wrap select-text border-l border-[#DFE1E6] pl-2 font-medium">
                              {extractJiraText(wl.comment)}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* JIRA AI CO-PILOT SLIDING DRAWER PANEL */}
      <AnimatePresence>
        {isAiOpen && (
          <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAiOpen(false)}
              className="absolute inset-0 bg-[#091E42]/50 cursor-pointer backdrop-blur-[2px]"
            />

            {/* Slide-out Floating Panel */}
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative w-full max-w-md bg-white border border-[#DFE1E6] shadow-2xl flex flex-col m-4 rounded-2xl overflow-hidden resize"
              style={{ height: 'calc(100vh - 32px)', minWidth: '320px', minHeight: '400px' }}
            >
              {/* Drawer Header */}
              <div className="p-4 bg-[#FAFBFC] border-b border-[#DFE1E6] flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-[#EAE6FF] border border-[#C0B6F2] flex items-center justify-center text-[#403294]">
                    <Users className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#091E42] flex items-center gap-1.5 leading-none">
                      AI Product Ops Team
                      <Sparkles className="w-3.5 h-3.5 text-[#0052CC]" />
                    </h3>
                    <p className="text-[10px] text-[#5E6C84] mt-0.5 uppercase tracking-wide font-bold">
                      Context: {selectedProject ? `${selectedProject.name} (${selectedProject.key})` : "No Selected Project"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                    className={`w-7 h-7 rounded border flex items-center justify-center transition cursor-pointer ${
                      isHistoryOpen 
                        ? "bg-[#EAE6FF] border-[#C0B6F2] text-[#403294]" 
                        : "bg-[#F4F5F7] hover:bg-[#EBECF0] border-[#DFE1E6] text-[#5E6C84] hover:text-[#091E42]"
                    }`}
                    title="Chat History"
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAiOpen(false)}
                    className="w-7 h-7 rounded bg-[#F4F5F7] hover:bg-[#EBECF0] border border-[#DFE1E6] flex items-center justify-center text-[#5E6C84] hover:text-[#091E42] transition cursor-pointer font-bold text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Chat Messages List / Sessions History Panel */}
              {isHistoryOpen ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#FAFBFC] flex flex-col">
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <span className="text-[10px] font-bold text-[#5E6C84] uppercase tracking-wider">Chat Sessions</span>
                    <button
                      type="button"
                      onClick={handleCreateNewSession}
                      className="flex items-center gap-1 text-[11px] text-white bg-[#0052CC] hover:bg-[#0747A6] font-bold px-2.5 py-1.5 rounded transition cursor-pointer shadow-xs animate-fade-in"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      New Chat
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                    {sessions.map(sess => (
                      <div
                        key={sess.id}
                        onClick={() => handleSwitchSession(sess.id)}
                        className={`group p-3 rounded-lg border text-left cursor-pointer transition flex items-center justify-between ${
                          sess.id === currentSessionId
                            ? "bg-[#EAE6FF] border-[#C0B6F2] text-[#403294]"
                            : "bg-white border-[#DFE1E6] hover:bg-[#FAFBFC] text-[#091E42]"
                        }`}
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="text-xs font-bold truncate">
                            {sess.name || "New Session"}
                          </span>
                          <span className="text-[9px] text-[#5E6C84] mt-0.5 font-medium">
                            {new Date(sess.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSession(sess.id, e)}
                          className="p-1 text-[#5E6C84] hover:text-[#DE350B] hover:bg-[#FFEBE6] rounded opacity-0 group-hover:opacity-100 transition cursor-pointer"
                          title="Delete Session"
                        >
                          <Plus className="w-3.5 h-3.5 rotate-45" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
                  {aiMessages.map((msg, index) => (
                    <div key={msg.id} className={`flex flex-col space-y-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                      {/* Role header label */}
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#5E6C84] pl-1">
                        {msg.role === "user" ? "You" : "AI Agent"}
                      </span>

                      {/* Bubble content */}
                      <div className={`p-3.5 rounded-2xl max-w-[92%] text-xs leading-relaxed shadow-3xs ${
                        msg.role === "user" 
                          ? "bg-[#E3F2FD] border border-[#90CAF9] text-[#0D47A1] rounded-tr-none font-semibold" 
                          : msg.isError
                            ? "bg-[#FFECEC] border border-[#FFBDAD] text-[#BF2600] rounded-tl-none font-semibold font-mono"
                            : "bg-[#FAFBFC] border border-[#DFE1E6] text-[#172B4D] rounded-tl-none font-medium"
                      }`}>
                        <div className="prose prose-sm prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-100 prose-pre:text-slate-800">
                          <ReactMarkdown 
                            components={{
                              p: ({node, className, ...props}) => <p className="whitespace-pre-wrap select-text mb-2 last:mb-0" {...props} />,
                              a: ({node, className, ...props}) => <a className="text-[#0052CC] hover:underline font-semibold" target="_blank" rel="noopener noreferrer" {...props} />,
                              strong: ({node, className, ...props}) => <strong className="font-bold text-[#172B4D]" {...props} />,
                              ul: ({node, className, ...props}) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                              li: ({node, className, ...props}) => <li className="" {...props} />,
                              code: ({node, className, ...props}) => <code className={className} {...props} />
                            }}
                          >
                            {msg.text}
                          </ReactMarkdown>
                        </div>

                        {/* Regenerate button for last agent message */}
                        {index === aiMessages.length - 1 && msg.role === "agent" && !aiIsLoading && (
                          <div className="flex justify-end mt-3 pt-2 border-t border-[#DFE1E6]/50">
                            <button
                              type="button"
                              onClick={handleRegenerateResponse}
                              className="flex items-center gap-1 text-[9px] text-[#0052CC] hover:text-[#0747A6] font-bold px-2 py-1 rounded bg-[#EAE6FF] hover:bg-[#DED9FF] transition cursor-pointer"
                            >
                              <RotateCw className="w-2.5 h-2.5" />
                              Regenerate Response
                            </button>
                          </div>
                        )}

                        {/* Proposed worklogs breakdown card */}
                        {msg.proposedLogs && msg.proposedLogs.length > 0 && (
                          <div className="mt-3.5 space-y-3 bg-white p-3 rounded-lg border border-[#DFE1E6] shadow-sm">
                            <p className="text-[10px] font-bold text-[#0052CC] tracking-wider uppercase flex items-center gap-1.5 border-b border-[#DFE1E6] pb-1.5">
                              <Sparkles className="w-3 h-3 text-[#0052CC] shrink-0" />
                              Proposed Time Logs ({msg.proposedLogs.length})
                            </p>
                            <div className="space-y-3">
                              {msg.proposedLogs.map((log: any, idx: number) => {
                                const confidenceColors = 
                                  log.confidence === "high" ? "bg-[#E3FCEF] text-[#006644] border-[#ABF5D1]" :
                                  log.confidence === "medium" ? "bg-[#FFF0B3] text-[#172B4D] border-[#FFE380]" :
                                  "bg-[#EBECF0] text-[#5E6C84] border-[#DFE1E6]";

                                return (
                                  <div key={idx} className="bg-[#FAFBFC] p-3 rounded border border-[#DFE1E6] space-y-2 text-[11px] hover:border-[#0052CC]/50 transition">
                                    <div className="flex justify-between items-start gap-1">
                                      <div className="max-w-[70%] text-left">
                                        <span className="font-bold text-[#172B4D] font-mono shrink-0 select-text block">{log.issueKey}</span>
                                        <span className="text-[#5E6C84] block truncate font-sans text-[10px] mt-0.5 font-semibold" title={log.issueSummary}>{log.issueSummary}</span>
                                      </div>
                                      <span className={`px-1.5 py-0.5 rounded border text-[8.5px] font-bold font-mono uppercase ${confidenceColors}`}>
                                        {log.confidence} Match
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2 pt-1 border-t border-[#DFE1E6] text-[10px] flex-wrap">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] text-[#5E6C84] uppercase font-bold shrink-0">Duration:</span>
                                        <span className="text-[#0052CC] font-bold font-mono bg-[#DEEBFF] px-1.5 py-0.5 rounded border border-[#B3D4FF]">{log.timeSpent}</span>
                                      </div>
                                      {log.started && (
                                        <div className="flex items-center gap-1.5 ml-2">
                                          <span className="text-[9px] text-[#5E6C84] uppercase font-bold shrink-0">Date:</span>
                                          <span className="text-[#006644] font-bold font-sans bg-[#E3FCEF] px-1.5 py-0.5 rounded border border-[#ABF5D1]">
                                            {new Date(log.started).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    <div className="bg-white p-2 rounded text-[10.5px] text-[#42526E] italic border border-[#DFE1E6] leading-snug font-medium text-left">
                                      "{log.comment}"
                                    </div>

                                    <div className="flex justify-end pt-1">
                                      {log.success ? (
                                        <span className="text-emerald-600 text-[10px] font-bold uppercase flex items-center gap-1">
                                          ✓ Successfully Logged
                                        </span>
                                      ) : log.error ? (
                                        <div className="text-left w-full space-y-1">
                                          <span className="text-rose-600 text-[9px] block">Error: {log.error}</span>
                                          <button
                                            type="button"
                                            onClick={() => handleLogTimeFromAi(msg.id, idx, log.issueKey, log.timeSpent, log.comment, log.started)}
                                            className="px-2.5 py-1 bg-[#DEEBFF] hover:bg-[#B3D4FF] text-[#0052CC] font-bold rounded text-[10px] uppercase cursor-pointer"
                                          >
                                            Retry
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handleLogTimeFromAi(msg.id, idx, log.issueKey, log.timeSpent, log.comment, log.started)}
                                          disabled={log.isLogging}
                                          className="px-2.5 py-1.5 bg-[#0052CC] hover:bg-[#0747A6] text-white font-bold rounded text-[10px] uppercase tracking-wide disabled:opacity-40 cursor-pointer flex items-center gap-1"
                                        >
                                          {log.isLogging ? "Logging..." : "Confirm & Log"}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {aiIsLoading && (
                    <div className="flex flex-col space-y-1.5 items-start">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#5E6C84] pl-1">AI Agent</span>
                      <div className="bg-[#FAFBFC] border border-[#DFE1E6] p-3.5 rounded-2xl rounded-tl-none md:max-w-[85%] text-xs text-[#5E6C84] flex items-center space-x-2 animate-pulse">
                        <div className="flex space-x-1">
                          <div className="w-1.5 h-1.5 bg-[#0052CC] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="w-1.5 h-1.5 bg-[#0052CC] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="w-1.5 h-1.5 bg-[#0052CC] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                        <span className="font-mono text-[10.5px] font-semibold text-[#172B4D]">Analyzing comments & worklogs...</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Quick Suggestions Shelf */}
              {!isHistoryOpen && (
                <div className="px-4 py-2 border-t border-[#DFE1E6] bg-[#FAFBFC] flex gap-1.5 overflow-x-auto scrollbar-none shrink-0">
                  <button
                    type="button"
                    onClick={() => setAiInput("Log 45m to PR-752 for daily standup updates")}
                    className="px-3 py-1.5 bg-white hover:bg-[#FAFBFC] border border-[#DFE1E6] hover:border-[#97A0AF] text-[10px] text-[#42526E] hover:text-[#091E42] font-semibold font-sans rounded-full shrink-0 transition cursor-pointer leading-none shadow-3xs"
                  >
                    ⚡ Log 45m standup
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiInput("I spent 1.5h on my last task continuing the frontend work")}
                    className="px-3 py-1.5 bg-white hover:bg-[#FAFBFC] border border-[#DFE1E6] hover:border-[#97A0AF] text-[10px] text-[#42526E] hover:text-[#091E42] font-semibold font-sans rounded-full shrink-0 transition cursor-pointer leading-none shadow-3xs"
                  >
                    ⚡ Log 1.5h on last task
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiInput("Can you find the latest Epic assigned to me?")}
                    className="px-3 py-1.5 bg-white hover:bg-[#FAFBFC] border border-[#DFE1E6] hover:border-[#97A0AF] text-[10px] text-[#42526E] hover:text-[#091E42] font-semibold font-sans rounded-full shrink-0 transition cursor-pointer leading-none shadow-3xs"
                  >
                    ⚡ Find my Epic
                  </button>
                </div>
              )}

              {/* Input Form Footer */}
              {!isHistoryOpen && (
                <div className="p-4 bg-[#FAFBFC] border-t border-[#DFE1E6] shrink-0">
                  <form onSubmit={handleQueryAiAgent} className="flex gap-2 relative">
                    <input
                      type="text"
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      placeholder="E.g. log 3h fixing UI component layout..."
                      disabled={aiIsLoading}
                      className="flex-1 bg-white border border-[#DFE1E6] focus:border-[#0052CC] rounded px-4 py-2 text-xs text-[#091E42] outline-none placeholder-slate-400 font-sans font-medium"
                    />
                    <button
                      type="submit"
                      disabled={aiIsLoading || !aiInput.trim()}
                      className="w-9 h-9 bg-[#0052CC] hover:bg-[#0747A6] text-white font-bold rounded flex items-center justify-center shrink-0 transition disabled:opacity-35 cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                  <p className="text-[8.5px] text-[#5E6C84] text-center mt-2.5 font-sans font-bold uppercase tracking-wider">
                    Powered by Gemini - AI can make mistakes, double check before proceeding.
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
