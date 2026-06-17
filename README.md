# Jira Workspace Manager & AI Time-Logger

<div align="center">

![Jira](https://img.shields.io/badge/Jira-0052CC?style=for-the-badge&logo=jira&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-8E75C2?style=for-the-badge&logo=googlegemini&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=FFD62B)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)

</div>

A collaborative board optimizer, documentation browser, and intelligent time-tracking assistant powered by Google Gemini and integrated with Atlassian APIs (Jira & Confluence).

---

## Key Features

*   **Secure JWT Authentication & Multi-Tenancy**: Dedicated registration and login screens, securing user data and credentials.
*   **Scoped Server-Side Database**: Saves Jira credentials, connections, and chat history scoped specifically to each user's ID on the server (no shared local storage states).
*   **Consolidated Navigation & Docs**: Integrates Confluence spaces and Developer Guides into a single "Docs & Wiki" hub.
*   **AI Co-Pilot Work Logging**: Conversational assistant that parses work logs, corrects spellings, asks questionnaire details, and interacts with Jira APIs.
*   **My Profile Manager**: Renamed workspace credentials manager to safely store basic auth API tokens, OAuth keys, and custom Gemini API keys.

---

## Run Locally

### Prerequisites
*   Node.js (v18+)
*   NPM

### Setup Instructions

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/arozimran1-dotcom/Jira-Agent.git
    cd Jira-Agent
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment Variables**:
    Create a `.env` file in the root directory and add the following:
    ```env
    JIRA_CLIENT_ID=your_jira_client_id
    JIRA_CLIENT_SECRET=your_jira_client_secret
    GEMINI_API_KEY=your_gemini_api_key
    JWT_SECRET=your_custom_jwt_secret
    ```

4.  **Run in Development Mode**:
    ```bash
    npm run dev
    ```

5.  **Access the Application**:
    Open your browser and navigate to [http://localhost:3000](http://localhost:3000).

---

## Contributors

*   **Aqib Arshad** ([@arozimran1-dotcom](https://github.com/arozimran1-dotcom)) - Core Contributor & Lead Creator
