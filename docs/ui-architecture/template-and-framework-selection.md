# Template and Framework Selection

Based on the BrickOps PRD, the frontend technology stack has been specified:

- **Framework**: Next.js 14+ with TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Built-in React (useState, useContext, useReducer) with Zustand available
- **Backend**: Convex for real-time database and serverless functions
- **Deployment**: Vercel

**Framework Analysis:**
Next.js 14+ is excellent for BrickOps because:

- **Server-Side Rendering**: Perfect for SEO and fast initial loads
- **API Routes**: Can handle authentication and API integrations
- **Image Optimization**: Critical for displaying high-quality Lego part images
- **Mobile-First Support**: Essential for camera integration workflow
- **TypeScript Integration**: Provides type safety for complex inventory data structures

**Template Decision**: Using **Next.js App Router** starter template which provides:

- Modern file-based routing with the app directory
- Built-in TypeScript support
- Optimized bundling and performance
- Middleware support for authentication
