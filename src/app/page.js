'use client';

import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Sistemas listos y en línea, Alexis. ¿En qué puedo ayudarte hoy?', intent: 'GENERAL_CHAT' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const chatEndRef = useRef(null);
  const recordingStartTimeRef = useRef(0); // Para controlar clics cortos

  // Cambia 'localhost' por tu IP local de Windows (ej. 192.168.1.X) cuando entres desde el móvil
  const BACKEND_URL = 'http://localhost:8000/api/v1';

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // --- ENVIAR MENSAJE DE TEXTO ---
  const handleSendText = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userMessage = inputText;
    setInputText('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, history: [], groq_api_key: "" }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Error en el servidor central.');
      }
      
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response, intent: data.intent }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `💥 ${error.message}`, intent: 'ERROR' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- LÓGICA DE GRABACIÓN DE VOZ MEJORADA ---
  const startRecording = async (e) => {
    if (e) e.preventDefault(); // Detiene la duplicación de eventos Mouse/Touch
    audioChunksRef.current = [];
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      recordingStartTimeRef.current = Date.now(); // Guardamos el momento exacto del inicio

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const duration = Date.now() - recordingStartTimeRef.current;
        
        // Si se mantuvo pulsado menos de 500ms, lo consideramos un clic accidental y cancelamos
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
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', blob, 'voice_input.webm');
    formData.append('groq_api_key', '');

    try {
      const response = await fetch(`${BACKEND_URL}/assistant/voice`, {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'El servidor de voz ha rechazado la petición.');
      }
      
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response, intent: data.intent }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `💥 Nota de voz: ${error.message}`, intent: 'ERROR' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Encabezado */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-cyan-900/40 bg-slate-900/60 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-cyan-500 animate-pulse" />
          <h1 className="text-xl font-bold tracking-wider text-cyan-400">AI ALEXIS</h1>
        </div>
        <span className="text-xs text-slate-400 font-mono tracking-widest">CORE V0.2.1 // REPARADO</span>
      </header>

      {/* Mensajes */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 max-w-4xl w-full mx-auto scrolling-touch">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 shadow-lg ${
              msg.role === 'user' 
                ? 'bg-cyan-600 text-white rounded-br-none' 
                : msg.intent === 'ERROR'
                ? 'bg-red-950/80 border border-red-900 text-red-200 rounded-bl-none'
                : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
            }`}>
              {msg.role === 'assistant' && (
                <span className="block text-[10px] font-mono uppercase tracking-wider text-cyan-500 mb-1">
                  [{msg.intent || 'SYSTEM'}]
                </span>
              )}
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-bl-none p-4 max-w-[85%]">
              <div className="flex gap-1.5 items-center py-1">
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce" />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </main>

      {/* Input */}
      <footer className="p-4 border-t border-slate-900 bg-slate-900/40 backdrop-blur">
        <form onSubmit={handleSendText} className="max-w-4xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className={`p-4 rounded-full transition-all duration-300 select-none touch-none ${
              isRecording 
                ? 'bg-red-600 scale-110 shadow-red-900/50 shadow-2xl' 
                : 'bg-slate-800 hover:bg-slate-700 text-cyan-400'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={isRecording ? 'Escuchando... mantén pulsado para hablar' : 'Escribe un comando o mantén el micro...'}
            disabled={isRecording}
            className="flex-1 bg-slate-950 border border-slate-850 rounded-full px-5 py-3.5 text-sm focus:outline-none focus:border-cyan-500 transition text-slate-100 placeholder-slate-500"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="p-4 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white disabled:bg-slate-800 disabled:text-slate-600 transition-all shadow-lg"
          >
            <svg className="w-5 h-5 transform rotate-90" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </form>
      </footer>
    </div>
  );
}