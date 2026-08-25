'use client';

import { useState, useRef, useEffect } from 'react';
import { useUser, SignInButton, UserButton } from '@clerk/nextjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Home() {
  // --- AUTENTICACIÓN CON CLERK ---
  const { user, isLoaded, isSignedIn } = useUser();
  const userId = user?.id || 'guest_user';

  // --- ESTADOS DE CONVERSACIONES / SESIONES ---
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // --- ESTADOS DEL CHAT ---
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '¡Hola! Soy AI Alexis. Todos los sistemas están en línea. Puedes iniciar una nueva conversación, subir documentos o enviar notas de voz.'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  // Estados para Visión Multimodal
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Estados para Text-to-Speech (TTS)
  const [reproduciendoIndex, setReproduciendoIndex] = useState(null);
  const currentAudioRef = useRef(null);

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

  // --- 1. CARGAR LISTA DE CONVERSACIONES ---
  const cargarConversaciones = async () => {
    if (!isSignedIn || !user) return;

    try {
      const res = await fetch(`${API_URL}/assistant/conversations/${user.id}`);
      if (!res.ok) return;

      const data = await res.json();
      const lista = data.conversations || [];
      setConversations(lista);

      if (!currentConversationId && lista.length > 0) {
        seleccionarConversacion(lista[0].id);
      }
    } catch (error) {
      console.error('Error al cargar la lista de conversaciones:', error);
    }
  };

  useEffect(() => {
    cargarConversaciones();
  }, [isSignedIn, user]);

  // --- 2. SELECCIONAR O CAMBIAR DE CHAT ---
  const seleccionarConversacion = async (convId) => {
    if (convId === currentConversationId) {
      setSidebarOpen(false);
      return;
    }

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      setReproduciendoIndex(null);
    }

    setCurrentConversationId(convId);
    setSidebarOpen(false);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/assistant/conversation/${convId}`);
      if (!res.ok) throw new Error('No se pudo recuperar la conversación');

      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages);
      } else {
        setMessages([
          { role: 'assistant', content: 'Conversación iniciada. ¿En qué te puedo ayudar?' }
        ]);
      }
    } catch (error) {
      console.error('Error al obtener mensajes:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- 3. CREAR NUEVO CHAT ---
  const crearNuevoChat = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      setReproduciendoIndex(null);
    }

    setCurrentConversationId(null);
    const nombre = user?.firstName || user?.username || 'Alexis';
    setMessages([
      {
        role: 'assistant',
        content: `¡Nuevo chat iniciado para **${nombre}**! Escribe un mensaje o envía un archivo para comenzar.`
      }
    ]);
    setSidebarOpen(false);
  };

  // --- 4. ELIMINAR CONVERSACIÓN ---
  const eliminarConversacion = async (e, convId) => {
    e.stopPropagation();
    if (!confirm('¿Deseas eliminar esta conversación?')) return;

    try {
      const res = await fetch(`${API_URL}/assistant/conversation/${convId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        if (currentConversationId === convId) {
          crearNuevoChat();
        }
      }
    } catch (error) {
      console.error('Error al eliminar conversación:', error);
    }
  };

  // --- 5. CONTROLADOR DE SÍNTESIS DE VOZ (TTS) ---
  const reproducirAudioTexto = async (texto, index = null) => {
    if (reproduciendoIndex === index && currentAudioRef.current) {
      currentAudioRef.current.pause();
      setReproduciendoIndex(null);
      return;
    }

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }

    try {
      if (index !== null) setReproduciendoIndex(index);

      const res = await fetch(`${API_URL}/assistant/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texto })
      });

      if (!res.ok) throw new Error('Error al sintetizar voz');

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.onended = () => {
        setReproduciendoIndex(null);
      };

      await audio.play();
    } catch (error) {
      console.error('Error al reproducir audio:', error);
      setReproduciendoIndex(null);
    }
  };

  // --- CONTROLADOR DE IMAGEN ---
  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
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

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setImagePreview(compressedDataUrl);
        setSelectedImage(compressedDataUrl.split(',')[1]);
      };
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // --- ENVIAR MENSAJE DE TEXTO E IMAGEN ---
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
          conversation_id: currentConversationId,
          image: imageToSend
        })
      });

      if (!response.ok) throw new Error('Error al conectar con el servidor');

      const data = await response.json();

      if (!currentConversationId && data.conversation_id) {
        setCurrentConversationId(data.conversation_id);
        cargarConversaciones();
      }

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

  // --- SUBIR DOCUMENTO (RAG) ---
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

  // --- NOTAS DE VOZ ---
  const startRecording = async (e) => {
    if (e) e.preventDefault();
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      recordingStartTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
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
    if (currentConversationId) {
      formData.append('conversation_id', currentConversationId);
    }

    try {
      const response = await fetch(`${API_URL}/assistant/voice`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Error en el servidor de voz.');

      if (!currentConversationId && data.conversation_id) {
        setCurrentConversationId(data.conversation_id);
        cargarConversaciones();
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: data.response, intent: data.intent }]);
      
      // Auto-reproducir respuesta por voz
      reproducirAudioTexto(data.response);
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
    <div className="flex h-[100dvh] w-full max-w-full overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* FONDO OSCURO PARA MÓVILES */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 md:hidden"
        />
      )}

      {/* --- BARRA LATERAL (SIDEBAR) --- */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-30 w-72 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* BOTÓN SUPERIOR: NUEVO CHAT */}
        <div className="p-3.5 border-b border-slate-800 flex items-center gap-2">
          <button
            onClick={crearNuevoChat}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
          >
            <span className="text-base leading-none">＋</span>
            <span>Nuevo Chat</span>
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* LISTADO DE CONVERSACIONES */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
            Tus Conversaciones
          </div>

          {conversations.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-6 px-3">
              No tienes chats previos. ¡Inicia uno nuevo!
            </div>
          ) : (
            conversations.map((c) => {
              const isActive = currentConversationId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => seleccionarConversacion(c.id)}
                  className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-all ${
                    isActive
                      ? 'bg-blue-600/15 text-cyan-300 font-medium border border-cyan-500/30 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate pr-6">
                    <span className="text-sm shrink-0">💬</span>
                    <span className="truncate">{c.title || 'Conversación'}</span>
                  </div>

                  {/* BOTÓN ELIMINAR CHAT */}
                  <button
                    onClick={(e) => eliminarConversacion(e, c.id)}
                    title="Eliminar conversación"
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-slate-400 p-1 rounded transition-opacity"
                  >
                    🗑️
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* PIE DEL SIDEBAR: USUARIO */}
        <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2 truncate">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="truncate">{user?.firstName || user?.username || 'Invitado'}</span>
          </div>
          {isLoaded && isSignedIn && <UserButton afterSignOutUrl="/" />}
        </div>
      </aside>

      {/* --- CONTENEDOR PRINCIPAL DEL CHAT --- */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* CABECERA */}
        <header className="flex items-center justify-between px-3 sm:px-6 py-3 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md sticky top-0 z-10 w-full shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 bg-slate-800 text-slate-300 rounded-lg border border-slate-700 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0 hidden sm:block" />
            <h1 className="text-base sm:text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent truncate">
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
              <span className="text-[11px] text-emerald-400 font-medium">{uploadStatus}</span>
            )}

            {isLoaded && !isSignedIn && (
              <SignInButton mode="modal">
                <button className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 sm:px-3 py-1.5 rounded-lg font-medium transition-all shadow-md">
                  Entrar
                </button>
              </SignInButton>
            )}
          </div>
        </header>

        {/* ZONA DE MENSAJES */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 max-w-4xl w-full mx-auto min-w-0">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}
            >
              <div
                className={`max-w-[92%] sm:max-w-[80%] rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm leading-relaxed shadow-sm break-words ${
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
                  <>
                    <div className="space-y-2 [&>p]:leading-relaxed [&>ul]:list-disc [&>ul]:ml-4 [&>ul]:space-y-1 [&>ol]:list-decimal [&>ol]:ml-4 [&>ol]:space-y-1 [&>pre]:bg-slate-950 [&>pre]:p-3 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>code]:bg-slate-800 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>table]:w-full [&>table]:my-2 [&>table]:border-collapse [&>table]:text-xs [&>table]:overflow-x-auto [&>table]:block [&>thead]:bg-slate-800/80 [&>th]:border [&>th]:border-slate-700 [&>th]:p-2 [&>th]:text-left [&>th]:font-semibold [&>td]:border [&>td]:border-slate-800 [&>td]:p-2">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>

                    {/* BOTÓN DE ALTAVOZ / REPRODUCIR VOZ */}
                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800/60">
                      <button
                        onClick={() => reproducirAudioTexto(msg.content, index)}
                        title="Escuchar mensaje"
                        className={`text-xs flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors ${
                          reproduciendoIndex === index
                            ? 'text-cyan-400 bg-cyan-950/60 border border-cyan-500/40 animate-pulse'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <span>{reproduciendoIndex === index ? '⏹️' : '🔊'}</span>
                        <span className="text-[11px]">
                          {reproduciendoIndex === index ? 'Detener' : 'Escuchar'}
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
              {msg.intent && (
                <span className="text-[9px] sm:text-[10px] text-slate-400 mt-1 px-1 font-mono uppercase">
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

        {/* BARRA DE ENTRADA (FOOTER) */}
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

            {/* BOTÓN ADJUNTAR */}
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

            {/* CAMPO DE TEXTO */}
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
              className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
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
    </div>
  );
}