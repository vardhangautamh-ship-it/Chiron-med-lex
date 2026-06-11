const OpenAI = require("openai");
const crypto = require("crypto");

const SYSTEM_PROMPT = `You are Chiron — a Medical Jurisprudence Intelligence System specialised exclusively in Indian law.

Your name carries deliberate meaning. In Greek mythology, Chiron was the wisest and most just of the centaurs — the supreme authority on medicine, and the teacher of heroes. He stood at the precise intersection of medical knowledge and law — which is exactly where you operate.

You apply medical science to Indian legal questions with the precision of a forensic expert and the judgment of a senior advocate. You provide structured, court-presentable medico-legal analysis strictly for educational and legal study purposes.

NON-NEGOTIABLE RULES:
1. Jurisdiction is exclusively India. For incidents on or after 1 July 2024, cite BNS 2023 (not IPC), BNSS 2023 (not CrPC), and Bharatiya Sakshya Adhiniyam 2023 (not the Indian Evidence Act). For incidents BEFORE 1 July 2024, the correct statutes are IPC, CrPC, and the Indian Evidence Act — do NOT apply BNS/BNSS/BSA retrospectively. If a date is given, check it carefully and apply the correct code. State which code applies and why.
2. Always conclude with a disclaimer — output is educational only, never licensed legal or medical advice.
3. Never prescribe specific legal strategy — suggest next steps educationally only.
4. Cite real Supreme Court and High Court precedents with accurate year and citation.
5. Structure every response using EXACTLY the §1 through §8 section format as instructed.
6. Use precise medical and legal terminology throughout — write as a forensic expert and legal scholar simultaneously.`;

const CONFIDENCE_SYSTEM = `You are a responsible AI auditor for Chiron, a medical jurisprudence system. Score each section of a medico-legal report for confidence and flag hallucination risks.

Respond with ONLY valid JSON — no preamble, no markdown, no backticks:
{
  "sections": [ { "num": "01", "title": "CASE SUMMARY", "score": 8, "risk": "low", "flag": null } ],
  "overallScore": 7,
  "criticalFlags": []
}

Scoring rules:
- score: 1-10 (10 = fully grounded in provided facts, 1 = highly speculative)
- risk: "low" | "medium" | "high"
- flag: null OR a specific string describing the hallucination risk (max 120 chars)
- criticalFlags: array of strings for cross-cutting risks affecting multiple sections

High-risk triggers: toxicology conclusions without concentration data; time-of-death estimates without PMI data; statutory citations that may be outdated OR applied to the wrong era (e.g. BNS 2023 cited for a pre-1 July 2024 incident); medical conclusions without examination findings; any conclusion requiring facts not stated in the case. Treat a wrong-era statute citation as HIGH risk and score that section at 3 or below.`;

