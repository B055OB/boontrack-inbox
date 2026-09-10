import { searchPlatformKnowledge } from '@/lib/boonpilotKnowledge';

// Cukup panggil ini di dalam penanganan lokal sebelum dilempar ke AI LLM
const matchedKnowledge = searchPlatformKnowledge(userText);
if (matchedKnowledge) {
  // Langsung tampilkan jawaban platform secara instan
  const localMessage: ChatMessage = {
    id: `ast_${Date.now()}`,
    sender: 'assistant',
    text: matchedKnowledge.text,
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    quick_actions: matchedKnowledge.quick_actions,
  };
  setMessages((prev) => [...prev, localMessage]);
  setLoading(false);
  return;
}

// Jika tidak cocok dengan platform knowledge, biarkan BoonPilot bertindak penuh sebagai Konsultan Bisnis & Sales AI via backend API.