import JSZip from "jszip";
import { supabase, Company } from "../lib/supabase";
import { generateDocumentPdfBlob, DocumentData } from "./pdfGenerator";

export type BulkType = "quotes" | "orders" | "invoices";

// Un sous-dossier par sous-bloc affiché sur la carte du tableau de bord
const STATUS_FOLDERS: Record<BulkType, Record<string, string>> = {
  quotes: {
    draft: "brouillons",
    sent: "envoyes",
    ordered: "commandes",
    cancelled: "annules",
  },
  orders: {
    pending: "en-attente",
    delivered: "livrees",
    cancelled: "annulees",
  },
  invoices: {
    unpaid: "impayees",
    paid: "payees",
    cancelled: "annulees",
  },
};

const ARCHIVE_NAMES: Record<BulkType, string> = {
  quotes: "devis",
  orders: "bons-de-commande",
  invoices: "factures",
};

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim();
}

function frDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("fr-FR") : "";
}

/**
 * Construit une archive ZIP contenant le PDF de chaque document du type
 * demandé, rangé dans un sous-dossier par statut, puis la télécharge.
 * Retourne le nombre de documents inclus.
 */
export async function downloadDocumentsZip(
  companyId: string,
  type: BulkType,
  downloadedBy: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const { data: companyData } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .maybeSingle();

  const company = companyData as Company | null;
  if (!company) throw new Error("Entreprise introuvable");

  // Chargement groupé : quelques requêtes au lieu d'une par document
  const [quotesRes, ordersRes, invoicesRes] = await Promise.all([
    supabase.from("quotes").select("*").eq("company_id", companyId),
    type === "quotes"
      ? Promise.resolve({ data: [] as any[] })
      : supabase.from("delivery_orders").select("*").eq("company_id", companyId),
    type === "invoices"
      ? supabase.from("invoices").select("*").eq("company_id", companyId)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const quotes = (quotesRes.data || []) as any[];
  const orders = (ordersRes.data || []) as any[];
  const invoices = (invoicesRes.data || []) as any[];

  const quoteById: Record<string, any> = {};
  quotes.forEach((q) => (quoteById[q.id] = q));
  const orderById: Record<string, any> = {};
  orders.forEach((o) => (orderById[o.id] = o));

  const itemsByQuote: Record<string, any[]> = {};
  const quoteIds = quotes.map((q) => q.id);
  if (quoteIds.length > 0) {
    const { data: itemsData } = await supabase
      .from("quote_items")
      .select("*")
      .in("quote_id", quoteIds);
    (itemsData || []).forEach((item: any) => {
      if (!itemsByQuote[item.quote_id]) itemsByQuote[item.quote_id] = [];
      itemsByQuote[item.quote_id].push(item);
    });
  }

  const buildData = (
    docType: DocumentData["type"],
    number: string,
    createdAt: string,
    quote: any,
    deliveryDate?: string | null,
  ): DocumentData => ({
    type: docType,
    number,
    date: frDate(createdAt),
    deliveryDate: deliveryDate ? frDate(deliveryDate) : undefined,
    company,
    client: {
      name: quote.client_name,
      email: quote.client_email,
      phone: quote.client_phone || "",
      address: quote.client_address || "",
    },
    items: (itemsByQuote[quote.id] || []).map((item: any) => ({
      description: item.description,
      quantity: item.quantity,
      width: item.width || undefined,
      length: item.length || undefined,
      unitPrice: item.unit_price,
      total: item.total_price,
    })),
    total: quote.total_amount,
    include_tva: quote.include_tva,
    stamp_duty: quote.stamp_duty,
    showSignature: quote.include_signature !== false,
    terms: company.payment_terms || "",
    showTerms: quote.include_terms !== false,
    notes: quote.notes || "",
    downloadedBy,
  });

  // Liste des documents à produire : { statut, nom de fichier, données }
  const entries: { status: string; fileName: string; data: DocumentData }[] = [];

  if (type === "quotes") {
    quotes.forEach((quote) => {
      entries.push({
        status: quote.status,
        fileName: safeName(quote.quote_number),
        data: buildData("quote", quote.quote_number, quote.created_at, quote),
      });
    });
  } else if (type === "orders") {
    orders.forEach((order) => {
      const quote = quoteById[order.quote_id];
      if (!quote) return;
      entries.push({
        status: order.status,
        fileName: safeName(order.order_number),
        data: buildData(
          "delivery_order",
          order.order_number,
          order.created_at,
          quote,
          order.delivery_date,
        ),
      });
    });
  } else {
    invoices.forEach((invoice) => {
      const order = orderById[invoice.delivery_order_id];
      const quote = order ? quoteById[order.quote_id] : null;
      if (!quote) return;
      entries.push({
        status: invoice.status,
        fileName: safeName(invoice.invoice_number),
        data: buildData(
          "invoice",
          invoice.invoice_number,
          invoice.created_at,
          quote,
        ),
      });
    });
  }

  if (entries.length === 0) {
    throw new Error("Aucun document à exporter");
  }

  const zip = new JSZip();
  const folders = STATUS_FOLDERS[type];
  let done = 0;
  onProgress?.(0, entries.length);

  for (const entry of entries) {
    const blob = await generateDocumentPdfBlob(entry.data);
    const folder = folders[entry.status] || "autres";
    zip.file(`${folder}/${entry.fileName}.pdf`, blob);
    done += 1;
    onProgress?.(done, entries.length);
  }

  const archive = await zip.generateAsync({ type: "blob" });
  const stamp = new Date().toISOString().split("T")[0];
  const url = URL.createObjectURL(archive);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName(company.name)}_${ARCHIVE_NAMES[type]}_${stamp}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return entries.length;
}
