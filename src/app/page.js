'use client';

import { useState, useRef, useEffect } from 'react';

export default function Home() {
  // --- ESTADOS ---
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '¡Hola, Alexis! Soy AI Alexis. Todos los sistemas están en línea y conectados a la nube. ¿En qué te puedo ayudar hoy?'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState('fernando'); // ID de usuario en Atlas
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  // --- REFS ---
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartTimeRef = useRef(0);

  // Variable de entorno apuntando a Render
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ai-alexis-backend.onrender.com/api/v1';

  // Auto-scroll al recibir mensajes
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // --- 1. ENVIAR MENSAJE DE TEXTO ---
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          user_id: userId
        })
      });

      if (!response.ok) {
        throw new Error('Error al conectar con el servidor');
      }

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
          content: '⚠️ No se pudo establecer conexión con el servidor en Render. Comprueba la red o vuelve a intentarlo.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // --- 2. SUBIR ARCHIVO PDF / CV ---
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Por favor, selecciona un archivo PDF.');
      return;
    }

    setUploading(true);
    setUploadStatus('Subiendo y extrayendo CV...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', userId);

    try {
      const response = await fetch(`${API_URL}/assistant/upload-cv`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Error al subir el CV');

      const data = await response.json();
      setUploadStatus('✅ CV guardado en Atlas');
      
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `📄 **Nuevo CV indexado con éxito para "${userId}"**: Archivo *${data.filename}* guardado de forma permanente en MongoDB Atlas Cloud.`
        }
      ]);
    } catch (error) {
      setUploadStatus('❌ Error al subir');
      alert('Ocurrió un error al subir el PDF a Atlas.');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadStatus(''), 4000);
    }
  };

  // --- 3. GRABACIÓN Y ENVÍO DE NOTAS DE VOZ ---
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
        
        // Evitar activaciones por clics rápidos (< 500ms)
        if (duration < 500) {
          stream.getTracks().forEach(track => track.stop());
          setIsRecording(false);
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await enviarAudioAlBackend(audioBlob);
        stream.getTracks().forEach(track => track.stop());
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
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'El servidor de voz ha rechazado la petición.');
      }
      
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response, intent: data.intent }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev, 
        { role: 'assistant', content: `💥 Nota de voz: ${error.message}`, intent: 'ERROR' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            AI Alexis
          </h1>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
            Cloud 2026
          </span>
        </div>

        {/* Acciones del Header (Subida de CV) */}
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf"
            className="hidden"
          />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium transition-all shadow-md hover:shadow-blue-500/20 disabled:opacity-50 flex items-center gap-1.5"
          >
            📄 {uploading ? 'Cargando...' : 'Subir CV'}
          </button>

          {uploadStatus && (
            <span className="text-xs text-emerald-400 font-medium hidden sm:inline">
              {uploadStatus}
            </span>
          )}
        </div>
      </header>

      {/* FEED DE MENSAJES */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-4xl w-full mx-auto">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex flex-col ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : msg.intent === 'ERROR'
                  ? 'bg-red-950/80 border border-red-900 text-red-200 rounded-bl-none'
                  : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
              }`}
            >
              {msg.content}
            </div>
            {msg.intent && (
              <span className="text-[10px] text-slate-500 mt-1 px-1 font-mono uppercase">
                Intención: {msg.intent}
              </span>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm bg-slate-900/50 border border-slate-800/80 w-fit px-4 py-2 rounded-2xl rounded-bl-none">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" />
              <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
            <span>Procesando consulta...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* CAJA DE ENTRADA CON MICRÓFONO Y TEXTO */}
      <footer className="p-4 bg-slate-900/80 border-t border-slate-800 backdrop-blur-md">
        <form
          onSubmit={handleSend}
          className="max-w-4xl mx-auto flex items-center gap-2"
        >
          {/* Botón del Micrófono */}
          <button
            type="button"
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            title="Mantén pulsado para hablar"
            className={`p-3 rounded-xl transition-all duration-300 select-none touch-none flex items-center justify-center ${
              isRecording 
                ? 'bg-red-600 text-white scale-105 shadow-red-500/50 shadow-lg animate-pulse' 
                : 'bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>

          {/* Campo de Texto */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isRecording}
            placeholder={isRecording ? 'Escuchando... mantén pulsado' : 'Escribe un mensaje, pide optimizar tu CV o consulta el clima...'}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
          />

          {/* Botón Enviar */}
          <button
            type="submit"
            disabled={loading || !input.trim() || isRecording}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-all shadow-lg hover:shadow-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Enviar
          </button>
        </form>
      </footer>
    </div>
  );
}