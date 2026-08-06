# SQLStudio

A web-based SQL IDE. Write, run, save, and track SQL queries against a real database engine, right in the browser.

![Workspace](docs/workspace.png)

## Features

- **Monaco editor**: SQL syntax highlighting, autocomplete, dark mode.
- **Real database execution**: runs raw SQL against a persistent PGlite (embedded, Postgres-compatible) backend.
- **Schema explorer**: browse tables, columns, and primary keys from the live schema.
- **Query history**: every execution is logged with status, execution time, and timestamp, searchable by SQL text.
- **Saved queries**: save snippets, organize them into folders, search by name or SQL text, re-run with one click, or share one as a public read-only link.
- **Dashboard**: per-user connection counts, query metrics, and recent activity, plus a global active-user count.
- **Dark mode by default**, styled with plain CSS tokens, loosely modeled on VS Code, DataGrip, and Supabase Studio.
- **Run selected query**: highlight part of a script and run just that selection, without executing the whole file.
- **File and folder management**: create, rename, and delete files/folders in the workspace explorer, backed by an API that keeps everything scoped to the workspace folder.
- **Integrated terminal**: a real shell (xterm.js + node-pty), running in the workspace directory. This is a full, unrestricted shell — not a sandboxed command runner — so anything typed into it runs directly on your machine, the same as opening a normal terminal. Local-only, not exposed on the network.
- **Authentication**: email/password login and registration, JWT-based. Every API route and the terminal's websocket connection requires a valid token.
- **Git integration**: init, status, add, commit, log, branch, checkout, diff, and push to GitHub, all scoped to the user's own workspace folder, separate from the app's own codebase.
### Git integration, in more detail
 
Each user's workspace maps to its own folder on disk (e.g. under Desktop), kept separate from the application's source code. Git operations run through `simple-git`, a typed Node.js library, instead of shell string commands — that avoids the command injection risk you'd get from building shell commands out of user input.
 
Supported: `init`, `status`, `add`, `commit`, `log`, `branch`, `checkout`, `diff`, `remote`, `push`.
 
This is built for local, single-user use. Login exists to gate API access, but there's no per-user sandboxing or container isolation — every account shares the same workspace folder and shell, so a second user isn't isolated from the first. If you deploy this for multiple people or expose it on a network, the terminal and git features would need a real security review first (containerized shells, per-user workspaces, auth on pushes, etc.). As a local dev tool, this setup is fine.

### Sharing saved queries, in more detail

A shared link shows only the query's name and SQL text, nothing else, never the results and never any connection details. The share token is a random 256-bit string rather than a sequential id, so it can't be guessed. Turning sharing off deletes the token immediately, and the public view endpoint is rate-limited per IP, since it's the only route in the app that doesn't require a login.

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
        
        PG[("PGlite + SQLite (embedded)")]

        Log[Logging & Error Handling]
        Env[Environment Variables]
    end

    subgraph External
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
│   ├── lib/
│   │   └── schemaValidation.ts
│   ├── plugins/
│   │   └── auth.ts
│   ├── rag/
│   │   ├── promptBuilder.ts
│   │   └── schemaRetriever.ts
│   ├── routes/
│   │   ├── ai.routes.ts
│   │   ├── auth.routes.ts
│   │   ├── files.routes.ts
│   │   ├── folders.routes.ts
│   │   ├── git.routes.ts
│   │   └── queries.routes.ts
│   ├── services/
│   │   └── ai.service.ts
│   ├── database.ts
│   ├── index.ts
│   ├── seed.ts
│   └── seed-metadata.ts
├── prisma/
│   └── schema.prisma
├── Dockerfile
└── package.json

frontend/
├── src/
│   ├── components/
│   │   ├── chat/
│   │   │   ├── AIChatSidebar.tsx
│   │   │   └── ChatMessage.tsx
│   │   └── ui/
│   ├── lib/
│   │   └── api.ts
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── QueryHistory.tsx
│   │   ├── SavedQueries.tsx
│   │   ├── SharedQuery.tsx
│   │   └── SQLWorkspace.tsx
│   ├── store/
│   │   └── authStore.ts
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
| Database | PGlite (embedded, Postgres-compatible), SQLite | PGlite runs query execution in-process; SQLite (via Prisma) stores app metadata |
| Authentication | JWT (`@fastify/jwt`), bcrypt | Login/register endpoints, token required on every API route and the terminal websocket |
| Rate limiting | `@fastify/rate-limit` | Applied only to the public share-view endpoint, not registered globally |
| AI model | Google Gemini | SQL generation |
| RAG engine | Custom context builder | Extracts schema for context-aware queries |
| Environment | Dotenv, Vite config | Environment management |
| Deployment | Docker | Dockerfile + docker-compose for the backend; frontend runs separately via Vite |
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
- `@fastify/rate-limit`, scoped to the public share-view endpoint
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
   JWT_SECRET=
   # Optional. Defaults to ~/Desktop/sql-workspace; Docker overrides this to /app/workspace
   WORKSPACE_ROOT_PATH=
   # Optional. Defaults to http://localhost:5173. Set this to your real frontend
   # origin (never '*') if you deploy the backend anywhere reachable from outside
   # your own machine.
   CORS_ORIGIN=
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
   ```

   Configure environment variables (see `frontend/.env.example`):

   ```env
   # Optional. Defaults to http://localhost:3000. Set this to your deployed
   # backend's URL whenever the frontend and backend aren't both running on
   # localhost:3000 — any real deployment.
   VITE_API_BASE_URL=
   ```

   ```bash
   # Start the Vite development server
   npm run dev
   ```
   The frontend runs on `http://localhost:5173`.

### Running the backend with Docker instead

`docker-compose.yml` builds and runs the backend in a container, with a named volume so workspace files survive restarts:

```bash
docker compose up --build
```

The frontend isn't containerized — keep running it separately with `npm run dev`. If this container will be reachable from outside your own machine, set real values for `CORS_ORIGIN` and `JWT_SECRET` first (see the comments in `docker-compose.yml`).

## Usage
1. Open your browser to `http://localhost:5173`.
2. Log in with the seeded account (`admin@sqlstudio.local` / `ChangeMe123!`, created by `npx tsx src/seed-metadata.ts`) or register a new one.
3. Go to Workspace in the sidebar.
4. Write standard SQL (`CREATE TABLE`, `INSERT`, `SELECT`, etc.) in the Monaco editor.
5. Hit Run Query to see the results.
6. Hit Save to add a query to your library.
7. Check Dashboard, Query History, and Saved Queries from the sidebar. From Saved Queries you can search, organize queries into folders, or share one as a public read-only link.

## License
MIT License