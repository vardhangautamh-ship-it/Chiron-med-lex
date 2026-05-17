const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const crypto = require("crypto");

// ── COLORS ──
const GOLD = "#8B6914";
const DARK = "#0A0C0F";
const TEXT = "#1a1a2e";
const TEXT_LIGHT = "#4a4a5a";
const BORDER = "#d4a83a";
const BG_LIGHT = "#fafaf7";
const SECTION_BG = "#f5f3ee";

// ── FONT SIZES ──
const FS = {
  title: 22,
  subtitle: 11,
  sectionHeader: 13,
  body: 10.5,
  small: 9,
  tiny: 8,
  mono: 9
};

function parseReportSections(text) {
  const sections = [];
  const parts = text.split(/\n(?=§\d+\.)/);
  parts.forEach(part => {
    const match = part.match(/^§(\d+)\.\s*([^\n]+)\n?([\s\S]*)/);
    if (match) {
      sections.push({
        num: match[1].padStart(2, "0"),
        title: match[2].trim(),
        body: match[3].trim()
      });
    }
  });
  return sections;
}

async function generateQRCode(text) {
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      width: 120,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" }
    });
    return dataUrl;
  } catch {
    return null;
  }
}

function drawHorizontalLine(doc, y, color = "#ddddcc", width = 1) {
  doc.save()
    .moveTo(50, y).lineTo(doc.page.width - 50, y)
    .lineWidth(width).strokeColor(color).stroke()
    .restore();
}

