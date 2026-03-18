# ctx — Technology Stack

## Core Language
- **JavaScript (Node.js):** The primary language for all backend scripts, MCP tools, and frontend logic. Node.js 20+ is required.

## Backend & AI Orchestration
- **Model Context Protocol (MCP):** Uses the `@modelcontextprotocol/sdk` for building and integrating AI tools.
- **Zod:** Used for robust schema validation across the project.
- **Express Architecture:** The dashboard backend (`scripts/dashboard-backend.js`) follows an Express-like structure for handling HTTP and SSE.

## Frontend & Desktop
- **React:** The core UI framework for the `ctx-app` dashboard.
- **Vite:** Used as the build tool and development server for the frontend.
- **Electron:** Wraps the React application into a cross-platform desktop experience.
- **Tailwind CSS:** Used for utility-first styling in the dashboard.

## Data Storage
- **SQLite (FTS5):** Provides high-performance local data storage and full-text search capabilities for the cross-project knowledge base.

## DevOps & Environment
- **Git:** Primary version control system.
- **GitHub CLI (gh):** Used for synchronizing lessons and session logs with GitHub Issues.
- **Node.js Scripts:** A custom set of scripts for project indexing, setup, and orchestration.