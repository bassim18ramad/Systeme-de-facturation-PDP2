import { useState, useEffect } from "react";
import { supabase, Quote, QuoteItem, Company } from "../lib/supabase";
import {
  FileText,
  Download,
  ArrowRight,
  Eye,
  Trash2,
  Printer,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit2,
} from "lucide-react";
import { QuoteViewer } from "./QuoteViewer";
import { downloadDocument } from "../utils/pdfGenerator";
import { useAuth } from "../contexts/AuthContext";

type QuotesListProps = {
  companyId: string;
  onUpdate: () => void;
  refreshToken?: number;
  onViewQuote?: (quote: QuoteWithItems) => void;
  onEditQuote?: (quote: QuoteWithItems) => void;
};

export type QuoteWithItems = Quote & {
  items?: QuoteItem[];
};

export function QuotesList({
  companyId,
  onUpdate,
  refreshToken = 0,
  onViewQuote,
  onEditQuote,
}: QuotesListProps) {
  const { profile } = useAuth();
  const [quotes, setQuotes] = useState<QuoteWithItems[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState<QuoteWithItems | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Quote | "client_info";
    direction: "asc" | "desc";
  } | null>(null);

  useEffect(() => {
    loadQuotes();
  }, [companyId, refreshToken]);

  const handleSort = (key: keyof Quote | "client_info") => {
    let direction: "asc" | "desc" = "asc";
    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === "asc"
    ) {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const statusLabels = {
    draft: "Brouillon",
    sent: "Envoyé",
    ordered: "Commandé",
    cancelled: "Annulé",
  };

  const filteredQuotes = quotes
    .filter((quote) => {
      const search = searchTerm.toLowerCase().trim();
      if (!search) return true;
      const haystack = [
        quote.quote_number,
        quote.client_name,
        quote.client_email,
        quote.client_phone,
        quote.client_address,
        quote.notes,
        statusLabels[quote.status],
        authors[quote.created_by],
        quote.total_amount,
        quote.total_amount != null
          ? quote.total_amount.toLocaleString("fr-FR")
          : "",
        quote.created_at
          ? new Date(quote.created_at).toLocaleDateString("fr-FR")
          : "",
        quote.updated_at
          ? new Date(quote.updated_at).toLocaleDateString("fr-FR")
          : "",
      ]
        .filter((v) => v !== null && v !== undefined && v !== "")
        .join(" | ")
        .toLowerCase();
      return search.split(/\s+/).every((term) => haystack.includes(term));
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;

      let valA, valB;

      if (key === "client_info") {
        valA = a.client_name?.toLowerCase() || "";
        valB = b.client_name?.toLowerCase() || "";
      } else {
        valA = a[key];
        valB = b[key];

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();
      }

      if (valA < valB) return direction === "asc" ? -1 : 1;
      if (valA > valB) return direction === "asc" ? 1 : -1;
      return 0;
    });

  async function loadQuotes() {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setQuotes(data);
      loadAuthors(data);
    }
    setLoading(false);
  }

  async function loadAuthors(quotes: Quote[]) {
    const output: Record<string, string> = {};
    const userIds = [
      ...new Set(quotes.map((q) => q.created_by).filter(Boolean)),
    ];

    if (userIds.length > 0) {
      const { data } = await supabase
        .from("user_profiles")
        .select("id, full_name")
        .in("id", userIds); // Custom Supabase client needs to support .in() or we loop

      // Fallback if .in is not supported correctly by custom client yet,
      // or if we just want to be safe with the custom implementation:
      if (data && data.length > 0) {
        data.forEach((user: any) => {
          output[user.id] = user.full_name;
        });
      } else {
        // If batch fetch failed or not supported, fetch one by one (less efficient but works with simple backend)
        for (const id of userIds) {
          const { data: user } = await supabase
            .from("user_profiles")
            .select("full_name")
            .eq("id", id)
            .single();
          if (user) output[id] = user.full_name;
        }
      }
    }
    setAuthors(output);
  }

  async function loadQuoteWithItems(quote: Quote) {
    const { data, error } = await supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", quote.id);

    if (!error && data) {
      if (onViewQuote) {
        onViewQuote({ ...quote, items: data });
      } else {
        setSelectedQuote({ ...quote, items: data });
      }
    }
  }

  async function convertToOrder(quote: Quote) {
    if (
      !confirm("Confirmer la conversion de ce devis en commande de livraison ?")
    )
      return;

    // Fetch Company Name for ID generation
    const { data: companyData } = await supabase
      .from("companies")
      .select("name")
      .eq("id", quote.company_id)
      .single();

    const companyName = companyData?.name
      ? companyData.name
          .trim()
          .split(/\s+/)
          .map((word: string) => word[0])
          .join("")
          .toUpperCase()
      : "ENT";

    const currentYear = new Date().getFullYear();
    const prefix = `${companyName}/CMD-${currentYear}`;

    // Find last order to increment sequence
    const { data: lastOrder } = await supabase
      .from("delivery_orders")
      .select("order_number")
      .eq("company_id", quote.company_id)
      // Search for both formats
      .or(
        `order_number.ilike.${companyName}_CMD-${currentYear}%,order_number.ilike.${companyName}/CMD-${currentYear}%`,
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let sequence = 1;
    if (lastOrder && lastOrder.order_number) {
      const parts = lastOrder.order_number.split("-");
      const lastSeqPart = parts[parts.length - 1];
      if (lastSeqPart.length >= 5) {
        const seqStr = lastSeqPart.slice(-5);
        const seqNum = parseInt(seqStr);
        if (!isNaN(seqNum)) {
          sequence = seqNum + 1;
        }
      }
    }

    const orderNumber = `${prefix}${sequence.toString().padStart(5, "0")}`;

    const { error } = await supabase.from("delivery_orders").insert({
      order_number: orderNumber,
      quote_id: quote.id,
      company_id: quote.company_id,
      status: "pending",
      created_by: quote.created_by,
    });

    if (!error) {
      await supabase
        .from("quotes")
        .update({ status: "ordered" })
        .eq("id", quote.id);

      loadQuotes();
      onUpdate();
      alert("Devis converti en commande de livraison avec succès");
    }
  }

  async function handleEdit(quote: Quote) {
    if (!onEditQuote) return;

    // Fetch items
    const { data: items } = await supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", quote.id);

    onEditQuote({
      ...quote,
      items: items || [],
    });
  }

  const statusColors = {
    draft: "bg-gray-100 text-gray-800",
    sent: "bg-blue-100 text-blue-800",
    ordered: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
  };

  const SortIcon = ({
    columnKey,
  }: {
    columnKey: keyof Quote | "client_info";
  }) => {
    const active = sortConfig?.key === columnKey;
    const direction = sortConfig?.direction || "asc";

    if (!active)
      return (
        <ArrowUpDown className="w-4 h-4 text-gray-400 ml-1 inline-block" />
      );
    return direction === "asc" ? (
      <ArrowUp className="w-4 h-4 text-blue-600 ml-1 inline-block" />
    ) : (
      <ArrowDown className="w-4 h-4 text-blue-600 ml-1 inline-block" />
    );
  };

  async function deleteQuote(id: string) {
    if (!confirm("Confirmer la suppression de ce devis ?")) return;

    const { error } = await supabase.from("quotes").delete().eq("id", id);

    if (!error) {
      loadQuotes();
      onUpdate();
    }
  }

  async function handleDownload(
    quote: Quote,
    mode: "print" | "download" = "print",
  ) {
    // For download mode or if we wanted a loading window for print, we could open one.
    // But user requested print dialog ONLY for print mode, no extra window.
    let printWindow: Window | null = null;
    if (mode === "download") {
      printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write("<div>Génération du PDF en cours...</div>");
      }
    }

    try {
      // Fetch items
      const { data: items } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", quote.id);

      // Fetch company
      const { data: company } = await supabase
        .from("companies")
        .select("*")
        .eq("id", quote.company_id)
        .single();

      if (!items || !company) {
        if (printWindow) {
          printWindow.document.body.innerHTML =
            '<div style="color:red;padding:20px;">Erreur: Impossible de charger les données du devis ou de l\'entreprise.</div>';
        } else {
          alert(
            "Erreur: Impossible de charger les données du devis ou de l'entreprise.",
          );
        }
        return;
      }

      await supabase.from("download_logs").insert({
        document_type: "quote",
        document_id: quote.id,
        downloaded_by: profile?.id,
      });

      downloadDocument(
        {
          type: "quote",
          number: quote.quote_number,
          date: new Date(quote.created_at).toLocaleDateString("fr-FR"),
          company: company as Company,
          client: {
            name: quote.client_name,
            email: quote.client_email,
            phone: quote.client_phone || "",
            address: quote.client_address || "",
          },
          items: items.map((item) => ({
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
          notes: quote.notes || "",
          downloadedBy: profile?.full_name || "",
        },
        printWindow,
        mode,
      );
    } catch (e: any) {
      console.error(e);
      if (printWindow) {
        printWindow.document.body.innerHTML = `<div style="color:red;padding:20px;">Erreur lors de la génération du document: ${
          e.message || "Erreur inconnue"
        }</div>`;
      } else {
        alert(
          `Erreur lors de la génération du document: ${
            e.message || "Erreur inconnue"
          }`,
        );
      }
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-shadow"
              placeholder="Rechercher (numéro, client, statut, montant, date...)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {filteredQuotes.length === 0 ? (
          <div className="text-center py-12 animate-fade-in">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Aucun devis trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleSort("quote_number")}
                  >
                    Numéro <SortIcon columnKey="quote_number" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleSort("client_info")}
                  >
                    Client <SortIcon columnKey="client_info" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleSort("total_amount")}
                  >
                    Montant <SortIcon columnKey="total_amount" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleSort("status")}
                  >
                    Statut <SortIcon columnKey="status" />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employé
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleSort("created_at")}
                  >
                    Date <SortIcon columnKey="created_at" />
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredQuotes.map((quote, index) => (
                  <tr
                    key={quote.id}
                    className="hover:bg-gray-50 transition-colors animate-slide-up"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {quote.quote_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {quote.client_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {quote.client_email}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {Number(quote.total_amount).toLocaleString()} FDJ
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[quote.status]}`}
                      >
                        {statusLabels[quote.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {authors[quote.created_by] || "Inconnu"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(quote.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end items-center gap-2">
                        <button
                          onClick={() => handleEdit(quote)}
                          className="p-1 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-full transition-colors"
                          title="Modifier"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => loadQuoteWithItems(quote)}
                          className="p-1 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-full transition-colors"
                          title="Voir les détails"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDownload(quote, "download")}
                          className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
                          title="Télécharger le PDF"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDownload(quote, "print")}
                          className="p-1 text-purple-600 hover:text-purple-900 hover:bg-purple-50 rounded-full transition-colors"
                          title="Imprimer"
                        >
                          <Printer className="w-5 h-5" />
                        </button>
                        {quote.status !== "ordered" &&
                          quote.status !== "cancelled" && (
                            <button
                              onClick={() => convertToOrder(quote)}
                              className="p-1 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-full transition-colors"
                              title="Convertir en commande"
                            >
                              <ArrowRight className="w-5 h-5" />
                            </button>
                          )}
                        <button
                          onClick={() => deleteQuote(quote.id)}
                          className="p-1 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-full transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!onViewQuote && selectedQuote && (
        <QuoteViewer
          quote={selectedQuote}
          onClose={() => setSelectedQuote(null)}
        />
      )}
    </>
  );
}