function drawSectionHeader(doc, num, title, y) {
  // Gold accent bar
  doc.save()
    .rect(50, y, 3, 18)
    .fillColor(GOLD).fill()
    .restore();

  // Section number
  doc.save()
    .font("Courier").fontSize(FS.tiny)
    .fillColor(GOLD)
    .text(`§${num}`, 58, y + 2)
    .restore();

  // Section title
  doc.save()
    .font("Helvetica-Bold").fontSize(FS.sectionHeader)
    .fillColor(TEXT)
    .text(title, 80, y + 2, { width: doc.page.width - 130 })
    .restore();

  return doc.y + 6;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { report, certificate, confidence } = req.body;

  if (!report || !certificate) {
    return res.status(400).json({ error: "Missing report or certificate data." });
  }

  try {
    // ── VERIFY HASH INTEGRITY BEFORE GENERATING PDF ──
    // Re-derive the canonical content and verify the hash matches
    const canonical = [
      `REPORT_ID:${certificate.reportId}`,
      `TIMESTAMP:${certificate.timestamp}`,
      `CASE_HASH:${certificate.caseHash}`,
      `CONTENT:${report}`
    ].join("\n");

    const verifiedHash = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
    const hashVerified = verifiedHash === certificate.reportHash;

    // ── GENERATE QR CODE ──
    const qrData = certificate.verifyUrl ||
      `CHIRON Report | ID: ${certificate.reportId} | SHA-256: ${certificate.reportHash}`;
    const qrDataUrl = await generateQRCode(qrData);

    // ── BUILD PDF ──
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 60, left: 50, right: 50 },
      info: {
        Title: `CHIRON Medico-Legal Report — ${certificate.reportId}`,
        Author: "CHIRON — Medical Jurisprudence Intelligence System",
        Subject: "Medico-Legal Analysis — Indian Jurisdiction",
        Keywords: "medical jurisprudence, Indian law, BNS 2023, medico-legal",
        Creator: "CHIRON v2.0",
        Producer: "CHIRON v2.0 | Grok 4 | xAI"
      }
    });

    // Collect PDF buffer
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));

    // ════════════════════════════════════════
    // PAGE 1 — COVER / HEADER
    // ════════════════════════════════════════

    // Top gold bar
    doc.save()
      .rect(0, 0, doc.page.width, 8)
      .fillColor(GOLD).fill()
      .restore();

    // Header background
    doc.save()
      .rect(0, 8, doc.page.width, 100)
      .fillColor("#0d1017").fill()
      .restore();

    // CHIRON title
    doc.save()
      .font("Helvetica-Bold").fontSize(FS.title)
      .fillColor(BORDER)
      .text("CHIRON", 50, 28)
      .restore();

    // Subtitle
    doc.save()
      .font("Helvetica").fontSize(FS.subtitle)
      .fillColor("#8a8f9a")
      .text("MEDICAL JURISPRUDENCE INTELLIGENCE SYSTEM", 50, 56)
      .restore();

    doc.save()
      .font("Helvetica").fontSize(FS.tiny)
      .fillColor("#5a6070")
      .text("Indian Jurisdiction · Educational Use Only · Powered by Grok 4", 50, 72)
      .restore();

    // Report ID top right
    doc.save()
      .font("Courier").fontSize(FS.tiny)
      .fillColor("#5a6070")
      .text(certificate.reportId, doc.page.width - 180, 28, { width: 130, align: "right" })
      .restore();

    // Timestamp top right
    const displayTs = new Date(certificate.timestamp).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata"
    }) + " IST";

    doc.save()
      .font("Courier").fontSize(FS.tiny)
      .fillColor("#5a6070")
      .text(displayTs, doc.page.width - 180, 42, { width: 130, align: "right" })
      .restore();

    // Hash preview top right
    doc.save()
      .font("Courier").fontSize(7)
      .fillColor(GOLD)
      .text(`SHA-256: ${certificate.reportHash.substring(0, 16)}...`, doc.page.width - 180, 56, { width: 130, align: "right" })
      .restore();

    // Bottom gold line under header
    doc.save()
      .rect(0, 108, doc.page.width, 1.5)
      .fillColor(GOLD).fill()
      .restore();

    doc.moveDown(5);

    // ── REPORT TITLE ──
    doc.save()
      .font("Helvetica-Bold").fontSize(16)
      .fillColor(TEXT)
      .text("Medico-Legal Analysis Report", 50, 130, { align: "center", width: doc.page.width - 100 })
      .restore();

    doc.save()
      .font("Helvetica-Oblique").fontSize(FS.small)
      .fillColor(TEXT_LIGHT)
      .text(`Module: ${certificate.module?.toUpperCase() || "FULL"} · Format: ${certificate.format?.toUpperCase() || "STUDY"} · Model: ${certificate.model?.toUpperCase() || "GROK-4"}`, 50, 152, { align: "center", width: doc.page.width - 100 })
      .restore();

    drawHorizontalLine(doc, 170, "#ccccbb", 0.5);

    // ════════════════════════════════════════
    // REPORT SECTIONS
    // ════════════════════════════════════════
    const sections = parseReportSections(report);
    doc.y = 185;

    sections.forEach((section, idx) => {
      // Page break check
      if (doc.y > doc.page.height - 120) {
        doc.addPage();
        doc.y = 50;
      }

      const sectionY = doc.y;

      // Section background
      doc.save()
        .rect(47, sectionY - 4, doc.page.width - 94, 26)
        .fillColor(SECTION_BG).fill()
        .restore();

      // Draw section header
      drawSectionHeader(doc, section.num, section.title, sectionY);
      doc.y = sectionY + 32;

      // Section body
      const isDisclaimer = section.title.toLowerCase().includes("disclaimer");
      const isStatutes = section.title.toLowerCase().includes("statute") || section.title.toLowerCase().includes("precedent");
      const isIssues = section.title.toLowerCase().includes("issues");
      const isSteps = section.title.toLowerCase().includes("next steps") || section.title.toLowerCase().includes("suggested");

      if (isDisclaimer) {
        // Disclaimer box
        const disclaimerY = doc.y;
        doc.save()
          .rect(50, disclaimerY, doc.page.width - 100, 2)
          .fillColor("#7a5a80").fill()
          .restore();

        doc.save()
          .rect(50, disclaimerY + 2, doc.page.width - 100, 60)
          .fillColor("#f5f0f8").fill()
          .restore();

        doc.save()
          .font("Helvetica-Bold").fontSize(FS.tiny)
          .fillColor("#7a5a80")
          .text("DISCLAIMER", 58, disclaimerY + 8)
          .restore();

        doc.save()
          .font("Helvetica-Oblique").fontSize(FS.tiny)
          .fillColor("#5a4060")
          .text(section.body, 58, disclaimerY + 20, {
            width: doc.page.width - 116,
            lineGap: 2
          })
          .restore();

        doc.y = disclaimerY + 72;

      } else if (isStatutes || isIssues || isSteps) {
        // Bulleted items
        const lines = section.body.split("\n").filter(l => l.trim());
        lines.forEach(line => {
          if (doc.y > doc.page.height - 80) {
            doc.addPage();
            doc.y = 50;
          }

          const cleanLine = line.trim().replace(/^[-•*]\s*/, "");
          const itemY = doc.y;

          // Left border accent
          doc.save()
            .rect(50, itemY, 2, 14)
            .fillColor(GOLD).fill()
            .restore();

          doc.save()
            .font("Helvetica").fontSize(FS.body)
            .fillColor(TEXT)
            .text(cleanLine, 58, itemY, {
              width: doc.page.width - 108,
              lineGap: 1.5
            })
            .restore();

          doc.y += 6;
        });

      } else {
        // Regular body text
        const paragraphs = section.body.split(/\n\n+/);
        paragraphs.forEach(para => {
          if (doc.y > doc.page.height - 80) {
            doc.addPage();
            doc.y = 50;
          }

          doc.save()
            .font("Helvetica").fontSize(FS.body)
            .fillColor(TEXT)
            .text(para.replace(/\n/g, " "), 50, doc.y, {
              width: doc.page.width - 100,
              lineGap: 2,
              paragraphGap: 4
            })
            .restore();

          doc.y += 6;
        });
      }

      doc.y += 14;

      // Section divider (not after last section)
      if (idx < sections.length - 1) {
        drawHorizontalLine(doc, doc.y, "#e0ddd5", 0.5);
        doc.y += 10;
      }
    });

    // ════════════════════════════════════════
    // SHA-256 CERTIFICATE PAGE
    // ════════════════════════════════════════
    doc.addPage();

    // Certificate header bar
    doc.save()
      .rect(0, 0, doc.page.width, 8)
      .fillColor(GOLD).fill()
      .restore();

    doc.save()
      .rect(0, 8, doc.page.width, 70)
      .fillColor("#0d1017").fill()
      .restore();

    doc.save()
      .font("Helvetica-Bold").fontSize(16)
      .fillColor(BORDER)
      .text("DOCUMENT INTEGRITY CERTIFICATE", 50, 22, { align: "center", width: doc.page.width - 100 })
      .restore();

    doc.save()
      .font("Helvetica").fontSize(FS.tiny)
      .fillColor("#5a6070")
      .text("SHA-256 Cryptographic Hash Verification · Bharatiya Sakshya Adhiniyam 2023 §61-65 · IT Act 2000 §85B", 50, 46, { align: "center", width: doc.page.width - 100 })
      .restore();

    drawHorizontalLine(doc, 78, GOLD, 1.5);

    doc.y = 96;

    // Verification status banner
    const bannerColor = hashVerified ? "#0c1f14" : "#1f0c0c";
    const bannerBorder = hashVerified ? "#1a4028" : "#4a1a1a";
    const bannerText = hashVerified ? "✓  HASH VERIFIED — Document integrity confirmed" : "⚠  HASH MISMATCH — Document may have been altered";
    const bannerTextColor = hashVerified ? "#3a7d55" : "#c05050";

    doc.save()
      .rect(50, doc.y, doc.page.width - 100, 28)
      .fillColor(bannerColor).fill()
      .restore();

    doc.save()
      .rect(50, doc.y, doc.page.width - 100, 28)
      .lineWidth(1).strokeColor(bannerBorder).stroke()
      .restore();

    doc.save()
      .font("Helvetica-Bold").fontSize(FS.small)
      .fillColor(bannerTextColor)
      .text(bannerText, 62, doc.y + 9)
      .restore();

    doc.y += 40;

    // Certificate fields
    const fields = [
      ["Report ID", certificate.reportId],
      ["Generation Timestamp", `${certificate.timestamp} (ISO 8601 UTC)`],
      ["Display Timestamp", displayTs],
      ["AI Model", certificate.model || "grok-4"],
      ["Analysis Module", (certificate.module || "full").toUpperCase()],
      ["Algorithm", "SHA-256 (FIPS 180-4)"],
      ["Legal Standard", "BSA 2023 §61-65 / IT Act 2000 §85B / UNCITRAL Model Law"],
      ["Tokens Used", certificate.tokens?.toString() || "N/A"]
    ];

    fields.forEach(([label, value]) => {
      if (doc.y > doc.page.height - 100) { doc.addPage(); doc.y = 50; }

      doc.save()
        .font("Helvetica-Bold").fontSize(FS.small)
        .fillColor(TEXT_LIGHT)
        .text(`${label}:`, 50, doc.y, { width: 160 })
        .restore();

      doc.save()
        .font("Courier").fontSize(FS.mono)
        .fillColor(TEXT)
        .text(value, 215, doc.y, { width: doc.page.width - 265 })
        .restore();

      doc.y += 18;
      drawHorizontalLine(doc, doc.y - 4, "#eeeeee", 0.3);
    });

    doc.y += 10;

    // Hash boxes
    const hashFields = [
      ["CASE INPUT HASH (SHA-256)", certificate.caseHash, "Hash of the submitted case facts. Proves exactly what input was analysed."],
      ["DOCUMENT HASH (SHA-256)", certificate.reportHash, "Hash of the complete report + metadata. This is the document fingerprint."]
    ];

    hashFields.forEach(([label, hashValue, description]) => {
      if (doc.y > doc.page.height - 120) { doc.addPage(); doc.y = 50; }

      const boxY = doc.y;

      doc.save()
        .rect(50, boxY, doc.page.width - 100, 54)
        .fillColor("#f8f7f2").fill()
        .restore();

      doc.save()
        .rect(50, boxY, 3, 54)
        .fillColor(GOLD).fill()
        .restore();

      doc.save()
        .font("Helvetica-Bold").fontSize(FS.tiny)
        .fillColor(GOLD)
        .text(label, 58, boxY + 6)
        .restore();

      doc.save()
        .font("Courier").fontSize(FS.mono)
        .fillColor(TEXT)
        .text(hashValue, 58, boxY + 20, { width: doc.page.width - 116, characterSpacing: 0.5 })
        .restore();

      doc.save()
        .font("Helvetica-Oblique").fontSize(FS.tiny)
        .fillColor(TEXT_LIGHT)
        .text(description, 58, boxY + 38)
        .restore();

      doc.y = boxY + 64;
    });

    // Confidence Scores Section
    if (confidence && confidence.sections) {
      if (doc.y > doc.page.height - 160) { doc.addPage(); doc.y = 50; }
      doc.y += 10;
      doc.save().font("Helvetica-Bold").fontSize(FS.small).fillColor(TEXT_LIGHT).text("AI CONFIDENCE SCORING (PER SECTION)", 50, doc.y).restore();
      doc.y += 16;

      confidence.sections.forEach(sec => {
        if (doc.y > doc.page.height - 60) { doc.addPage(); doc.y = 50; }
        const scoreColor = sec.score >= 8 ? "3a7d55" : sec.score >= 6 ? "c8a020" : "c05050";
        const barWidth = Math.round((sec.score / 10) * 100);
        const secY = doc.y;

        doc.save().rect(50, secY, doc.page.width - 100, 0.5).fillColor("#1e2330").fill().restore();
        doc.save().font("Courier").fontSize(8).fillColor("#" + scoreColor).text(`§${sec.num}`, 52, secY + 4).restore();
        doc.save().font("Helvetica").fontSize(8).fillColor(TEXT).text(sec.title || "", 80, secY + 4, { width: 160 }).restore();
        doc.save().font("Courier").fontSize(8).fillColor("#" + scoreColor).text(`${sec.score}/10`, doc.page.width - 80, secY + 4, { width: 28, align: "right" }).restore();

        // Mini confidence bar
        doc.save().rect(245, secY + 7, 100, 3).fillColor("#1e2330").fill().restore();
        doc.save().rect(245, secY + 7, barWidth, 3).fillColor("#" + scoreColor).fill().restore();

        if (sec.flag) {
          doc.save().font("Helvetica-Oblique").fontSize(7).fillColor("#c8a020").text(`⚠ ${sec.flag}`, 80, secY + 16, { width: doc.page.width - 130 }).restore();
          doc.y = secY + 28;
        } else {
          doc.y = secY + 18;
        }
      });

      // Overall score
      if (confidence.overallScore) {
        doc.y += 4;
        const ocColor = confidence.overallScore >= 8 ? "3a7d55" : confidence.overallScore >= 6 ? "c8a020" : "c05050";
        doc.save().font("Helvetica-Bold").fontSize(FS.small).fillColor("#" + ocColor).text(`Overall Confidence Score: ${confidence.overallScore}/10`, 50, doc.y).restore();
        doc.y += 16;
      }
    }

    // QR Code
    if (qrDataUrl) {
      if (doc.y > doc.page.height - 160) { doc.addPage(); doc.y = 50; }

      doc.y += 10;
      const qrY = doc.y;

      doc.save()
        .font("Helvetica-Bold").fontSize(FS.small)
        .fillColor(TEXT_LIGHT)
        .text("VERIFICATION QR CODE", 50, qrY)
        .restore();

      doc.save()
        .font("Helvetica").fontSize(FS.tiny)
        .fillColor(TEXT_LIGHT)
        .text("Scan to verify report integrity online", 50, qrY + 14)
        .restore();

      // Embed QR code image
      const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, "");
      const qrBuffer = Buffer.from(qrBase64, "base64");
      doc.image(qrBuffer, 50, qrY + 28, { width: 100, height: 100 });

      // Verification instructions
      doc.save()
        .font("Helvetica").fontSize(FS.tiny)
        .fillColor(TEXT_LIGHT)
        .text(
          "To verify this document:\n1. Visit the URL encoded in the QR code, or\n2. Compute SHA-256 of the report content and compare with the Document Hash above\n3. Any alteration to the report will produce a different hash, proving tampering",
          160, qrY + 28,
          { width: doc.page.width - 210, lineGap: 2 }
        )
        .restore();

      doc.y = qrY + 140;
    }

    // How to verify box
    if (doc.y > doc.page.height - 100) { doc.addPage(); doc.y = 50; }

    doc.y += 10;
    const howY = doc.y;

    doc.save()
      .rect(50, howY, doc.page.width - 100, 72)
      .fillColor("#f0f0e8").fill()
      .restore();

    doc.save()
      .font("Helvetica-Bold").fontSize(FS.small)
      .fillColor(TEXT)
      .text("HOW TO VERIFY THIS DOCUMENT IN COURT", 58, howY + 8)
      .restore();

    doc.save()
      .font("Helvetica").fontSize(FS.tiny)
      .fillColor(TEXT_LIGHT)
      .text(
        "1. Extract the report text content from this PDF\n" +
        "2. Compute SHA-256 hash of the canonical string: REPORT_ID:[id]\\nTIMESTAMP:[ts]\\nCASE_HASH:[ch]\\nCONTENT:[text]\n" +
        "3. Compare computed hash with the Document Hash printed above — they must match exactly\n" +
        "4. Cite: Bharatiya Sakshya Adhiniyam 2023 §63 (electronic records), §65 (admissibility), IT Act 2000 §85B (presumption of secure electronic records)",
        58, howY + 22,
        { width: doc.page.width - 116, lineGap: 2.5 }
      )
      .restore();

    doc.y = howY + 82;

    // ════════════════════════════════════════
    // FOOTER ON ALL PAGES
    // ════════════════════════════════════════
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);

      // Bottom bar
      doc.save()
        .rect(0, doc.page.height - 35, doc.page.width, 35)
        .fillColor("#0d1017").fill()
        .restore();

      doc.save()
        .font("Courier").fontSize(7)
        .fillColor("#3a4050")
        .text(
          `CHIRON v2.0 · ${certificate.reportId} · SHA-256: ${certificate.reportHash.substring(0, 24)}...`,
          50, doc.page.height - 22,
          { width: doc.page.width - 130 }
        )
        .restore();

      doc.save()
        .font("Courier").fontSize(7)
        .fillColor("#3a4050")
        .text(`Page ${i + 1} of ${pages.count}`, doc.page.width - 80, doc.page.height - 22, { width: 60, align: "right" })
        .restore();
    }

    doc.end();

    // Wait for PDF to finish
    await new Promise((resolve, reject) => {
      doc.on("end", resolve);
      doc.on("error", reject);
    });

    const pdfBuffer = Buffer.concat(chunks);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="CHIRON-Report-${certificate.reportId}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.status(200).send(pdfBuffer);

  } catch (err) {
    console.error("PDF generation error:", err);
    return res.status(500).json({ error: `PDF generation failed: ${err.message}` });
  }
};