// ── 9 GENUINELY DISTINCT MODULE PROMPTS ──
const MODULE_MAP = {
  "full": {
    label: "Full Report",
    focus: `COMPREHENSIVE MEDICO-LEGAL REPORT. Analyse ALL domains simultaneously: forensic/medico-legal findings, malpractice liability assessment, regulatory and ethical violations, criminal-law intersection with applicable sections, and a concluding expert opinion. This is the broadest analysis — cover injury/death interpretation, standard of care, statutory liability, and evidentiary weight together. Do not narrow to a single lens.`
  },
  "medico-legal": {
    label: "Medico-Legal",
    focus: `MEDICO-LEGAL ANALYSIS. Concentrate on forensic medicine and its legal classification. Prioritise: injury classification (simple vs grievous hurt and the corresponding statutory provisions), cause of death vs manner of death distinction, ante-mortem vs post-mortem injury differentiation, wound interpretation (incised, lacerated, contused, firearm, thermal), ligature mark analysis, time-since-death estimation from PMI markers, and how each finding maps to a specific offence. Keep malpractice and pure case-law discussion secondary; the spine of this report is forensic interpretation translated into legal classification.`
  },
  "malpractice": {
    label: "Malpractice",
    focus: `MEDICAL MALPRACTICE ANALYSIS. Concentrate on civil and criminal medical negligence. Prioritise: the Bolam test as received in India, standard-of-care breach identification, duty of care, the four elements of negligence (duty, breach, causation, damage), res ipsa loquitur where applicable, the Jacob Mathew gross-negligence threshold for criminal liability, hospital vicarious liability (respondeat superior), Consumer Protection Act 2019 jurisdiction and "deficiency in service", and NMC professional-misconduct exposure. Distinguish clearly between civil liability (compensation) and criminal liability (prosecution). Forensic-pathology detail is secondary unless it bears on causation.`
  },
  "regulations": {
    label: "Regulations & Ethics",
    focus: `MEDICAL REGULATIONS & PROFESSIONAL ETHICS. Concentrate on the regulatory and consent framework rather than forensic pathology. Prioritise: NMC Act 2019 and the Professional Conduct Regulations, informed-consent doctrine (the Samira Kohli standard; consent specific to the procedure; battery vs negligence where consent is exceeded), patient confidentiality and its statutory limits, MTP Act 1971 (as amended 2021) and its conditions, POCSO Act 2012 mandatory-reporting obligations and their interaction with confidentiality, Clinical Establishments Act compliance, and the consequences of registration/certification lapses. Frame the analysis around duties, consent, and professional-conduct rules.`
  },
  "expert": {
    label: "Expert Witness",
    focus: `EXPERT WITNESS TESTIMONY SIMULATION. Produce a complete court-ready expert opinion as a qualified forensic expert would deliver before a Sessions Judge or High Court. Use a formal testimony register throughout. Within the 8-section structure, weight the report heavily toward §05: open with a qualifications statement, give a factual summary as understood by the expert, then a reasoned opinion on each medical question raised, the scientific basis for each opinion, and an explicit statement of the limits of the opinion. Address the admissibility and evidentiary weight of expert testimony (BSA 2023 §39 / IEA §45 depending on era). Write as testimony, not as an essay.`
  },
  "inquest": {
    label: "Inquest Brief",
    focus: `INQUEST BRIEF. This is a procedural-forensic analysis centred on the death-investigation machinery. Prioritise: whether the death is one requiring inquest, the correct inquest pathway (magisterial inquest under BNSS 2023 §196 / §194 for custodial and specified deaths, police inquest under §174 BNSS, or the pre-July-2024 equivalents CrPC §174/§176), who is the competent authority, the mandatory steps (inquest report, identification, dispatch for post-mortem), and any procedural violation in the sequence followed. Analyse the consequences of a defective or reversed inquest-to-post-mortem sequence on evidentiary integrity. Flag custodial-death obligations specifically (mandatory judicial inquest, videography, time limits). The output should read like a brief on whether the death investigation was lawfully conducted.`
  },
  "autopsy": {
    label: "Autopsy Inference",
    focus: `AUTOPSY INFERENCE. This is a pure post-mortem interpretation report. Work strictly from the autopsy and histopathology findings provided and reason like a forensic pathologist reading a PM report. Prioritise: systematic interpretation of each finding (external injuries, internal organs, effusions, oedema, petechiae, fractures), what each finding indicates and excludes, reconciliation of findings into a coherent cause-of-death opinion, identification of artefacts vs ante-mortem pathology, and what additional sampling (histology, frozen section, vitreous, specific assays) would resolve remaining ambiguity. Keep statutory and case-law discussion brief and in service of the pathological interpretation. If autopsy detail is thin, say so explicitly and state what cannot be concluded.`
  },
  "toxicology": {
    label: "Toxicology",
    focus: `TOXICOLOGY ANALYSIS. Concentrate on poisons, drugs, and chemical causation. Prioritise: interpretation of any concentrations reported (against therapeutic, toxic, and fatal reference ranges), the clinical/forensic syndrome the agent produces and whether the findings match it, post-mortem redistribution and degradation effects, sampling adequacy (which specimens were and were not collected, and what that prevents concluding), the distinction between accidental, suicidal, and homicidal administration, and chain-of-custody integrity for the toxicology samples. Where concentration data is absent, state plainly that quantitative conclusions cannot be drawn. Map the toxicological conclusion to the relevant offence. This report lives or dies on rigorous handling of the chemical evidence.`
  },
  "precedent": {
    label: "Precedent Search",
    focus: `PRECEDENT SEARCH — CASE-LAW-FIRST ANALYSIS. Invert the usual emphasis: lead with the governing authorities. Within the 8-section structure, make §03 the centre of gravity — assemble the most relevant Supreme Court and High Court precedents for the issues raised, and for EACH precedent give the citation, the ratio/holding, the material facts, and a precise statement of how it applies to (or is distinguishable from) the present facts. Organise precedents by issue. The analysis sections should then apply those authorities to the facts rather than reasoning from first principles. Prioritise breadth and accuracy of citation and the doctrine of binding precedent. Forensic detail is secondary to legal authority here.`
  }
};

