# 🎨 AI Alexis - Frontend (Next.js)

Interfaz web moderna, reactiva e interactiva para **AI Alexis**, un asistente virtual e inteligencia artificial multimodal de nueva generación. Desarrollada con **Next.js (App Router)**, **Tailwind CSS** y **Clerk**, esta aplicación ofrece conversación por texto y voz en tiempo real, conectándose de forma fluida con la API del backend.

---

## ✨ Experiencia de Usuario & UI/UX

* 🌙 **Diseño Futurista en Tema Oscuro (*Dark Mode*):** 
  Estética pulida y elegante inspirada en paneles de control avanzados, construida con Tailwind CSS para reducir la fatiga visual en uso prolongado.

* 🔐 **Gestión de Sesión e Identidad con Clerk:**
  Autenticación rápida y segura con proveedores OAuth (Google) o email. El estado del usuario se gestiona de forma transparente y transmite el `userId` en cada petición para aislar el contexto e historial conversacional.

* 🎙️ **Grabación de Audio en Tiempo Real (MediaRecorder API):**
  Integración directa con el micrófono mediante la **Web MediaRecorder API**. Cuenta con la interacción *Push-to-Talk* ("Mantener pulsado para hablar"), procesando el flujo de voz en formato `.webm` y enviándolo instantáneamente al backend para su transcripción con Whisper Large v3.

* ⚡ **Componentes Interactivos & Indicadores de Estado:**
  * Visualización dinámica de intenciones detectadas (`WEATHER`, `WEB_SEARCH`, `CV_OPTIMIZATION`, etc.).
  * Indicadores de carga e inferencia mientras el modelo procesa o realiza búsquedas web.
  * Módulo para subida directa de archivos PDF de CV con previsualización de estado.
  * *Auto-scroll* inteligente al recibir nuevas respuestas de la IA.

---

## 🛠️ Tecnologías Utilizadas

* **Framework:** Next.js (React / App Router).
* **Autenticación:** Clerk (`@clerk/nextjs`).
* **Estilos & UI:** Tailwind CSS, PostCSS.
* **Procesamiento de Audio:** Web MediaRecorder API.
* **Cliente HTTP:** Fetch API nativo.

---

## 📁 Estructura del Proyecto

```text
ai-alexis-frontend/
├── public/                     # Recursos y archivos estáticos
├── src/
│   ├── app/
│   │   ├── favicon.ico         # Icono de la aplicación
│   │   ├── globals.css         # Estilos globales y configuración de Tailwind CSS
│   │   ├── layout.js           # Layout raíz con Providers (Clerk Auth, Fuentes, etc.)
│   │   └── page.js             # Interfaz principal (Chat, Control de Voz, Subida de CV)
│   └── middleware.js           # Interceptor de seguridad y protección de rutas de Clerk
├── .env.local                  # Variables de entorno locales (NO subir a GitHub)
├── .gitignore                  # Archivos excluidos del control de versiones
├── eslint.config.mjs           # Configuración de ESLint
├── jsconfig.json               # Alias de rutas e importaciones de JavaScript
├── next.config.mjs             # Configuración principal de Next.js
├── package.json                # Dependencias, paquetes y scripts del proyecto
├── postcss.config.mjs          # Configuración de PostCSS para Tailwind CSS
└── README.md                   # Documentación oficial del frontend
```

---

## ⚙️ Variables de Entorno (`.env.local`)

Crea un archivo `.env.local` en la raíz del proyecto para conectar Clerk y el Backend:

```ini
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_tu_clave_publica_aqui
CLERK_SECRET_KEY=sk_test_tu_clave_secreta_aqui
NEXT_PUBLIC_API_URL=[https://ai-alexis-backend.onrender.com/api/v1](https://ai-alexis-backend.onrender.com/api/v1)
```

> **Nota para desarrollo local:** Cambia `NEXT_PUBLIC_API_URL` por `http://localhost:8000/api/v1` cuando ejecutes el backend localmente.

---

## 💻 Instalación y Ejecución Local

1. **Clonar el repositorio e instalar dependencias:**
   ```bash
   git clone [https://github.com/tu-usuario/ai-alexis-frontend.git](https://github.com/tu-usuario/ai-alexis-frontend.git)
   cd ai-alexis-frontend
   npm install
   ```

2. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```

3. **Abrir en el navegador:**
   Navega a [http://localhost:3000](http://localhost:3000) para ver la aplicación en funcionamiento.

---

## 🚀 Despliegue en Producción

La aplicación está lista para desplegarse en **Render** o **Vercel**:

* **Build Command:** `npm run build`
* **Start Command:** `npm start`
* **Environment Variables:** Añadir `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` y `NEXT_PUBLIC_API_URL` en el panel de control del hosting.