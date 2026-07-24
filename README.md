# SQLStudio

A web-based SQL IDE. Write, run, save, and track SQL queries against a real database engine, right in the browser.

![Workspace](docs/workspace.png)

## Features

- **Monaco editor**: SQL syntax highlighting, autocomplete, dark mode.
- **Real database execution**: runs raw SQL against a persistent SQLite backend.
- **Schema explorer**: browse tables, columns, and primary keys from the live schema.
- **Query history**: every execution is logged with status, execution time, and timestamp.
- **Saved queries**: save snippets into collections, re-run them with one click.
- **Dashboard**: connection counts, active users, query metrics, recent activity.
- **Dark mode by default**, styled with plain CSS tokens, loosely modeled on VS Code, DataGrip, and Supabase Studio.
- **Run selected query**: highlight part of a script and run just that selection, without executing the whole file.
- **File and folder management**: create, rename, and delete files/folders in the workspace explorer, backed by an API that keeps everything scoped to the workspace folder.
- **Integrated terminal**: a real shell (xterm.js + node-pty), running in the workspace directory. This is a full, unrestricted shell — not a sandboxed command runner — so anything typed into it runs directly on your machine, the same as opening a normal terminal. Local-only, not exposed on the network.
- **Git integration**: init, status, add, commit, log, branch, checkout, diff, and push to GitHub, all scoped to the user's own workspace folder, separate from the app's own codebase.
### Git integration, in more detail
 
Each user's workspace maps to its own folder on disk (e.g. under Desktop), kept separate from the application's source code. Git operations run through `simple-git`, a typed Node.js library, instead of shell string commands — that avoids the command injection risk you'd get from building shell commands out of user input.
 
Supported: `init`, `status`, `add`, `commit`, `log`, `branch`, `checkout`, `diff`, `remote`, `push`.
 
This is built for **local, single-user use**. There's no per-user sandboxing or container isolation — if you deploy this for multiple people or expose it on a network, the terminal and git features would need a real security review first (containerized shells, path validation, auth on pushes, etc.). As a local dev tool, this setup is fine.

## Performance benchmarks

From load testing on the Fastify + SQLite/PGlite stack:

- **Data capacity**: handles 1,000,000-5,000,000 records per table with indexed columns.
- **Database latency**: 10-30ms for indexed read/write queries.
- **API throughput**: 100-250 concurrent requests per second.
- **Under load**: p99 response time stays under 200ms (tested with k6/autocannon) before rate limiting kicks in.
- **AI SQL generation**: 1.5-3.0 seconds, depending on the Gemini API.


## AI RAG workflow

The IDE uses retrieval-augmented generation to turn natural language into SQL, using the current database schema as context.

```mermaid
flowchart TD
    A[User] -->|Natural Language| B[AI Chat Interface]
    B -->|POST /api/ai/chat| C[Backend API]
    
    subgraph RAG Pipeline
        C --> D[Intent Detection]
        D --> E[Schema Retriever]
        
        E -->|Retrieve Database Metadata| F[(Database Schema)]
        F -.->|Tables, Columns, Primary/Foreign Keys, Relationships, Views, Indexes, Constraints| G[Relevant Schema Context]
        
        G --> H[Prompt Builder]
        D --> H
        H -->|System Prompt + Retrieved Schema + User Prompt| I[Gemini API]
    end
    
    I -->|Generated SQL| J[SQL Validation]
    J -->|Verified SQL| K[Return SQL to Frontend]
    K --> L[Insert into SQL Editor]
    L -->|Optional Execute Query| M[Results Grid]
```

**Workflow stages:**
- **Schema retriever**: pulls the active schema and metadata (tables, columns, relations) so the model isn't guessing at structure.
- **Prompt builder**: puts together a system prompt with the schema and execution instructions.
- **Gemini API**: generates SQL from the prompt.
- **Validation and execution**: the generated query gets checked, then handed to the Monaco editor for the user to run.

## Architecture

```mermaid
flowchart LR
    subgraph Frontend ["Frontend (React + Vite)"]
        UI1[SQL Editor]
        UI2[Explorer]
        UI3[AI Chat]
        UI4[Results Panel]
        UI5[Query Tabs]
    end

    subgraph Backend ["Backend (Fastify + Node.js)"]
        API[REST API]
        Auth[Authentication]
        Ctrl[Controllers]
        Routes[Routes]
        
        subgraph Services
            DB[Database Service]
            AI[AI Service]
        end
        
        subgraph RAG Engine
            PB[Prompt Builder]
            SR[Schema Retriever]
            Cache[Caching Layer]
        end
        
        Log[Logging & Error Handling]
        Env[Environment Variables]
    end

    subgraph External
        PG[("PostgreSQL / SQLite")]
        Gemini[Gemini API]
        VectorStore[("Future Vector Store")]
    end

    UI1 & UI2 & UI3 & UI4 & UI5 <--> API
    API <--> Auth
    API <--> Routes
    Routes <--> Ctrl
    Ctrl <--> AI
    Ctrl <--> DB
    
    AI <--> PB
    PB <--> SR
    SR <--> Cache
    Cache <--> PG
    
    AI <--> Gemini
    AI -.- VectorStore
```

