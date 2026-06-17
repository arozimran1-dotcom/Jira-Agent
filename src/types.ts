/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type JIRA_AUTH_TYPE = "oauth" | "basic" | "demo";

export interface AtlassianTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

export interface DirectConnection {
  domain: string;
  email: string;
  apiToken: string;
}

export interface AccessibleSite {
  id: string;
  url: string;
  name: string;
  avatarUrl?: string;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrls?: {
    "16x16"?: string;
    "24x24"?: string;
    "32x32"?: string;
    "48x48"?: string;
  };
}

export interface JiraPriority {
  id: string;
  name: "Highest" | "High" | "Medium" | "Low" | "Lowest" | string;
  iconUrl?: string;
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory?: {
    id: number;
    key: "new" | "indeterminate" | "done" | string;
    name: string;
  };
}

export interface JiraComment {
  id: string;
  author: JiraUser;
  body: string | any; // In newer APIs, could be ADF (Atlassian Document Format), we will support string parsing
  created: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  self?: string;
  fields: {
    summary: string;
    description: string | any; // ADF Object or string
    created: string;
    updated: string;
    status: JiraStatus;
    priority: JiraPriority;
    assignee: JiraUser | null;
    reporter: JiraUser;
    project: {
      id: string;
      key: string;
      name: string;
      avatarUrls?: Record<string, string>;
    };
    issuetype: {
      id: string;
      name: "Bug" | "Task" | "Story" | "Epic" | string;
      iconUrl?: string;
    };
    comment?: {
      comments: JiraComment[];
    };
    timetracking?: {
      originalEstimate?: string;
      remainingEstimate?: string;
      timeSpent?: string;
      originalEstimateSeconds?: number;
      remainingEstimateSeconds?: number;
      timeSpentSeconds?: number;
    };
  };
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  avatarUrls?: Record<string, string>;
  projectTypeKey?: string;
}

export interface JiraConnectionState {
  authType: JIRA_AUTH_TYPE;
  oauthTokens: AtlassianTokens | null;
  selectedSite: AccessibleSite | null;
  directConnection: DirectConnection | null;
}

export interface UserProfile {
  id: string;
  name: string;
  authType: JIRA_AUTH_TYPE;
  directConn: DirectConnection | null;
  oauthTokens: AtlassianTokens | null;
  selectedSite: AccessibleSite | null;
  geminiApiKey?: string | null;
}
