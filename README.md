# Frim - GLB Animation Editor

A web-based skeletal animation editor for GLB/GLTF models with cloud saves.

![Frim Editor](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![Prisma](https://img.shields.io/badge/Prisma-PostgreSQL-blue?logo=prisma)
![NextAuth](https://img.shields.io/badge/NextAuth.js-Secure-green?logo=auth0)

## Features

- 🎬 **Full Animation Editor** - Import GLB models, create skeletal animations with keyframe timeline
- ☁️ **Cloud Saves** - Save projects to PostgreSQL database, access anywhere
- 🔐 **Authentication** - Sign in with GitHub, Google, or email/password
- 📦 **GLB Export** - Export animations back to GLB format
- 🎥 **Video to Animation** - AI-powered pose detection from video (experimental)
- 🎨 **Modern UI** - Dark theme with green accents, responsive design

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js
- **3D Engine**: Three.js
- **Styling**: Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/frim.git
   cd frim
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your database URL and OAuth credentials:
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/frim"
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
   
   # Optional OAuth providers
   GITHUB_CLIENT_ID="your-github-client-id"
   GITHUB_CLIENT_SECRET="your-github-client-secret"
   ```

4. Set up the database:
   ```bash
   npx prisma db push
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
frim/
├── app/
│   ├── api/
│   │   ├── auth/          # NextAuth API routes
│   │   └── projects/      # Projects CRUD API
│   ├── auth/              # Sign in/Register pages
│   ├── dashboard/         # Projects dashboard
│   └── editor/[id]/       # Animation editor
├── components/            # React components
├── lib/
│   ├── auth.ts           # NextAuth configuration
│   └── prisma.ts         # Prisma client
├── prisma/
│   └── schema.prisma     # Database schema
├── public/
│   ├── css/              # Editor styles
│   └── js/               # Editor scripts
└── types/                # TypeScript types
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/projects` | List user's projects |
| POST | `/api/projects` | Create new project |
| GET | `/api/projects/[id]` | Get project details |
| PUT | `/api/projects/[id]` | Update project |
| DELETE | `/api/projects/[id]` | Delete project |

## Editor Shortcuts

| Key | Action |
|-----|--------|
| `V` | Select tool |
| `R` | Rotate tool |
| `T` | Translate tool |
| `S` | Scale tool |
| `Space` | Play/Pause |
| `←` / `→` | Previous/Next frame |
| `Ctrl+S` | Save to cloud |

## Database Schema

```prisma
model User {
  id        String    @id
  email     String    @unique
  name      String?
  image     String?
  projects  Project[]
}

model Project {
  id          String   @id
  name        String
  animations  Json     // Keyframe data
  modelData   String?  // Base64 GLB
  thumbnail   String?  // Preview image
  userId      String
  user        User     @relation(...)
}
```

## Deployment

### Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy!

### Self-hosted

```bash
npm run build
npm run start
```

## License

MIT License - feel free to use for personal or commercial projects.

## Contributing

Contributions welcome! Please open an issue or PR.
