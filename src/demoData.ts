/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { JiraIssue, JiraProject, JiraUser } from "./types";

export const DEMO_USERS: JiraUser[] = [
  {
    accountId: "user-imran",
    displayName: "Imran Aroz",
    emailAddress: "arozimran18@gmail.com",
    avatarUrls: {
      "48x48": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=128&h=128&q=80"
    }
  },
  {
    accountId: "user-sarah",
    displayName: "Sarah Connor",
    emailAddress: "sarahc@company.internal",
    avatarUrls: {
      "48x48": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=128&h=128&q=80"
    }
  },
  {
    accountId: "user-alex",
    displayName: "Alex Miller",
    emailAddress: "alexm@company.internal",
    avatarUrls: {
      "48x48": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=128&h=128&q=80"
    }
  },
  {
    accountId: "user-jess",
    displayName: "Jess Chen",
    emailAddress: "jessc@company.internal",
    avatarUrls: {
      "48x48": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=128&h=128&q=80"
    }
  }
];

export const DEMO_PROJECTS: JiraProject[] = [
  {
    id: "proj-pr",
    key: "PR",
    name: "Product Development",
    projectTypeKey: "software",
    avatarUrls: {
      "48x48": "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=64&h=64&q=80"
    }
  }
];

export const INITIAL_DEMO_ISSUES: any[] = [
  {
    id: "issue-201",
    key: "PR-698",
    fields: {
      summary: "Implement reactive search filtering on the product management table",
      description: "Users should be able to instantly query and filter product listings by alphanumeric key or name dynamically. Needs debounced input handles to prevent network overload.",
      created: "2026-06-15T09:00:00.000Z",
      updated: "2026-06-17T11:00:00.000Z",
      status: {
        id: "status-inprogress",
        name: "In Progress",
        statusCategory: { id: 2, key: "indeterminate", name: "In Progress" }
      },
      priority: { id: "prio-high", name: "High" },
      assignee: DEMO_USERS[0], // Imran Aroz
      reporter: DEMO_USERS[3], // Jess Chen
      project: {
        id: "proj-pr",
        key: "PR",
        name: "Product Development"
      },
      issuetype: { id: "type-task", name: "Task" },
      comment: {
        comments: [
          {
            id: "comm-5",
            author: DEMO_USERS[3],
            body: "Please ensure the query input handles fast type-ahead and cleans leading/trailing whitespace.",
            created: "2026-06-16T10:15:00.000Z"
          }
        ]
      },
      timetracking: {
        originalEstimate: "8h",
        remainingEstimate: "6h",
        timeSpent: "2h",
        originalEstimateSeconds: 28800,
        remainingEstimateSeconds: 21600,
        timeSpentSeconds: 7200
      },
      worklog_fallback: "Implemented search filter queries and high-performance debounce input handlers",
      worklog: {
        worklogs: [
          {
            id: "wl-pr698-init",
            author: DEMO_USERS[0],
            comment: {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Implemented search filter queries and high-performance debounce input handlers"
                    }
                  ]
                }
              ]
            },
            created: "2026-06-16T15:00:00.000Z",
            timeSpent: "2h"
          }
        ]
      }
    }
  },
  {
    id: "issue-202",
    key: "PR-101",
    fields: {
      summary: "Refactor product catalog database indexing structures",
      description: "Large enterprise clients have reported significant bottlenecks on table scans. Introduce compound range indexing across active products categorizations.",
      created: "2026-06-10T10:00:00.000Z",
      updated: "2026-06-15T15:30:00.000Z",
      status: {
        id: "status-todo",
        name: "To Do",
        statusCategory: { id: 1, key: "new", name: "To Do" }
      },
      priority: { id: "prio-high", name: "High" },
      assignee: DEMO_USERS[2], // Alex Miller
      reporter: DEMO_USERS[1], // Sarah Connor
      project: {
        id: "proj-pr",
        key: "PR",
        name: "Product Development"
      },
      issuetype: { id: "type-task", name: "Task" },
      comment: { comments: [] },
      timetracking: {
        originalEstimate: "16h",
        remainingEstimate: "16h",
        timeSpent: "0m",
        originalEstimateSeconds: 57600,
        remainingEstimateSeconds: 57600,
        timeSpentSeconds: 0
      }
    }
  },
  {
    id: "issue-203",
    key: "PR-102",
    fields: {
      summary: "Critical security audit vulnerability: sanitize innerHTML binding",
      description: "Our markdown display module currently binds elements via direct dangerous assignment. This creates potential XSS concerns. Swapping to a clean DOMPurify parser scheme.",
      created: "2026-06-16T07:20:00.000Z",
      updated: "2026-06-17T01:10:00.000Z",
      status: {
        id: "status-todo",
        name: "To Do",
        statusCategory: { id: 1, key: "new", name: "To Do" }
      },
      priority: { id: "prio-highest", name: "Highest" },
      assignee: DEMO_USERS[2], // Alex Miller
      reporter: DEMO_USERS[0], // Imran Aroz
      project: {
        id: "proj-pr",
        key: "PR",
        name: "Product Development"
      },
      issuetype: { id: "type-bug", name: "Bug" },
      comment: { comments: [] }
    }
  },
  {
    id: "issue-204",
    key: "PR-103",
    fields: {
      summary: "Draft brand styling identity guidelines v2.1",
      description: "Define the visual constants: typography family is Inter, space tracking details, grid system base is 8px, and color rules focusing on dark slate backgrounds with emerald teal accents.",
      created: "2026-06-13T10:00:00.000Z",
      updated: "2026-06-16T12:00:00.000Z",
      status: {
        id: "status-done",
        name: "Done",
        statusCategory: { id: 3, key: "done", name: "Done" }
      },
      priority: { id: "prio-low", name: "Low" },
      assignee: DEMO_USERS[3], // Jess Chen
      reporter: DEMO_USERS[1],
      project: {
        id: "proj-pr",
        key: "PR",
        name: "Product Development"
      },
      issuetype: { id: "type-story", name: "Story" },
      comment: { comments: [] }
    }
  }
];
