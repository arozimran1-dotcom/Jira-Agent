import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: "foo" });
const chat = ai.chats.create({ model: "gemini-3.5-flash" });
(async () => {
  try {
    await chat.sendMessage({ message: [{ functionResponse: { name: "search", response: {} } }] });
    console.log("Function response ok");
  } catch (e) { console.error("Function response error:", e.message); }
})();
