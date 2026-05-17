const OpenAI = require("openai");
const crypto = require("crypto");
// env: XAI_API_KEY required

const SYSTEM_PROMPT = `You are Chiron — a Medical Jurisprudence Intelligence System specialised exclusively in Indian law.

Your name carries deliberate meaning. In Greek mythology, Chiron was the wisest and most just of the centaurs — the supreme authority on medicine, and the teacher of heroes. He taught Asclepius the art of healing, Achilles justice, and Jason leadership. He stood at the precise intersection of medical knowledge and law — which is exactly where you operate.

CORE COMPETENCIES:
- Medico-legal analysis: injury classification, cause vs manner of death, forensic pathology, ante-mortem vs post-mortem differentiation, wound analysis, ligature marks, time of death estimation, sexual offence examination findings
- Medical malpractice: Bolam test application, standard of care breach, duty of care, res ipsa loquitur, causation chain, hospital vicarious liability, contributory negligence
- Indian medical regulations: NMC Act 2019, MTP Act 1971 (amended 2021), POCSO Act 2012, Mental Healthcare Act 2017, DPDP Act 2023, Transplantation of Human Organs Act 1994, Clinical Establishments Act 2010
- Criminal law intersection: BNS 2023, BNSS 2023, Bharatiya Sakshya Adhiniyam 2023, Consumer Protection Act 2019, Dowry Prohibition Act 1961, Protection of Women from Domestic Violence Act 2005
- Expert witness testimony: court-ready opinions structured for Sessions Court or High Court, judicial communication, evidentiary framing, chain of custody analysis

NON-NEGOTIABLE RULES:
1. Jurisdiction is exclusively India. Always cite BNS 2023 (not IPC), BNSS 2023 (not CrPC), Bharatiya Sakshya Adhiniyam 2023 (not Indian Evidence Act) as primary statutes unless the case predates 2023
2. Always conclude with a disclaimer — output is educational only, never licensed legal or medical advice
3. Never prescribe specific legal strategy — suggest next steps educationally only
4. Cite real Supreme Court and High Court precedents with accurate year and citation
5. Structure every response using EXACTLY §1 through §8 section format as instructed
6. Use precise medical and legal terminology throughout`;

const CONFIDENCE_SYSTEM = `You are a responsible AI auditor for Chiron, a medical jurisprudence system. Your job is to score each section of a medico-legal report for confidence and flag hallucination risks.

You must respond with ONLY valid JSON — no preamble, no markdown, no backticks. Return exactly this structure:
{
  "sections": [
    {
      "num": "01",
      "title": "CASE SUMMARY",
      "score": 8,
      "risk": "low",
      "flag": null
    }
  ],
  "overallScore": 7,
  "criticalFlags": []
}

Scoring rules:
- score: 1-10 (10 = fully grounded in provided facts, 1 = highly speculative)
- risk: "low" | "medium" | "high"
- flag: null OR a specific string describing the hallucination risk (max 120 chars)
- criticalFlags: array of strings for cross-cutting risks affecting multiple sections

High risk triggers: toxicology conclusions without concentration data, time-of-death estimates without PMI data, statutory citations that may be outdated, medical conclusions without examination findings, any conclusion that requires facts not stated in the case.`;

const MODULE_MAP = {
  "medico-legal": "Medico-Legal Analysis — focus on: injury classification (grievous/simple under BNS), cause vs manner of death distinction, forensic pathology findings, ante-mortem vs post-mortem injury differentiation, wound ballistics if applicable, time of death estimation, ligature mark analysis if applicable",
  "malpractice": "Medical Malpractice Analysis — focus on: Bolam test application, standard of care breach identification, duty of care establishment, res ipsa loquitur applicability, causation chain, hospital vicarious liability, Consumer Protection Act 2019 jurisdiction, NMC professional misconduct provisions",
  "regulations": "Medical Regulations & Professional Ethics — focus on: NMC Act 2019 provisions, informed vs simple consent doctrine (Samira Kohli standard), patient confidentiality obligations, professional misconduct categories, registration and certification requirements, ethical violations and their consequences under Indian law",
  "expert": "Expert Witness Testimony Simulation — produce a complete court-ready expert opinion as a forensic pathologist or medical expert would deliver before a Sessions Judge or High Court. Use formal testimony register. Structure as: qualifications statement, factual summary, opinion on each medical question raised, basis of opinion, limitations of opinion.",
  "full": "Full Comprehensive Report — analyse ALL domains simultaneously: forensic/medico-legal findings, malpractice liability assessment, regulatory and ethical violations, criminal law intersection with applicable BNS/BNSS sections, and a concluding expert witness opinion"
};

const FORMAT_MAP = {
  "court": "FORMAT: Formal court submission. Use precise legal language, dense citations, formal register throughout. Suitable for filing before a judicial authority.",
  "study": "FORMAT: Academic law study. Make reasoning explicit and doctrinal. Include explanatory notes on why each statute applies. Suitable for law school analysis and research.",
  "brief": "FORMAT: Concise legal brief. Tight reasoning, key points only, minimal elaboration. Suitable for quick practitioner reference."
};

