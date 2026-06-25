import { useState, useEffect } from "react";
import {
  supabase,
  Invoice,
  DeliveryOrder,
  Quote,
  QuoteItem,
  Company,
} from "../lib/supabase";
import {
  Receipt,
  Eye,
  CheckCircle,
  Download,
  Printer,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Edit2,
  Trash2,
} from "lucide-react";
import { InvoiceViewer } from "./InvoiceViewer";
import { downloadDocument } from "../utils/pdfGenerator";
import { useAuth } from "../contexts/AuthContext";

type InvoicesListProps = {
  companyId: string;
  onUpdate: () => void;
  onViewInvoice?: (invoice: InvoiceWithDetails) => void;
};

export type InvoiceWithDetails = Invoice & {
  delivery_order?: DeliveryOrder & {
    quote?: Quote & { items?: QuoteItem[] };
  };
};

export function InvoicesList({
  companyId,
  onUpdate,
  onViewInvoice,
}: InvoicesListProps) {
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    created_at: "",
    payment_date: "",
    status: "unpaid",
    invoice_number: "",
  });
  const [selectedInvoice, setSelectedInvoice] =
    useState<InvoiceWithDetails | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Invoice;
    direction: "asc" | "desc";
  } | null>(null);

  useEffect(() => {
    loadInvoices();
  }, [companyId]);

  const handleSort = (key: keyof Invoice) => {
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
    unpaid: "Non payée",
    paid: "Payée",
    cancelled: "Annulée",
  };

  const statusColors = {
    unpaid: "bg-red-100 text-red-800",
    paid: "bg-green-100 text-green-800",
    cancelled: "bg-gray-100 text-gray-800",
  };

  const filteredInvoices = invoices
    .filter((invoice) => {
      const search = searchTerm.toLowerCase();
      // Also potentially search linked quote data if needed, but keeping simple for now
      return (
        invoice.invoice_number.toLowerCase().includes(search) ||
        statusLabels[invoice.status]?.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;

      let valA = a[key] as string | number | null;
      let valB = b[key] as string | number | null;

      if (valA === null) valA = "";
      if (valB === null) valB = "";

      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();

      if (valA < valB) return direction === "asc" ? -1 : 1;
      if (valA > valB) return direction === "asc" ? 1 : -1;
      return 0;
    });

  async function loadInvoices() {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setInvoices(data);
    }
    setLoading(false);
  }

  async function loadInvoiceWithDetails(invoice: Invoice) {
    const { data: orderData, error: orderError } = await supabase
      .from("delivery_orders")
      .select("*")
      .eq("id", invoice.delivery_order_id)
      .maybeSingle();

    if (!orderError && orderData) {
      const { data: quoteData } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", orderData.quote_id)
        .maybeSingle();

      if (quoteData) {
        const { data: itemsData } = await supabase
          .from("quote_items")
          .select("*")
          .eq("quote_id", quoteData.id);

        const invoiceWithDetails = {
          ...invoice,
          delivery_order: {
            ...orderData,
            quote: { ...quoteData, items: itemsData || [] },
          },
        };

        if (onViewInvoice) {
          onViewInvoice(invoiceWithDetails);
        } else {
          setSelectedInvoice(invoiceWithDetails);
        }
      }
    }
  }

  async function markAsPaid(id: string) {
    if (!confirm("Marquer cette facture comme payée ?")) return;

    const { error } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        payment_date: new Date().toISOString().split("T")[0],
      })
      .eq("id", id);

    if (!error) {
      loadInvoices();
      onUpdate();
    }
  }

  async function handleUpdateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;

    const { error } = await supabase
      .from("invoices")
      .update({
        created_at: editForm.created_at || null,
        payment_date: editForm.payment_date || null,
        status: editForm.status,
      })
      .eq("id", editingId);

    if (error) {
      alert("Erreur lors de la mise à jour");
    } else {
      setEditingId(null);
      loadInvoices();
      onUpdate();
    }
  }

  async function deleteInvoice(id: string) {
    if (
      !confirm(
        "Confirmer la suppression de cette facture ? Cette action est irréversible.",
      )
    )
      return;

    const { error } = await supabase.from("invoices").delete().eq("id", id);

    if (error) {
      alert("Erreur lors de la suppression");
    } else {
      loadInvoices();
      onUpdate();
    }
  }

  function startEdit(invoice: InvoiceWithDetails) {
    setEditingId(invoice.id);
    setEditForm({
      created_at: invoice.created_at ? invoice.created_at.split("T")[0] : "",
      invoice_number: invoice.invoice_number,
      payment_date: invoice.payment_date
        ? invoice.payment_date.split("T")[0]
        : "",
      status: invoice.status as string,
    });
  }

  async function handleDownload(
    invoice: Invoice,
    mode: "print" | "download" = "print",
  ) {
    let printWindow: Window | null = null;
    if (mode === "download") {
      printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write("<div>Génération du PDF en cours...</div>");
      }
    }

    try {
      const { data: orderData } = await supabase
        .from("delivery_orders")
        .select("*")
        .eq("id", invoice.delivery_order_id)
        .single();

      if (!orderData) {
        if (printWindow) {
          printWindow.document.body.innerHTML =
            '<div style="color:red;padding:20px;">Erreur: Bon de livraison introuvable.</div>';
        } else {
          alert("Erreur: Bon de livraison introuvable.");
        }
        return;
      }

      const { data: quoteData } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", orderData.quote_id)
        .single();

      if (!quoteData) {
        if (printWindow) {
          printWindow.document.body.innerHTML =
            '<div style="color:red;padding:20px;">Erreur: Devis introuvable.</div>';
        } else {
          alert("Erreur: Devis introuvable.");
        }
        return;
      }

      const { data: items } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", quoteData.id);

      const { data: company } = await supabase
        .from("companies")
        .select("*")
        .eq("id", invoice.company_id)
        .single();

      if (!items || !company) {
        if (printWindow) {
          printWindow.document.body.innerHTML =
            '<div style="color:red;padding:20px;">Erreur: Données incomplètes.</div>';
        } else {
          alert("Erreur: Données incomplètes.");
        }
        return;
      }

      await supabase.from("download_logs").insert({
        document_type: "invoice",
        document_id: invoice.id,
        downloaded_by: profile?.id,
      });

      downloadDocument(
        {
          type: "invoice",
          number: invoice.invoice_number,
          date: new Date(invoice.created_at).toLocaleDateString("fr-FR"),
          company: company as Company,
          client: {
            name: quoteData.client_name,
            email: quoteData.client_email,
            phone: quoteData.client_phone || "",
            address: quoteData.client_address || "",
          },
          items: items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            width: item.width || undefined,
            length: item.length || undefined,
            unitPrice: item.unit_price,
            total: item.total_price,
          })),
          total: quoteData.total_amount,
          notes: quoteData.notes || "",
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

  const SortIcon = ({ columnKey }: { columnKey: keyof Invoice }) => {
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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      {editingId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full animate-slide-up">
            <h3 className="text-lg font-bold mb-4">Modifier la Facture</h3>
            <form onSubmit={handleUpdateInvoice} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Date de création
                </label>
                <input
                  type="date"
                  value={editForm.created_at}
                  onChange={(e) =>
                    setEditForm({ ...editForm, created_at: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Date de paiement
                </label>
                <input
                  type="date"
                  value={editForm.payment_date}
                  onChange={(e) =>
                    setEditForm({ ...editForm, payment_date: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Statut
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({ ...editForm, status: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="unpaid">Impayée</option>
                  <option value="paid">Payée</option>
                  <option value="cancelled">Annulée</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-shadow"
              placeholder="Rechercher une facture..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="text-center py-12 animate-fade-in">
            <Receipt className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Aucune facture trouvée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleSort("invoice_number")}
                  >
                    Numéro <SortIcon columnKey="invoice_number" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleSort("status")}
                  >
                    Statut <SortIcon columnKey="status" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleSort("created_at")}
                  >
                    Date création <SortIcon columnKey="created_at" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleSort("payment_date")}
                  >
                    Date paiement <SortIcon columnKey="payment_date" />
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInvoices.map((invoice, index) => (
                  <tr
                    key={invoice.id}
                    className="hover:bg-gray-50 transition-colors animate-slide-up"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[invoice.status]}`}
                      >
                        {statusLabels[invoice.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(invoice.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invoice.payment_date
                        ? new Date(invoice.payment_date).toLocaleDateString(
                            "fr-FR",
                          )
                        : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end items-center gap-2">
                        <button
                          onClick={() => startEdit(invoice)}
                          className="p-1 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-full transition-colors"
                          title="Modifier"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => deleteInvoice(invoice.id)}
                          className="p-1 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-full transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => loadInvoiceWithDetails(invoice)}
                          className="p-1 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-full transition-colors"
                          title="Voir les détails"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDownload(invoice, "download")}
                          className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
                          title="Télécharger le PDF"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDownload(invoice, "print")}
                          className="p-1 text-purple-600 hover:text-purple-900 hover:bg-purple-50 rounded-full transition-colors"
                          title="Imprimer"
                        >
                          <Printer className="w-5 h-5" />
                        </button>
                        {invoice.status === "unpaid" && (
                          <button
                            onClick={() => markAsPaid(invoice.id)}
                            className="p-1 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-full transition-colors"
                            title="Marquer comme payée"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!onViewInvoice && selectedInvoice && (
        <InvoiceViewer
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </>
  );
}