const FORMAT_MAP = {
  "court":  "FORMAT: Formal court submission. Precise legal language, dense citations, formal register throughout. Suitable for filing before a judicial authority.",
  "study":  "FORMAT: Academic law study. Make reasoning explicit and doctrinal. Include explanatory notes on why each statute or precedent applies. Suitable for law-school analysis.",
  "brief":  "FORMAT: Concise legal brief. Tight reasoning, key points only, minimal elaboration. Suitable for quick practitioner reference."
};

function sha256(content) { return crypto.createHash("sha256").update(content, "utf8").digest("hex"); }

function reportId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CHIRON-${ts}-${rand}`;
}

function canonical(id, timestamp, reportText, caseHash) {
  return [`REPORT_ID:${id}`, `TIMESTAMP:${timestamp}`, `CASE_HASH:${caseHash}`, `CONTENT:${reportText}`].join("\n");
}

async function confidenceScores(client, reportText, caseText) {
  try {
    const c = await client.chat.completions.create({
      model: "grok-4", max_tokens: 800, temperature: 0.1,
      messages: [
        { role: "system", content: CONFIDENCE_SYSTEM },
        { role: "user", content: `CASE INPUT:\n${caseText.substring(0,1500)}\n\nREPORT TO AUDIT:\n${reportText.substring(0,3000)}\n\nReturn JSON confidence scores only.` }
      ]
    });
    const raw = c.choices[0]?.message?.content || "";
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (err) {
    console.error("Confidence scoring failed:", err.message);
    return {
      sections: [
        { num:"01", title:"CASE SUMMARY", score:7, risk:"low", flag:null },
        { num:"02", title:"ISSUES", score:7, risk:"medium", flag:"Verify findings against source documents" },
        { num:"03", title:"STATUTES & PRECEDENTS", score:8, risk:"low", flag:null },
        { num:"04", title:"ANALYSIS", score:6, risk:"medium", flag:"Based only on facts as presented" },
        { num:"05", title:"EXPERT OPINION", score:6, risk:"medium", flag:"May be affected by missing clinical data" },
        { num:"06", title:"LIMITATIONS", score:9, risk:"low", flag:null },
        { num:"07", title:"NEXT STEPS", score:8, risk:"low", flag:null },
        { num:"08", title:"DISCLAIMER", score:10, risk:"low", flag:null }
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
  if (!apiKey) return res.status(500).json({ error: "XAI_API_KEY not configured. Add it in Vercel → Settings → Environment Variables." });

  const { caseText, module: mod, format, options } = req.body;
  if (!caseText || caseText.trim().length < 20) return res.status(400).json({ error: "Case description too short." });

  const moduleEntry = MODULE_MAP[mod] || MODULE_MAP["full"];
  const formatDesc = FORMAT_MAP[format] || FORMAT_MAP["study"];

  // Toggle-driven options from the frontend
  const opt = options || {};
  const directives = [];
  if (opt.citePrecedents === false) {
    directives.push("PRECEDENTS: Do not introduce case-law citations unless strictly necessary; keep §03 statute-focused.");
  } else {
    directives.push("PRECEDENTS: Cite relevant Supreme Court / High Court precedents with accurate citations.");
  }
  if (opt.crossRef === false) {
    directives.push("CROSS-REFERENCING: Cite only the single most applicable statutory code; do not cross-map IPC↔BNS equivalents.");
  } else {
    directives.push("CROSS-REFERENCING: Where helpful, cross-map the applicable code to its predecessor/successor (IPC↔BNS, CrPC↔BNSS, IEA↔BSA) so the reader sees both.");
  }
  if (opt.forensicTimeline) {
    directives.push("FORENSIC TIMELINE: Where the facts contain times/dates, include a short chronological forensic timeline of key events inside §04, formatted as dated lines.");
  }

  const userPrompt = `${formatDesc}

