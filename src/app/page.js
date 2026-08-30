'use client';

import { useState, useRef, useEffect } from 'react';
import { useUser, SignInButton, UserButton } from '@clerk/nextjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

export default function Home() {
  // --- AUTENTICACIÓN CON CLERK ---
  const { user, isLoaded, isSignedIn } = useUser();
  const userId = user?.id || 'guest_user';

  // --- ESTADOS DE CONVERSACIONES / SESIONES ---
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Estados para Visión Multimodal
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Estados para Text-to-Speech (TTS)
  const [reproduciendoIndex, setReproduciendoIndex] = useState(null);
  const [audioLoadingIndex, setAudioLoadingIndex] = useState(null);
  const currentAudioRef = useRef(null);
  const abortControllerRef = useRef(null);

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

  // --- 1. CARGAR / BUSCAR CONVERSACIONES ---
  const cargarConversaciones = async (busqueda = '') => {
    if (!isSignedIn || !user) return;

    try {
      const url = busqueda.trim()
        ? `${API_URL}/assistant/conversations/search/${user.id}?q=${encodeURIComponent(busqueda.trim())}`
        : `${API_URL}/assistant/conversations/${user.id}`;

      const res = await fetch(url);
      if (!res.ok) return;

      const data = await res.json();
      const lista = data.conversations || [];
      setConversations(lista);

      if (!currentConversationId && lista.length > 0 && !busqueda.trim()) {
        seleccionarConversacion(lista[0].id);
      }
    } catch (error) {
      console.error('Error al cargar conversaciones:', error);
    }
  };

  useEffect(() => {
    cargarConversaciones(searchTerm);
  }, [isSignedIn, user, searchTerm]);

  // --- 2. CONTROLADOR DE AUDIO TTS ---
  const detenerAudio = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }
    setReproduciendoIndex(null);
    setAudioLoadingIndex(null);
  };

  const reproducirAudioTexto = async (texto, index = null) => {
    if (reproduciendoIndex === index || (audioLoadingIndex === index && index !== null)) {
      detenerAudio();
      return;
    }

    detenerAudio();
    if (index !== null) setAudioLoadingIndex(index);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`${API_URL}/assistant/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texto }),
        signal: controller.signal
      });

      if (!res.ok) throw new Error('Error al sintetizar voz');

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.onended = () => detenerAudio();
      audio.onerror = () => detenerAudio();

      setAudioLoadingIndex(null);
      if (index !== null) setReproduciendoIndex(index);

      await audio.play();
    } catch (error) {
      if (error.name !== 'AbortError') console.error('Error al reproducir audio:', error);
      detenerAudio();
    }
  };

  // --- 3. SELECCIONAR CONVERSACIÓN ---
  const seleccionarConversacion = async (convId) => {
    if (convId === currentConversationId) {
      setSidebarOpen(false);
      return;
    }

    detenerAudio();
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

  // --- 4. CREAR NUEVO CHAT ---
  const crearNuevoChat = () => {
    detenerAudio();
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

  // --- 5. ELIMINAR CONVERSACIÓN ---
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

  // --- 6. EXPORTAR CONVERSACIÓN ---
  const exportarMarkdown = () => {
    if (!currentConversationId) {
      alert('Inicia una conversación para poder exportarla.');
      return;
    }
    window.open(`${API_URL}/assistant/conversation/${currentConversationId}/export/markdown`, '_blank');
    setExportMenuOpen(false);
  };

  const exportarPDF = () => {
    setExportMenuOpen(false);
    setTimeout(() => {
      window.print();
    }, 150);
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

  // --- 7. ENVIAR MENSAJE CON STREAMING SSE Y AUTO-TITULADO ---
  const handleSend = async (e) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage) || loading) return;

    detenerAudio();

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
      },
      {
        role: 'assistant',
        content: '',
        intent: ''
      }
    ]);
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/assistant/chat-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          user_id: userId,
          conversation_id: currentConversationId,
          image: imageToSend
        })
      });

      if (!response.ok) throw new Error('Error al conectar con el servidor en streaming');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const rawData = line.replace('data: ', '').trim();
            if (rawData === '[DONE]') continue;

            try {
              const data = JSON.parse(rawData);

              // 1. Vincular el conversation_id e insertar en la lista lateral si es nueva
              if (data.conversation_id) {
                const activeId = data.conversation_id;
                if (!currentConversationId) {
                  setCurrentConversationId(activeId);
                }

                setConversations((prev) => {
                  const existe = prev.some((c) => c.id === activeId);
                  if (!existe) {
                    return [
                      {
                        id: activeId,
                        title: userMessage.slice(0, 28) + (userMessage.length > 28 ? '...' : ''),
                        updated_at: new Date().toISOString()
                      },
                      ...prev
                    ];
                  }
                  return prev;
                });
              }

              // 2. Actualizar el título inteligente cuando el backend lo emita
              if (data.new_title && data.conversation_id) {
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === data.conversation_id ? { ...c, title: data.new_title } : c
                  )
                );
              }

              // 3. Concatenar tokens del asistente
              setMessages((prev) => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                const lastMsg = updated[lastIndex];

                if (lastMsg && lastMsg.role === 'assistant') {
                  updated[lastIndex] = {
                    ...lastMsg,
                    content: lastMsg.content + (data.token || ''),
                    intent: data.intent || lastMsg.intent
                  };
                }
                return updated;
              });
            } catch (err) {
              console.error('Error parseando chunk SSE:', err);
            }
          }
        }
      }
    } catch (error) {
      setMessages((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (updated[lastIndex]?.role === 'assistant') {
          updated[lastIndex] = {
            role: 'assistant',
            content: '⚠️ No se pudo conectar con el backend.',
            intent: 'ERROR'
          };
        }
        return updated;
      });
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
    detenerAudio();
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
      alert('Permiso de micrófono denegado.');
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
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: data.response, intent: data.intent }]);
      reproducirAudioTexto(data.response);
      cargarConversaciones(searchTerm);
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
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 md:hidden"
        />
      )}

      {/* --- BARRA LATERAL (SIDEBAR) --- */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-30 w-72 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 ease-in-out print:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* BOTÓN NUEVO CHAT */}
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

        {/* BUSCADOR DE CONVERSACIONES */}
        <div className="px-3 pt-2.5 pb-1">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔍 Buscar en chats..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1.5 text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* LISTADO DE CONVERSACIONES */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
            {searchTerm ? 'Resultados de Búsqueda' : 'Tus Conversaciones'}
          </div>

          {conversations.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-6 px-3">
              {searchTerm ? 'No se encontraron coincidencias.' : 'No tienes chats previos.'}
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

        {/* PIE DEL SIDEBAR */}
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
        {/* CABECERA (OCULTA AL IMPRIMIR / PDF) */}
        <header className="flex items-center justify-between px-3 sm:px-6 py-3 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md sticky top-0 z-10 w-full shrink-0 print:hidden">
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

          {/* ACCIONES DE CABECERA */}
          <div className="flex items-center gap-2 shrink-0">
            {currentConversationId && (
              <div className="relative">
                <button
                  onClick={() => setExportMenuOpen(!exportMenuOpen)}
                  title="Exportar conversación"
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 sm:px-3 py-1.5 rounded-lg font-medium transition-all shadow-sm flex items-center gap-1.5"
                >
                  <span>📥</span>
                  <span className="hidden sm:inline">Exportar</span>
                </button>

                {exportMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-44 bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 z-50 text-xs">
                    <button
                      onClick={exportarMarkdown}
                      className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                    >
                      <span>📝</span>
                      <span>Descargar Markdown (.md)</span>
                    </button>
                    <button
                      onClick={exportarPDF}
                      className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                    >
                      <span>📄</span>
                      <span>Imprimir / PDF</span>
                    </button>
                  </div>
                )}
              </div>
            )}

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

        {/* ZONA DE MENSAJES (RENDERIZADO KATEX) */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 max-w-4xl w-full mx-auto min-w-0 print:p-0 print:max-w-full">
          {messages.map((msg, index) => {
            const isLastMessage = index === messages.length - 1;
            const isStreamingEmpty = msg.role === 'assistant' && msg.content === '' && loading && isLastMessage;

            return (
              <div
                key={index}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full print:block print:mb-4`}
              >
                <div
                  className={`max-w-[92%] sm:max-w-[80%] rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm leading-relaxed shadow-sm break-words print:max-w-full print:bg-transparent print:border-none print:text-black ${
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
                  ) : isStreamingEmpty ? (
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" />
                      <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2 [&>p]:leading-relaxed [&>ul]:list-disc [&>ul]:ml-4 [&>ul]:space-y-1 [&>ol]:list-decimal [&>ol]:ml-4 [&>ol]:space-y-1 [&>pre]:bg-slate-950 [&>pre]:p-3 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>code]:bg-slate-800 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>table]:w-full [&>table]:my-2 [&>table]:border-collapse [&>table]:text-xs [&>table]:overflow-x-auto [&>table]:block [&>thead]:bg-slate-800/80 [&>th]:border [&>th]:border-slate-700 [&>th]:p-2 [&>th]:text-left [&>th]:font-semibold [&>td]:border [&>td]:border-slate-800 [&>td]:p-2 print:text-black">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>

                      {/* BOTÓN TTS */}
                      {msg.content && (
                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800/60 print:hidden">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              reproducirAudioTexto(msg.content, index);
                            }}
                            title={
                              reproduciendoIndex === index || audioLoadingIndex === index
                                ? 'Detener audio'
                                : 'Escuchar mensaje'
                            }
                            className={`text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors select-none ${
                              reproduciendoIndex === index
                                ? 'text-cyan-400 bg-cyan-950/70 border border-cyan-500/40 animate-pulse'
                                : audioLoadingIndex === index
                                ? 'text-amber-400 bg-amber-950/50 border border-amber-500/40'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                            }`}
                          >
                            <span>
                              {audioLoadingIndex === index
                                ? '⏳'
                                : reproduciendoIndex === index
                                ? '⏹️'
                                : '🔊'}
                            </span>
                            <span className="text-[11px]">
                              {audioLoadingIndex === index
                                ? 'Cargando...'
                                : reproduciendoIndex === index
                                ? 'Detener'
                                : 'Escuchar'}
                            </span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
                {msg.intent && (
                  <span className="text-[9px] sm:text-[10px] text-slate-400 mt-1 px-1 font-mono uppercase print:hidden">
                    Intención: {msg.intent}
                  </span>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </main>

        {/* BARRA DE ENTRADA (OCULTA AL IMPRIMIR / PDF) */}
        <footer className="p-2.5 sm:p-4 bg-slate-900/90 border-t border-slate-800 backdrop-blur-md shrink-0 w-full print:hidden">
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