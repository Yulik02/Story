import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

app.use(
    cors({
        origin: true,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    }),
)

app.use(express.json({ limit: "2mb" }))
app.use(express.static(path.join(__dirname, "public")))

const PORT = process.env.PORT || 3000
const HF_TOKEN = process.env.HF_TOKEN

function safeJsonParse(text) {
    try {
        return JSON.parse(text)
    } catch {
        // попытка починить JSON
        try {
            const fixed = text
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim()
            return JSON.parse(fixed)
        } catch {
            return null
        }
    }
}

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        huggingface: Boolean(HF_TOKEN),
    })
})

let history = [
    {
        role: "system",
        content:
            "Ты — cyberpunk-интерактивная история. " +
            "Продолжай сюжет последовательно и логично. " +
            "Сохраняй персонажей и последствия. " +
            "Отвечай строго JSON:\n" +
            '{"text":"русский текст","imagePrompt":"english prompt","choices":[{"text":"вариант","next":"id"}]}',
    },
]

app.post("/api/story", async (req, res) => {
    try {
        const { currentText = "", choice = "" } = req.body

        if (!process.env.HF_TOKEN) {
            return res.status(500).json({ error: "HF_TOKEN missing" })
        }

        // 👉 если это первый запрос — используем currentText как старт
        if (history.length === 1 && currentText) {
            history.push({
                role: "user",
                content: `Начало истории: ${currentText}`,
            })
        }

        // 👉 добавляем выбор
        if (choice) {
            history.push({
                role: "user",
                content: `Игрок выбрал: ${choice}`,
            })
        }

        const response = await fetch(
            "https://router.huggingface.co/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.HF_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "meta-llama/Llama-3.3-70B-Instruct",
                    messages: history,
                    temperature: 0.7,
                    max_tokens: 500,
                }),
            },
        )

        const data = await response.json()

        if (!response.ok) {
            return res.status(500).json({
                error: data.error?.message || data.error,
            })
        }

        const generatedText = data?.choices?.[0]?.message?.content || ""

        history.push({
            role: "assistant",
            content: generatedText,
        })

        // 🔥 ограничиваем историю
        if (history.length > 20) {
            history = [history[0], ...history.slice(-19)]
        }

        const parsed = safeJsonParse(generatedText)

        res.json({
            text: parsed?.text || "История продолжается...",
            imagePrompt: parsed?.imagePrompt || "cyberpunk scene",
            choices: parsed?.choices || [{ text: "Продолжить", next: "next" }],
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// Hugging Face БЕСПЛАТНЫЕ картинки
app.post("/api/image", async (req, res) => {
    try {
        if (!HF_TOKEN)
            return res.status(500).json({ error: "HF_TOKEN missing" })

        const { prompt = "" } = req.body

        const response = await fetch(
            "https://router.huggingface.co/nscale/v1/images/generations",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${HF_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt,
                    model: "black-forest-labs/FLUX.1-schnell",
                }),
            },
        )

        if (!response.ok) {
            return res.status(500).json({ error: "Hugging Face API failed" })
        }

        const buffer = await response.arrayBuffer()
        const base64 = Buffer.from(buffer).toString("base64")
        res.json({ imageUrl: `data:image/png;base64,${base64}` })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.listen(PORT, () => {
    console.log(`Server on port ${PORT}`)
})
