import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    // Omite los archivos internos de Next.js y los archivos estáticos (imágenes, fuentes, etc.)
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpeg|jpg|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Se ejecuta siempre para rutas de API
    '/(api|trpc)(.*)',
  ],
};