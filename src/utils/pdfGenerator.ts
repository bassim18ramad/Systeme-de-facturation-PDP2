import { Company } from "../lib/supabase";
// @ts-ignore
import html2pdf from "html2pdf.js";

type DocumentType = "quote" | "delivery_order" | "invoice";

type DocumentData = {
  type: DocumentType;
  number: string;
  date: string;
  company: Company;
  client: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    width?: number;
    length?: number;
    total: number;
  }[];
  total: number;
  include_tva?: boolean;
  stamp_duty?: number;
  deliveryDate?: string;
  showSignature?: boolean;
  notes: string;
  downloadedBy: string;
};

const documentTitles = {
  quote: "DEVIS",
  delivery_order: "BON DE LIVRAISON",
  invoice: "FACTURE",
};

export function downloadDocument(
  data: DocumentData,
  existingWindow?: Window | null,
  mode: "print" | "download" = "print",
) {
  const html = generateHTML(data);

  if (mode === "download") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const styles = Array.from(doc.querySelectorAll("style"))
      .map((s) => s.outerHTML)
      .join("\n");
    const bodyContent = doc.body.innerHTML;

    // Wrap in a container to ensure styles apply correctly
    const content = document.createElement("div");
    content.innerHTML = `${styles}<div class="pdf-content">${bodyContent}</div>`;

    // Configure html2pdf
    const opt = {
      margin: 10,
      filename: `${data.type}_${data.number}.pdf`,
      image: { type: "jpeg" as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: {
        unit: "mm" as const,
        format: "a4" as const,
        orientation: "portrait" as const,
      },
    };

    waitForImages(content)
      .then(() => {
        return html2pdf().from(content).set(opt).save();
      })
      .then(() => {
        if (existingWindow) {
          existingWindow.close();
        }
      })
      .catch((err: unknown) => {
        console.error("PDF generation failed", err);
        const message = err instanceof Error ? err.message : String(err);
        if (existingWindow) {
          existingWindow.document.body.innerHTML = `<div style="color:red;padding:20px;">Erreur lors de la génération du PDF: ${message}</div>`;
        } else {
          alert("Erreur lors de la génération du PDF");
        }
      });

    return;
  }

  // Print mode
  // Use user-provided window if any (legacy), otherwise use hidden iframe
  if (existingWindow) {
    existingWindow.document.open();
    existingWindow.document.write(html);
    existingWindow.document.close();
    setTimeout(() => {
      existingWindow.focus();
      existingWindow.print();
    }, 500);
    return;
  }

  // Hidden iframe logic for seamless printing
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();

    const triggerPrint = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      // Cleanup after print dialog handles usage
      // Note: in many browsers print() blocks, so this runs after dialog closes
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    };

    // Attendre le chargement des images (logo, signature) avant d'imprimer,
    // avec un délai maximum de 4s pour ne pas bloquer si une image ne répond pas
    Promise.race([
      waitForImages(doc.body),
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ]).then(() => setTimeout(triggerPrint, 150));
  }
}

function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll("img"));
  if (images.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        }),
    ),
  ).then(() => undefined);
}