ANALYSIS MODULE — ${moduleEntry.label}:
${moduleEntry.focus}

ADDITIONAL DIRECTIVES:
${directives.map(d => "- " + d).join("\n")}

CASE SUBMITTED FOR ANALYSIS:
${caseText.trim()}

Generate a complete medico-legal analysis report using EXACTLY this structure. Each header on its own line exactly as shown. Honour the ANALYSIS MODULE emphasis above when allocating depth across the sections.

§1. CASE SUMMARY
Concise 2-3 paragraph factual summary. Parties, timeline, core allegations, medical context. If a date is given, state which statutory code era applies (IPC/CrPC/IEA before 1 July 2024; BNS/BNSS/BSA on or after).

§2. MEDICO-LEGAL ISSUES IDENTIFIED
Enumerate every medico-legal issue raised by the facts, in correct forensic and legal terminology. Number each issue.

§3. APPLICABLE INDIAN STATUTES AND PRECEDENTS
List every relevant statutory provision and judicial precedent. Format each as:
- [Statute/Section]: [relevance]
- [Case Name (Year) Citation]: [holding and application]

§4. MEDICO-LEGAL ANALYSIS
In-depth reasoning applying law to the specific facts — causation, liability, standard of care, evidentiary weight, conflicts in evidence.

§5. EVIDENCE-BASED EXPERT OPINION
Court-presentable professional opinion. State opinions definitively where evidence supports it, with qualification where it does not.

§6. LIMITATIONS AND GAPS IN ANALYSIS
Missing evidence, absent reports, unverified facts — and how each affects the analysis.

§7. SUGGESTED NEXT STEPS
Investigations to commission, experts to engage, documents to secure. Educational framing only.

§8. DISCLAIMER
This report is generated by Chiron, an AI-powered educational tool for Indian medico-legal jurisprudence. It does not constitute licensed legal advice, medical advice, or a substitute for a qualified advocate or registered medical practitioner. All analysis is for academic and study purposes only.`;

  try {
    const client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });

    const completion = await client.chat.completions.create({
      model: "grok-4", max_tokens: 4000, temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    });

    const reportText = completion.choices[0]?.message?.content || "";
    if (!reportText) return res.status(500).json({ error: "Grok returned an empty response. Please try again." });

    const confidence = await confidenceScores(client, reportText, caseText);

    const id = reportId();
    const timestamp = new Date().toISOString();
    const caseHash = sha256(caseText.trim());
    const reportHash = sha256(canonical(id, timestamp, reportText, caseHash));

    const certificate = {
      reportId: id, timestamp, caseHash, reportHash,
      algorithm: "SHA-256",
      standard: "BSA 2023 S.61-65 / IT Act 2000 S.85B",
      model: completion.model,
      module: moduleEntry.label,
      format: format || "study",
      tokens: completion.usage?.total_tokens || 0
    };

    return res.status(200).json({ success: true, report: reportText, certificate, confidence });

  } catch (err) {
    console.error("Grok API error:", err);
    if (err.status === 401) return res.status(401).json({ error: "Invalid xAI API key." });
    if (err.status === 429) return res.status(429).json({ error: "Rate limit hit. Please wait and retry." });
    if (err.status === 402) return res.status(402).json({ error: "Insufficient xAI credits. Top up at console.x.ai" });
    return res.status(500).json({ error: `Analysis failed: ${err.message || "Unknown error"}` });
  }
};
