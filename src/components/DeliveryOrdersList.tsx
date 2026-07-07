import { useState, useEffect } from "react";
import {
  supabase,
  DeliveryOrder,
  Quote,
  QuoteItem,
  Company,
} from "../lib/supabase";
import {
  Truck,
  ArrowRight,
  Eye,
  Download,
  Printer,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Edit2,
  Trash2,
} from "lucide-react";
import { DeliveryOrderViewer } from "./DeliveryOrderViewer";
import { downloadDocument } from "../utils/pdfGenerator";
import { useAuth } from "../contexts/AuthContext";

type DeliveryOrdersListProps = {
  companyId: string;
  onUpdate: () => void;
  onViewOrder?: (order: OrderWithDetails) => void;
};

export type OrderWithDetails = DeliveryOrder & {
  quote?: Quote & { items?: QuoteItem[] };
};

export function DeliveryOrdersList({
  companyId,
  onUpdate,
  onViewOrder,
}: DeliveryOrdersListProps) {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [orderClients, setOrderClients] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    created_at: "",
    delivery_date: "",
    status: "pending",
  });
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(
    null,
  );
  const [convertedOrderIds, setConvertedOrderIds] = useState<Set<string>>(
    new Set(),
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{
    key: keyof DeliveryOrder | "client";
    direction: "asc" | "desc";
  } | null>(null);

  useEffect(() => {
    loadOrders();
  }, [companyId]);

  const handleSort = (key: keyof DeliveryOrder | "client") => {
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

  const SortIcon = ({
    columnKey,
  }: {
    columnKey: keyof DeliveryOrder | "client";
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

  const statusLabels = {
    pending: "En attente",
    delivered: "Livrée",
    cancelled: "Annulée",
  };

  const statusColors = {
    pending: "bg-orange-100 text-orange-800",
    delivered: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
  };

  const filteredOrders = orders
    .filter((order) => {
      const search = searchTerm.toLowerCase().trim();
      if (!search) return true;
      const haystack = [
        order.order_number,
        orderClients[order.id],
        statusLabels[order.status],
        order.created_at
          ? new Date(order.created_at).toLocaleDateString("fr-FR")
          : "",
        order.delivery_date
          ? new Date(order.delivery_date).toLocaleDateString("fr-FR")
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

      let valA: string | number;
      let valB: string | number;

      if (key === "client") {
        valA = (orderClients[a.id] || "").toLowerCase();
        valB = (orderClients[b.id] || "").toLowerCase();
      } else {
        valA = a[key] as string | number;
        valB = b[key] as string | number;

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();
      }

      if (valA < valB) return direction === "asc" ? -1 : 1;
      if (valA > valB) return direction === "asc" ? 1 : -1;
      return 0;
    });

  async function loadOrders() {
    setLoading(true);
    const { data, error } = await supabase
      .from("delivery_orders")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setOrders(data);

      const { data: quotesData } = await supabase
        .from("quotes")
        .select("*")
        .eq("company_id", companyId);

      const quoteClientMap: Record<string, string> = {};
      (quotesData || []).forEach((q: any) => {
        quoteClientMap[q.id] = q.client_name;
      });

      const clientMap: Record<string, string> = {};
      data.forEach((o: any) => {
        clientMap[o.id] = quoteClientMap[o.quote_id] || "";
      });
      setOrderClients(clientMap);

      const { data: invoicesData } = await supabase
        .from("invoices")
        .select("delivery_order_id")
        .eq("company_id", companyId);

      if (invoicesData) {
        setConvertedOrderIds(
          new Set(invoicesData.map((inv: any) => inv.delivery_order_id)),
        );
      }
    }
    setLoading(false);
  }

  async function loadOrderWithDetails(order: DeliveryOrder) {
    const { data: quoteData, error: quoteError } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", order.quote_id)
      .maybeSingle();

    if (!quoteError && quoteData) {
      const { data: itemsData } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", quoteData.id);

      const orderWithDetails = {
        ...order,
        quote: { ...quoteData, items: itemsData || [] },
      };

      if (onViewOrder) {
        onViewOrder(orderWithDetails);
      } else {
        setSelectedOrder(orderWithDetails);
      }
    }
  }

  async function convertToInvoice(order: DeliveryOrder) {
    if (!confirm("Confirmer la conversion de cette commande en facture ?"))
      return;

    // Fetch Company Name for ID generation
    const { data: companyData } = await supabase
      .from("companies")
      .select("name")
      .eq("id", order.company_id)
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
    const prefix = `${companyName}/FACT-${currentYear}`;

    // Prochain numéro = max des séquences existantes + 1.
    // (Se baser sur la dernière facture par created_at génère des doublons
    // dès qu'une date de création a été modifiée/antidatée.)
    const { data: existingInvoices } = await supabase
      .from("invoices")
      .select("invoice_number")
      .eq("company_id", order.company_id)
      // Search for both formats
      .or(
        `invoice_number.ilike.${companyName}_FACT-${currentYear}%,invoice_number.ilike.${companyName}/FACT-${currentYear}%`,
      );

    let sequence = 1;
    for (const inv of existingInvoices || []) {
      if (!inv.invoice_number) continue;
      const parts = inv.invoice_number.split("-");
      const lastSeqPart = parts[parts.length - 1]; // e.g., 202600001
      if (lastSeqPart.length >= 5) {
        const seqNum = parseInt(lastSeqPart.slice(-5));
        if (!isNaN(seqNum) && seqNum + 1 > sequence) {
          sequence = seqNum + 1;
        }
      }
    }

    const invoiceNumber = `${prefix}${sequence.toString().padStart(5, "0")}`;

    const { error } = await supabase.from("invoices").insert({
      invoice_number: invoiceNumber,
      delivery_order_id: order.id,
      company_id: order.company_id,
      status: "unpaid",
      created_by: order.created_by,
    });

    if (!error) {
      loadOrders();
      onUpdate();
      alert("Commande convertie en facture avec succès");
    } else {
      alert(
        `Erreur lors de la conversion en facture: ${error.message || "Erreur inconnue"}`,
      );
    }
  }

  async function updateStatus(id: string, status: "pending" | "delivered") {
    const { error } = await supabase
      .from("delivery_orders")
      .update({ status })
      .eq("id", id);

    if (!error) {
      loadOrders();
      onUpdate();
    }
  }

  async function handleUpdateOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;

    const { error } = await supabase
      .from("delivery_orders")
      .update({
        created_at: editForm.created_at || null,
        delivery_date: editForm.delivery_date || null,
        status: editForm.status,
      })
      .eq("id", editingId);

    if (error) {
      alert("Erreur lors de la mise à jour");
    } else {
      setEditingId(null);
      loadOrders();
      onUpdate();
    }
  }

  async function deleteOrder(id: string) {
    if (
      !confirm(
        "Confirmer la suppression de ce bon de commande ? Cette action est irréversible.",
      )
    )
      return;

    const { error } = await supabase
      .from("delivery_orders")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Erreur lors de la suppression");
    } else {
      loadOrders();
      onUpdate();
    }
  }

  function startEdit(order: OrderWithDetails) {
    setEditingId(order.id);
    setEditForm({
      created_at: order.created_at ? order.created_at.split("T")[0] : "",
      delivery_date: order.delivery_date
        ? order.delivery_date.split("T")[0]
        : "",
      status: order.status as string,
    });
  }

  async function handleDownload(
    order: DeliveryOrder,
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
      const { data: quoteData } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", order.quote_id)
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
        .eq("id", order.company_id)
        .single();

      if (!items || !company) {
        if (printWindow) {
          printWindow.document.body.innerHTML =
            '<div style="color:red;padding:20px;">Erreur: Impossible de charger les données de la commande ou de l\'entreprise.</div>';
        } else {
          alert(
            "Erreur: Impossible de charger les données de la commande ou de l'entreprise.",
          );
        }
        return;
      }

      await supabase.from("download_logs").insert({
        document_type: "delivery_order",
        document_id: order.id,
        downloaded_by: profile?.id,
      });

      downloadDocument(
        {
          type: "delivery_order",
          number: order.order_number,
          date: new Date(order.created_at).toLocaleDateString("fr-FR"),
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
            <h3 className="text-lg font-bold mb-4">
              Modifier le Bon de Livraison
            </h3>
            <form onSubmit={handleUpdateOrder} className="space-y-4">
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
                  Date de livraison
                </label>
                <input
                  type="date"
                  value={editForm.delivery_date}
                  onChange={(e) =>
                    setEditForm({ ...editForm, delivery_date: e.target.value })
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
                  <option value="pending">En attente</option>
                  <option value="delivered">Livré</option>
                  <option value="cancelled">Annulé</option>
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
              placeholder="Rechercher (numéro, client, statut, date...)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="text-center py-12 animate-fade-in">
            <Truck className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              Aucune commande de livraison trouvée
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleSort("order_number")}
                  >
                    Numéro <SortIcon columnKey="order_number" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleSort("client")}
                  >
                    Client <SortIcon columnKey="client" />
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
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredOrders.map((order, index) => (
                  <tr
                    key={order.id}
                    className="hover:bg-gray-50 transition-colors animate-slide-up"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {order.order_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {orderClients[order.id] || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[order.status]}`}
                      >
                        {statusLabels[order.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(order.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end items-center gap-2">
                        <button
                          onClick={() => startEdit(order)}
                          className="p-1 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-full transition-colors"
                          title="Modifier"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => deleteOrder(order.id)}
                          className="p-1 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-full transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => loadOrderWithDetails(order)}
                          className="p-1 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-full transition-colors"
                          title="Voir les détails"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDownload(order, "download")}
                          className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
                          title="Télécharger le PDF"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDownload(order, "print")}
                          className="p-1 text-purple-600 hover:text-purple-900 hover:bg-purple-50 rounded-full transition-colors"
                          title="Imprimer"
                        >
                          <Printer className="w-5 h-5" />
                        </button>
                        {order.status === "pending" && (
                          <button
                            onClick={() => updateStatus(order.id, "delivered")}
                            className="p-1 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-full transition-colors"
                            title="Marquer comme livrée"
                          >
                            <Truck className="w-5 h-5" />
                          </button>
                        )}
                        {order.status === "delivered" &&
                          !convertedOrderIds.has(order.id) && (
                            <button
                              onClick={() => convertToInvoice(order)}
                              className="p-1 text-emerald-600 hover:text-emerald-900 hover:bg-emerald-50 rounded-full transition-colors"
                              title="Convertir en facture"
                            >
                              <ArrowRight className="w-5 h-5" />
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

      {!onViewOrder && selectedOrder && (
        <DeliveryOrderViewer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </>
  );
}
