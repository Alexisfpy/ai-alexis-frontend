'use client';

import { useState, useRef, useEffect } from 'react';
import { useUser, SignInButton, UserButton } from '@clerk/nextjs';
import ReactMarkdown from 'react-markdown';

export default function Home() {
  // --- AUTENTICACIÓN CON CLERK ---
  const { user, isLoaded, isSignedIn } = useUser();
  const userId = user?.id || 'guest_user';

  // --- ESTADOS DE LA APLICACIÓN ---
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '¡Hola! Soy AI Alexis. Todos los sistemas están en línea. Puedes chatear, subir documentos para RAG o enviar notas de voz.'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  // Estados para Visión Multimodal (Imágenes)
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // --- REFS ---
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartTimeRef = useRef(0);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ai-alexis-backend.onrender.com/api/v1';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, imagePreview]);

  // --- CARGAR HISTORIAL DE MONGO ATLAS ---
  useEffect(() => {
    const cargarHistorial = async () => {
      if (!isSignedIn || !user) return;

      try {
        const response = await fetch(`${API_URL}/assistant/history/${user.id}`);
        if (!response.ok) return;

        const data = await response.json();

        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        } else {
          const nombreUsuario = user.firstName || user.username || 'Alexis';
          setMessages([
            {
              role: 'assistant',
              content: `¡Bienvenido de nuevo, **${nombreUsuario}**! Tu sesión está iniciada de forma segura. ¿En qué te puedo ayudar hoy?`
            }
          ]);
        }
      } catch (error) {
        console.error('Error al recuperar el historial desde Atlas:', error);
      }
    };

    cargarHistorial();
  }, [isSignedIn, user]);

  // --- CONTROLADOR DE SELECCIÓN Y COMPRESIÓN DE IMAGEN ---
  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        // Redimensionar si supera los 1000px manteniendo la proporción
        const maxDim = 1000;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convertir a JPEG comprimido (calidad 70%)
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setImagePreview(compressedDataUrl);
        setSelectedImage(compressedDataUrl.split(',')[1]); // Base64 puro
      };
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // --- 1. ENVIAR MENSAJE DE TEXTO E IMAGEN ---
  const handleSend = async (e) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage) || loading) return;

    const userMessage = input.trim();
    const imageToSend = selectedImage;
    const currentPreview = imagePreview;

    setInput('');
    handleRemoveImage();

    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: userMessage || '📸 [Análisis de imagen]',
        image: currentPreview
      }
    ]);
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          user_id: userId,
          image: imageToSend
        })
      });

      if (!response.ok) throw new Error('Error al conectar con el servidor');

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response, intent: data.intent }
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ No se pudo conectar con el backend. Comprueba la red o vuelve a intentarlo.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // --- 2. SUBIR DOCUMENTO A BASE DE CONOCIMIENTO (RAG) ---
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadStatus('Indexando...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', userId);

    try {
      const response = await fetch(`${API_URL}/assistant/upload-document`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Error al indexar el documento');

      const data = await response.json();
      setUploadStatus('✅ OK');

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `📚 **Documento indexado**: *${data.filename}* (${data.chunks_indexed || 0} fragmentos vectorizados).`
        }
      ]);
    } catch (error) {
      setUploadStatus('❌ Error');
      alert('Ocurrió un error al subir el documento.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setUploadStatus(''), 4000);
    }
  };

  // --- 3. GRABACIÓN DE NOTAS DE VOZ ---
  const startRecording = async (e) => {
    if (e) e.preventDefault();
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      recordingStartTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const duration = Date.now() - recordingStartTimeRef.current;
        if (duration < 500) {
          stream.getTracks().forEach((track) => track.stop());
          setIsRecording(false);
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await enviarAudioAlBackend(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert('Permiso de micrófono denegado o dispositivo no compatible.');
    }
  };

  const stopRecording = (e) => {
    if (e) e.preventDefault();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const enviarAudioAlBackend = async (blob) => {
    setLoading(true);
    const formData = new FormData();
    formData.append('file', blob, 'voice_input.webm');
    formData.append('user_id', userId);

    try {
      const response = await fetch(`${API_URL}/assistant/voice`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Error en el servidor de voz.');

      setMessages((prev) => [...prev, { role: 'assistant', content: data.response, intent: data.intent }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `💥 Error de voz: ${error.message}`, intent: 'ERROR' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-full overflow-x-hidden bg-slate-950 text-slate-100 font-sans">
      {/* CABECERA (HEADER) RESPONSIVE */}
      <header className="flex items-center justify-between px-3 sm:px-6 py-3 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md sticky top-0 z-10 w-full shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <h1 className="text-base sm:text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent truncate">
            AI Alexis
          </h1>
          <span className="hidden sm:inline-block text-[11px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700 shrink-0">
            Cloud 2026
          </span>
        </div>

        {/* ACCIONES Y BOTÓN RAG */}
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.txt"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !isSignedIn}
            title={!isSignedIn ? 'Inicia sesión para indexar documentos' : 'Subir documento a tu Base de Conocimiento'}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 sm:px-3 py-1.5 rounded-lg font-medium transition-all shadow-md disabled:opacity-50 flex items-center gap-1.5 shrink-0"
          >
            <span>📚</span>
            <span className="hidden sm:inline">{uploading ? 'Indexando...' : 'Subir Documento (RAG)'}</span>
            <span className="sm:hidden">{uploading ? '...' : 'RAG'}</span>
          </button>

          {uploadStatus && (
            <span className="text-[11px] text-emerald-400 font-medium">
              {uploadStatus}
            </span>
          )}

          {/* CLERK LOGIN / AVATAR */}
          {isLoaded && (
            <div className="shrink-0 flex items-center">
              {!isSignedIn ? (
                <SignInButton mode="modal">
                  <button className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 sm:px-3 py-1.5 rounded-lg font-medium transition-all shadow-md">
                    Entrar
                  </button>
                </SignInButton>
              ) : (
                <UserButton afterSignOutUrl="/" />
              )}
            </div>
          )}
        </div>
      </header>

      {/* CHAT / MENSAJES */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 max-w-4xl w-full mx-auto min-w-0">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}
          >
            <div
              className={`max-w-[88%] sm:max-w-[75%] rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm leading-relaxed shadow-sm break-words ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none whitespace-pre-wrap'
                  : msg.intent === 'ERROR'
                  ? 'bg-red-950/80 border border-red-900 text-red-200 rounded-bl-none'
                  : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
              }`}
            >
              {msg.image && (
                <img
                  src={msg.image}
                  alt="Adjunto"
                  className="max-w-[180px] sm:max-w-[220px] max-h-[140px] sm:max-h-[160px] rounded-lg mb-2 object-cover border border-blue-400/30"
                />
              )}

              {msg.role === 'user' ? (
                msg.content
              ) : (
                <div className="space-y-2 [&>ul]:list-disc [&>ul]:ml-4 [&>ol]:list-decimal [&>ol]:ml-4 [&>p]:leading-relaxed [&>pre]:bg-slate-950 [&>pre]:p-3 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>code]:bg-slate-800 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
            {msg.intent && (
              <span className="text-[9px] sm:text-[10px] text-slate-500 mt-1 px-1 font-mono uppercase">
                Intención: {msg.intent}
              </span>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-xs sm:text-sm bg-slate-900/50 border border-slate-800/80 w-fit px-3 py-2 rounded-2xl rounded-bl-none">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-cyan-400 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
            <span>Procesando...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* BARRA DE ENTRADA (INPUT FOOTER) */}
      <footer className="p-2.5 sm:p-4 bg-slate-900/90 border-t border-slate-800 backdrop-blur-md shrink-0 w-full">
        {imagePreview && (
          <div className="max-w-4xl mx-auto mb-2 flex items-center gap-2 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800 w-fit">
            <div className="relative">
              <img
                src={imagePreview}
                alt="Vista previa"
                className="w-10 h-10 object-cover rounded-lg border border-cyan-500/60"
              />
              <button
                type="button"
                onClick={handleRemoveImage}
                className="absolute -top-1 -right-1 bg-red-600 hover:bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] shadow"
              >
                ✕
              </button>
            </div>
            <span className="text-[11px] text-slate-300 pr-1">Imagen lista</span>
          </div>
        )}

        <form onSubmit={handleSend} className="max-w-4xl mx-auto flex items-center gap-1.5 sm:gap-2 w-full min-w-0">
          <input
            type="file"
            ref={imageInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            className="hidden"
          />

          {/* BOTÓN CLIP */}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={loading || isRecording}
            title="Adjuntar imagen"
            className="p-2 sm:p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl transition-colors shrink-0 flex items-center justify-center disabled:opacity-50"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          {/* BOTÓN MICRÓFONO */}
          <button
            type="button"
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            title="Mantén pulsado para hablar"
            className={`p-2 sm:p-3 rounded-xl transition-all select-none touch-none shrink-0 flex items-center justify-center ${
              isRecording 
                ? 'bg-red-600 text-white scale-105 shadow-red-500/50 shadow-md animate-pulse' 
                : 'bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700'
            }`}
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>

          {/* CAMPO DE TEXTO (min-w-0 evita que empuje elementos fuera) */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isRecording}
            placeholder={
              isRecording 
                ? 'Escuchando...' 
                : selectedImage 
                ? 'Pregunta sobre la imagen...' 
                : 'Escribe un mensaje...'
            }
            className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
          />

          {/* BOTÓN ENVIAR */}
          <button
            type="submit"
            disabled={loading || (!input.trim() && !selectedImage) || isRecording}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 sm:px-5 py-2 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-md disabled:opacity-40 shrink-0 flex items-center justify-center gap-1"
          >
            <span className="hidden sm:inline">Enviar</span>
            <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </form>
      </footer>
    </div>
  );
}