function generateSHA256(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function generateReportId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CHIRON-${timestamp}-${random}`;
}

function buildCanonicalContent(reportId, timestamp, reportText, caseHash) {
  return [`REPORT_ID:${reportId}`, `TIMESTAMP:${timestamp}`, `CASE_HASH:${caseHash}`, `CONTENT:${reportText}`].join("\n");
}

async function generateConfidenceScores(client, reportText, caseText) {
  try {
    const completion = await client.chat.completions.create({
      model: "grok-4",
      max_tokens: 800,
      temperature: 0.1,
      messages: [
        { role: "system", content: CONFIDENCE_SYSTEM },
        { role: "user", content: `CASE INPUT:\n${caseText.substring(0, 1500)}\n\nREPORT TO AUDIT:\n${reportText.substring(0, 3000)}\n\nReturn JSON confidence scores only.` }
      ]
    });

    const raw = completion.choices[0]?.message?.content || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error("Confidence scoring failed:", err.message);
    // Return safe defaults if scoring fails
    return {
      sections: [
        { num: "01", title: "CASE SUMMARY", score: 7, risk: "low", flag: null },
        { num: "02", title: "MEDICO-LEGAL ISSUES", score: 7, risk: "medium", flag: "Verify all forensic findings against source documents" },
        { num: "03", title: "STATUTES & PRECEDENTS", score: 8, risk: "low", flag: null },
        { num: "04", title: "MEDICO-LEGAL ANALYSIS", score: 6, risk: "medium", flag: "Analysis based only on facts as presented" },
        { num: "05", title: "EXPERT OPINION", score: 6, risk: "medium", flag: "Opinion may be affected by missing clinical data" },
        { num: "06", title: "LIMITATIONS", score: 9, risk: "low", flag: null },
        { num: "07", title: "NEXT STEPS", score: 8, risk: "low", flag: null },
        { num: "08", title: "DISCLAIMER", score: 10, risk: "low", flag: null }
      ],
      overallScore: 7,
      criticalFlags: ["Confidence scoring temporarily unavailable — manual review recommended"]
    };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "XAI_API_KEY not configured. Add it in Vercel Dashboard → Settings → Environment Variables." });
  }

  const { caseText, module: mod, format, focusAreas } = req.body;

  if (!caseText || caseText.trim().length < 20) {
    return res.status(400).json({ error: "Case description too short. Please provide sufficient detail." });
  }

  const moduleDesc = MODULE_MAP[mod] || MODULE_MAP["full"];
  const formatDesc = FORMAT_MAP[format] || FORMAT_MAP["study"];
  const focusStr = focusAreas?.length > 0 ? `PRIORITY FOCUS AREAS: ${focusAreas.join(", ")}` : "";

  const userPrompt = `${formatDesc}
ANALYSIS DOMAIN: ${moduleDesc}
${focusStr}

CASE SUBMITTED FOR ANALYSIS:
${caseText.trim()}

Generate a complete medico-legal analysis report using EXACTLY this structure:

§1. CASE SUMMARY
Concise 2-3 paragraph factual summary. Identify parties, timeline, core allegations, and medical context.

§2. MEDICO-LEGAL ISSUES IDENTIFIED
Enumerate every medico-legal issue raised by the facts. Use correct forensic and medical terminology. Number each issue.

§3. APPLICABLE INDIAN STATUTES AND PRECEDENTS
List every relevant statutory provision and judicial precedent. Format each as:
- [Statute/Section]: [Brief statement of relevance]
- [Case Name (Year) Citation]: [Holding and how it applies]

§4. MEDICO-LEGAL ANALYSIS
In-depth reasoning applying statutes and principles to the specific facts. Address causation, liability, standard of care, evidentiary weight, and conflicts in evidence.

§5. EVIDENCE-BASED EXPERT OPINION
Court-presentable professional opinion. Write as a qualified forensic expert presenting before a judicial forum. State opinions definitively where evidence supports it, with qualification where it does not.

§6. LIMITATIONS AND GAPS IN ANALYSIS
Missing evidence, absent reports, unverified facts — and how each affects the analysis.

§7. SUGGESTED NEXT STEPS
Investigations to commission, experts to engage, documents to secure. Educational framing only.

§8. DISCLAIMER
This report is generated by Chiron, an AI-powered educational tool for Indian medico-legal jurisprudence. It does not constitute licensed legal advice, medical advice, or a substitute for a qualified advocate or registered medical practitioner. All analysis is for academic and study purposes only.`;

  try {
    const client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });

    // Primary report generation
    const completion = await client.chat.completions.create({
      model: "grok-4",
      max_tokens: 4000,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    });

    const reportText = completion.choices[0]?.message?.content || "";
    if (!reportText) return res.status(500).json({ error: "Grok returned an empty response. Please try again." });

    // Confidence scoring — second Grok call
    const confidence = await generateConfidenceScores(client, reportText, caseText);

    // SHA-256 certificate
    const reportId = generateReportId();
    const timestamp = new Date().toISOString();
    const caseHash = generateSHA256(caseText.trim());
    const canonicalContent = buildCanonicalContent(reportId, timestamp, reportText, caseHash);
    const reportHash = generateSHA256(canonicalContent);

    const certificate = {
      reportId, timestamp, caseHash, reportHash,
      algorithm: "SHA-256",
      standard: "BSA 2023 S.61-65 / IT Act 2000 S.85B",
      verifyUrl: `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ""}/verify.html?hash=${reportHash}&id=${reportId}`,
      model: completion.model,
      module: mod || "full",
      format: format || "study",
      tokens: completion.usage?.total_tokens || 0
    };

    return res.status(200).json({ success: true, report: reportText, certificate, confidence });

  } catch (err) {
    console.error("Grok API error:", err);
    if (err.status === 401) return res.status(401).json({ error: "Invalid xAI API key. Check XAI_API_KEY in Vercel environment variables." });
    if (err.status === 429) return res.status(429).json({ error: "Rate limit hit. Please wait a moment and try again." });
    if (err.status === 402) return res.status(402).json({ error: "Insufficient xAI credits. Top up at console.x.ai" });
    return res.status(500).json({ error: `Analysis failed: ${err.message || "Unknown error"}` });
  }
};