## Request lifecycle

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant Server as Fastify Server
    participant RAG as RAG Engine
    participant DB as Database
    participant Gemini as Gemini API

    User->>Frontend: "Show top 10 customers"
    Frontend->>Server: POST /api/ai/chat
    Server->>RAG: Trigger RAG Pipeline
    RAG->>DB: Fetch Schema Metadata
    DB-->>RAG: Schema (Tables, Columns)
    RAG->>RAG: Build System Prompt
    RAG->>Gemini: Generate SQL with Context
    Gemini-->>RAG: Generated SQL Query
    RAG-->>Server: Return Validated SQL
    Server-->>Frontend: Response (SQL snippet)
    Frontend-->>User: Display in Chat / Editor
```

## Folder structure

```text
backend/
├── src/
│   ├── config/
│   │   └── env.ts
│   ├── controllers/
│   │   └── ai.controller.ts
│   ├── rag/
│   │   ├── promptBuilder.ts
│   │   └── schemaRetriever.ts
│   ├── routes/
│   │   └── ai.routes.ts
│   ├── services/
│   │   └── ai.service.ts
│   ├── database.ts
│   ├── index.ts
│   ├── seed.ts
│   └── seed-metadata.ts
├── prisma/
│   └── schema.prisma
└── package.json

frontend/
├── src/
│   ├── components/
│   │   ├── chat/
│   │   │   ├── AIChatSidebar.tsx
│   │   │   └── ChatMessage.tsx
│   │   └── ui/
│   ├── pages/
│   │   └── SQLWorkspace.tsx
│   ├── store/
│   └── index.css
└── package.json
```

## AI request pipeline

```mermaid
flowchart TD
    A([Natural Language]) --> B[Schema Retrieval]
    B --> C[Context Builder]
    C --> D[Gemini API]
    D --> E[SQL Generation]
    E --> F[Validation]
    F --> G[Execution]
    G --> H[Results]
    H --> I([Query History])
```

## Technology stack

| Category | Technology | Notes |
| :--- | :--- | :--- |
| Frontend | React 18, Vite, TypeScript | SPA with fast HMR |
| Styling | Tailwind CSS, Lucide Icons | Utility-first CSS, dark mode tokens |
| Editor | Monaco Editor | VS Code's editor engine, with AI autocomplete |
| Backend | Fastify, Node.js | Async REST API |
| Database | PostgreSQL / SQLite | Primary datastore |
| Authentication | Custom / mock auth | Session management |
| AI model | Google Gemini | SQL generation |
| RAG engine | Custom context builder | Extracts schema for context-aware queries |
| Environment | Dotenv, Vite config | Environment management |
| Deployment | Docker (planned) | Not yet implemented |
| Future | Vector store | Embeddings for semantic search |

## Tech stack (detail)

### Frontend
- React 18 with Vite and TypeScript
- React Router DOM v6
- TanStack React Query and Zustand for state and data fetching
- `@monaco-editor/react`
- Tailwind CSS with a custom token setup (`index.css`)
- Lucide React for icons

### Backend
- Fastify with Node.js
- `better-sqlite3` and `PGlite`
- Prisma ORM with SQLite (`metadata.db`) for metadata storage
- `tsx` for running TypeScript directly

## Getting started

### Prerequisites
- Node.js v18 or higher
- npm

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git
   cd SQL-editor
   ```

2. Set up the backend
   ```bash
   cd backend
   npm install
   ```

   Configure environment variables:

   ```env
   GEMINI_API_KEY=
   DATABASE_URL="file:./metadata.db"
   PORT=3000
   ```

   Initialize the database and start the server:
   ```bash
   # Push the Prisma schema to generate the local SQLite database
   npx prisma db push
   
   # Seed the database with initial metadata (optional)
   npx tsx src/seed-metadata.ts
   
   # Start the backend server
   npm run dev
   ```
   The backend runs on `http://localhost:3000`.

3. Set up the frontend

   Open a new terminal window:
   ```bash
   cd frontend
   npm install
   
   # Start the Vite development server
   npm run dev
   ```
   The frontend runs on `http://localhost:5173`.

## Usage
1. Open your browser to `http://localhost:5173`.
2. Go to Workspace in the sidebar.
3. Write standard SQL (`CREATE TABLE`, `INSERT`, `SELECT`, etc.) in the Monaco editor.
4. Hit Run Query to see the results.
5. Hit Save to add a query to your library.
6. Check Dashboard, Query History, and Saved Queries from the sidebar.

## License
MIT License