function generateHTML(data: DocumentData): string {
  const title = documentTitles[data.type];
  // Bon de livraison : liste des produits et quantités uniquement, sans montants
  const showAmounts = data.type !== "delivery_order";
  const hasDimensions = data.items.some((item) => item.width && item.length);
  const subtotal = data.items.reduce(
    (sum, item) => sum + Number(item.total),
    0,
  );
  const tva = data.include_tva ? subtotal * 0.1 : 0;
  const stampDuty =
    data.stamp_duty && data.stamp_duty > 0 ? Number(data.stamp_duty) : 0;
  const logoUrl = data.company.logo_url
    ? `${data.company.logo_url}${data.company.logo_url.includes("?") ? "&" : "?"}v=${Date.now()}`
    : null;
  const signatureUrl = data.company.signature_url
    ? `${data.company.signature_url}${data.company.signature_url.includes("?") ? "&" : "?"}v=${Date.now()}`
    : null;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title} ${data.number}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.5;
      color: #0f172a;
      padding: 34px;
      background: #f8fafc;
    }

    .page {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 28px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #e2e8f0;
    }

    .logo {
      max-height: 72px;
      max-width: 200px;
      object-fit: contain;
    }

    .company-name {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.2px;
    }

    .document-title {
      text-align: right;
    }

    .type-pill {
      display: inline-block;
      background: #dbeafe;
      color: #1d4ed8;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.7px;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 999px;
      margin-bottom: 8px;
    }

    .document-title h1 {
      font-size: 30px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 6px;
      line-height: 1.1;
    }

    .document-title .number {
      font-size: 14px;
      color: #475569;
      font-weight: 600;
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding: 10px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      color: #475569;
      font-size: 13px;
      font-weight: 600;
    }

    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 20px;
    }

    .party {
      background: #f8fafc;
      padding: 14px;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
    }

    .party h3 {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 8px;
      letter-spacing: 0.6px;
    }

    .party p {
      font-size: 13px;
      color: #334155;
      margin-bottom: 2px;
      word-break: break-word;
    }

    .party .name {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 6px;
    }

    .items-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin-bottom: 18px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
    }

    .items-table thead {
      background: linear-gradient(90deg, #eff6ff 0%, #f8fafc 100%);
    }

    .items-table th {
      padding: 10px 12px;
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
      letter-spacing: 0.6px;
      white-space: nowrap;
    }

    .items-table th.right {
      text-align: right;
    }

    .items-table td {
      padding: 10px 12px;
      font-size: 13px;
      color: #334155;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: top;
    }

    .items-table td.right {
      text-align: right;
      white-space: nowrap;
    }

    .items-table tbody tr:last-child td {
      border-bottom: none;
    }

    .summary {
      margin-left: auto;
      width: 360px;
      max-width: 100%;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 14px;
      margin-bottom: 14px;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      color: #334155;
      padding: 8px 0;
      border-bottom: 1px solid #e2e8f0;
    }

    .summary-row:last-child {
      border-bottom: none;
    }

    .summary-total {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
      padding-top: 10px;
    }

    .notes {
      background: #f8fafc;
      padding: 14px;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
      margin-top: 10px;
    }

    .notes h3 {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 6px;
      letter-spacing: 0.6px;
    }

    .notes p {
      font-size: 13px;
      color: #334155;
      white-space: pre-line;
    }

    .signature {
      margin-top: 12px;
      display: inline-block;
    }

    .signature p {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #64748b;
      margin-bottom: 6px;
      font-weight: 700;
    }

    .signature img {
      max-height: 70px;
      max-width: 220px;
      object-fit: contain;
      display: block;
    }

    .footer {
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #64748b;
      text-align: center;
      padding-top: 12px;
      margin-top: 16px;
    }

    .wallets {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 10px;
    }

    .wallet {
      background: #eff6ff;
      border: 1px solid #dbeafe;
      color: #1e3a8a;
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
    }


    @media print {
      @page {
        size: A4;
        margin: 20mm;
      }
      body {
        padding: 0;
        background: #ffffff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .page {
        border: none;
        box-shadow: none;
        border-radius: 0;
        padding: 0;
      }

      .items-table {
        page-break-inside: auto;
      }

      .items-table tr {
        page-break-inside: avoid;
      }

      .parties {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo" crossorigin="anonymous" referrerpolicy="no-referrer">` : `<div class="company-name">${data.company.name}</div>`}
      </div>
      <div class="document-title">
        <div class="type-pill">${title}</div>
        <h1>${data.number}</h1>
        <div class="number">Référence document</div>
      </div>
    </div>

    <div class="meta-row">
      <span>Date: ${data.date}</span>
      ${data.deliveryDate ? `<span>Date de livraison: ${data.deliveryDate}</span>` : ""}
      <span>${data.items.length} article${data.items.length > 1 ? "s" : ""}</span>
    </div>

    <div class="parties">
      <div class="party">
        <h3>Entreprise</h3>
        <p class="name">${data.company.name}</p>
        ${data.company.email ? `<p>Email: ${data.company.email}</p>` : ""}
        ${data.company.phone ? `<p>Tél: ${data.company.phone}</p>` : ""}
      </div>

      <div class="party">
        <h3>Client</h3>
        <p class="name">${data.client.name}</p>
        ${data.client.email ? `<p>${data.client.email}</p>` : ""}
        ${data.client.phone ? `<p>${data.client.phone}</p>` : ""}
        ${data.client.address ? `<p>${data.client.address}</p>` : ""}
      </div>
    </div>

  <table class="items-table">
    <thead>
      <tr>
        <th>Description</th>
        ${hasDimensions ? '<th class="right">Dimensions (m)</th>' : ""}
        <th class="right">Quantité</th>
        ${showAmounts ? '<th class="right">Prix unitaire</th><th class="right">Total</th>' : ""}
      </tr>
    </thead>
    <tbody>
      ${data.items
        .map(
          (item) => `
        <tr>
          <td>${item.description}</td>
          ${
            hasDimensions
              ? `<td class="right">${
                  item.width && item.length
                    ? `${Number(item.width)} x ${Number(item.length)}`
                    : "-"
                }</td>`
              : ""
          }
          <td class="right">${item.quantity}</td>
          ${
            showAmounts
              ? `<td class="right">${Number(item.unitPrice).toFixed(2)} FDJ</td>
          <td class="right">${Number(item.total).toFixed(2)} FDJ</td>`
              : ""
          }
        </tr>
      `,
        )
        .join("")}
    </tbody>
  </table>

    ${
      showAmounts
        ? `
    <div class="summary">
      <div class="summary-row">
        <span>Sous-total</span>
        <span>${subtotal.toFixed(2)} FDJ</span>
      </div>
      ${
        data.include_tva
          ? `
      <div class="summary-row">
        <span>TVA (10%)</span>
        <span>${tva.toFixed(2)} FDJ</span>
      </div>
      `
          : ""
      }
      ${
        stampDuty > 0
          ? `
      <div class="summary-row">
        <span>Frais de timbre</span>
        <span>${stampDuty.toFixed(2)} FDJ</span>
      </div>
      `
          : ""
      }
      <div class="summary-row summary-total">
        <span>Total</span>
        <span>${Number(data.total).toFixed(2)} FDJ</span>
      </div>
    </div>
    `
        : ""
    }

    ${
      data.notes
        ? `
      <div class="notes">
        <h3>Notes</h3>
        <p>${data.notes}</p>
      </div>
    `
        : ""
    }

    ${
      signatureUrl && data.showSignature !== false
        ? `
      <div class="signature">
        <p>Signature</p>
        <img src="${signatureUrl}" alt="Signature" crossorigin="anonymous" referrerpolicy="no-referrer">
      </div>
    `
        : ""
    }

    <div class="footer">
      ${
        data.company.wallets && data.company.wallets.length > 0
          ? `
        <div class="wallets">
          ${data.company.wallets
            .map(
              (w) => `
            <div class="wallet">
              ${w.type}: ${w.address}
            </div>
          `,
            )
            .join("")}
        </div>
        `
          : ""
      }
      <div>
        Document téléchargé par ${data.downloadedBy} le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}
      </div>
    </div>
  </div>
</body>
</html>
  `;
}
