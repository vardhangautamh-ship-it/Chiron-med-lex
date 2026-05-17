# Chiron — Medical Jurisprudence Intelligence System
### Powered by Grok 4 · Deployed on Vercel · Indian Jurisdiction

> *"Chiron was the wisest and most just of the centaurs — supreme in the knowledge of medicine, and teacher of heroes."*

---

## What is Chiron?

Chiron is a production-grade AI agent that applies Medical Jurisprudence to real-world cases through the lens of Indian law. It takes case facts and generates structured, eight-section medico-legal reports covering forensic analysis, malpractice liability, regulatory violations, criminal law intersection, and expert witness opinions.

Every report is cryptographically sealed with SHA-256 and downloadable as a court-formatted PDF.

Built for law students, researchers, and legal professionals working at the intersection of medicine and Indian law.

---

## Project Structure

```
chiron-app/
├── api/
│   ├── analyze.js        ← Serverless function (Grok 4 via xAI API + SHA-256)
│   └── pdf.js            ← PDF generation with certificate page
├── public/
│   ├── index.html        ← Full frontend (mobile-responsive)
│   └── verify.html       ← Document hash verification page
├── package.json
├── vercel.json
└── README.md
```

---

## Deployment

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Chiron v1.0 — Medical Jurisprudence Intelligence System"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/chiron-legal-ai.git
git push -u origin main
```

### Step 2 — Deploy on Vercel
1. Go to vercel.com → Add New Project → Import your GitHub repo
2. Leave all settings default → Deploy

### Step 3 — Add xAI API Key
Vercel Dashboard → Project → Settings → Environment Variables:
- **Name:** `XAI_API_KEY`
- **Value:** your key from console.x.ai
- Select all environments → Save → Redeploy

---

## Analysis Modules

| Module | Domain |
|--------|--------|
| Medico-Legal | Injury classification, cause vs manner of death, forensic pathology |
| Malpractice | Bolam test, standard of care, duty of care, res ipsa loquitur |
| Regulations & Ethics | NMC Act, MTP Act, POCSO, informed consent, professional misconduct |
| Expert Witness | Court-ready testimony for Sessions Court or High Court |
| Full Report | All modules — comprehensive 8-section analysis |

---

## Document Integrity

Every Chiron report receives a SHA-256 hash at generation. The hash covers Report ID + ISO 8601 timestamp + case input + full report text. Any alteration produces a different hash — proving tampering.

**Legal basis:** Bharatiya Sakshya Adhiniyam 2023 §61-65 · IT Act 2000 §85B · UNCITRAL Model Law

Verification available at `/verify.html`

---

## Statutes Covered

BNS 2023 · BNSS 2023 · Bharatiya Sakshya Adhiniyam 2023 · NMC Act 2019 · MTP Act 1971 (amended 2021) · POCSO Act 2012 · Consumer Protection Act 2019 · Mental Healthcare Act 2017 · DPDP Act 2023 · Dowry Prohibition Act 1961 · PWDVA 2005

---

## Disclaimer

Chiron is strictly an educational and research tool. Output does not constitute licensed legal advice, medical advice, or a substitute for a qualified advocate or registered medical practitioner.

---

*Named after Chiron — the wisest centaur of Greek mythology, supreme in medicine, teacher of heroes. He stood at the precise intersection of healing and justice — which is exactly where this system operates.*
