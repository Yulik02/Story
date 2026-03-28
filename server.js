import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

app.post("/api/story", async (req, res) => {
  try {
    const { currentText = "", choice = "" } = req.body || {};

    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: "GROQ_API_KEY is missing" });
    }

    const prompt = `
Ты — движок интерактивной истории в жанре cyberpunk.
Верни ТОЛЬКО JSON без markdown:
{
  "text": "продолжение истории на русском",
  "imagePrompt": "prompt in English for AI image",
  "choices": [
    {"text":"вариант 1","next":"id1"},
    {"text":"вариант 2","next":"id2"}
  ]
}
Не добавляй лишний текст.
История: ${currentText}
Выбор пользователя: ${choice}
`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: "You are a helpful assistant that returns only valid JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 500
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || data?.message || "Groq request failed"
      });
    }

    const content = data?.choices?.[0]?.message?.content || "";
    const cleaned = content.replace(/```json\s*|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        text: cleaned || "AI не вернул корректный JSON.",
        imagePrompt: "cyberpunk futuristic scene",
        choices: [{ text: "Продолжить", next: "start" }]
      };
    }

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/image", async (req, res) => {
  const { prompt = "" } = req.body || {};
  res.json({
    imageUrl: `https://placehold.co/1024x576/0f172a/fbbf24?text=${encodeURIComponent(prompt.slice(0, 40) || "AI Image")}`
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
