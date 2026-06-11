# SQLStudio

SQLStudio is a modern, web-based SQL Integrated Development Environment (IDE) built with a focus on developer experience and premium SaaS aesthetics. It allows users to write, execute, save, and track SQL queries against a true database engine directly from the browser.

## Features

- **Monaco Editor Integration**: Write SQL with full syntax highlighting, intelligent autocomplete, and a developer-first dark mode experience.
- **Real Database Execution**: Execute raw SQL queries directly against a persistent SQLite backend.
- **Database Schema Explorer**: Browse tables, columns, and primary keys from the live database schema.
- **Query History**: Automatically logs every query execution along with its status (success/error), execution time, and timestamp.
- **Saved Queries**: Persist your most important snippets into organized collections and re-run them with a single click.
- **Beautiful Dashboard**: Get a high-level overview of total connections, active users, query metrics, and recent connection activity.
- **Developer-First Design**: Built with pure CSS tokens, dark mode by default, and inspired by top-tier tools like VS Code, DataGrip, and Supabase Studio.

## Tech Stack

### Frontend
- **Framework**: React 18 with Vite and TypeScript
- **Routing**: React Router DOM v6
- **State & Data Fetching**: TanStack React Query & Zustand
- **Editor**: `@monaco-editor/react`
- **Styling**: Tailwind CSS with a custom design system token architecture (`index.css`)
- **Icons**: Lucide React

### Backend
- **Framework**: Fastify with Node.js
- **Database Engine**: `better-sqlite3` and `PGlite` integration
- **ORM & Metadata Storage**: Prisma ORM with SQLite (`metadata.db`)
- **Runtime**: `tsx` for seamless TypeScript execution

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git
   cd SQL-editor
   ```

2. **Setup the Backend**
   ```bash
   cd backend
   npm install
   
   # Push the Prisma schema to generate the local SQLite database
   npx prisma db push
   
   # Seed the database with initial metadata (optional)
   npx tsx src/seed-metadata.ts
   
   # Start the backend server
   npm run dev
   ```
   The backend will run on `http://localhost:3000`.

3. **Setup the Frontend**
   Open a new terminal window:
   ```bash
   cd frontend
   npm install
   
   # Start the Vite development server
   npm run dev
   ```
   The frontend will run on `http://localhost:5173`.

## Usage
1. Open your browser to `http://localhost:5173`.
2. Navigate to the **Workspace** using the sidebar.
3. Write standard SQL (e.g., `CREATE TABLE`, `INSERT`, `SELECT`) in the Monaco editor.
4. Hit **Run Query** to view the tabular results.
5. Hit **Save** to persist a query to your library.
6. Check your **Dashboard**, **Query History**, and **Saved Queries** via the sidebar navigation.

## License
MIT License
