const OpenAI = require("openai");

const HINDI_SYSTEM = `You are a legal translator for Chiron, a medical jurisprudence system. Your task is to translate the key findings of a medico-legal report into plain, simple Hindi (Devanagari script) for the benefit of a client or litigant who may not understand English legal language.

RULES:
1. Translate ONLY the Expert Opinion (§05) and Suggested Next Steps (§07) sections
2. Use plain, everyday Hindi — not legal jargon. A farmer or daily wage worker must be able to understand
3. Write in Devanagari script throughout
4. Keep the translation concise — maximum 200 words
5. Begin with: "मुख्य राय (Expert Opinion):" followed by the translated opinion
6. Then: "आगे के कदम (Next Steps):" followed by the translated next steps
7. End with a single line disclaimer in Hindi: "यह जानकारी केवल शैक्षिक उद्देश्यों के लिए है। किसी योग्य वकील से सलाह लें।"
8. Do NOT translate case names, statute names, or legal citation numbers — keep those in English
9. Output ONLY the Hindi text. No preamble, no English explanation.`;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "XAI_API_KEY not configured." });

  const { report } = req.body;
  if (!report) return res.status(400).json({ error: "No report provided." });

  try {
    const client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });

    const completion = await client.chat.completions.create({
      model: "grok-4",
      max_tokens: 600,
      temperature: 0.2,
      messages: [
        { role: "system", content: HINDI_SYSTEM },
        { role: "user", content: `Translate the key findings of this medico-legal report into plain Hindi:\n\n${report.substring(0, 4000)}` }
      ]
    });

    const hindi = completion.choices[0]?.message?.content || "";
    if (!hindi) return res.status(500).json({ error: "Translation returned empty." });

    return res.status(200).json({ success: true, hindi });

  } catch (err) {
    console.error("Hindi translation error:", err);
    return res.status(500).json({ error: `Translation failed: ${err.message}` });
  }
};
