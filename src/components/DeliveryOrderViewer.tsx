import { useState, useEffect } from "react";
import { X, Download, Printer } from "lucide-react";
import { DeliveryOrder, Quote, QuoteItem, Company } from "../lib/supabase";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { downloadDocument } from "../utils/pdfGenerator";

type DeliveryOrderViewerProps = {
  order: DeliveryOrder & {
    quote?: Quote & { items?: QuoteItem[] };
  };
  onClose: () => void;
};

export function DeliveryOrderViewer({
  order,
  onClose,
}: DeliveryOrderViewerProps) {
  const { profile } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);

  useEffect(() => {
    loadCompany();
  }, [order.company_id]);

  async function loadCompany() {
    const { data } = await supabase
      .from("companies")
      .select("*")
      .eq("id", order.company_id)
      .maybeSingle();

    if (data) setCompany(data);
  }

  async function handleDownload(mode: "print" | "download" = "print") {
    // If called from an event handler without args, it might receive the event object.
    const actualMode = typeof mode === "string" ? mode : "print";

    if (!company || !order.quote?.items) return;

    let printWindow: Window | null = null;
    if (actualMode === "download") {
      printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write("<div>Génération du PDF en cours...</div>");
      }
    }

    try {
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
          deliveryDate: order.delivery_date
            ? new Date(order.delivery_date).toLocaleDateString("fr-FR")
            : undefined,
          company,
          client: {
            name: order.quote.client_name,
            email: order.quote.client_email,
            phone: order.quote.client_phone || "",
            address: order.quote.client_address || "",
          },
          items: order.quote.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            width: item.width || undefined,
            length: item.length || undefined,
            unitPrice: item.unit_price,
            total: item.total_price,
          })),
          total: order.quote.total_amount,
          showSignature: order.quote.include_signature !== false,
          notes: order.quote.notes || "",
          downloadedBy: profile?.full_name || "",
        },
        printWindow,
        actualMode,
      );
    } catch (e: any) {
      console.error(e);
      if (printWindow) {
        printWindow.document.body.innerHTML = `<div style="color:red;padding:20px;">Erreur lors de la génération du document: ${
          e.message || "Erreur inconnue"
        }</div>`;
      } else if (actualMode !== "download") {
        alert(
          `Erreur lors de la génération du document: ${
            e.message || "Erreur inconnue"
          }`,
        );
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="sticky top-0 bg-white/90 backdrop-blur border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">
            Commande {order.order_number}
          </h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleDownload("download")}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-md transition-all duration-200"
            >
              <Download className="w-5 h-5" />
              <span>Télécharger PDF</span>
            </button>
            <button
              onClick={() => handleDownload("print")}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 hover:shadow-md transition-all duration-200"
            >
              <Printer className="w-5 h-5" />
              <span>Imprimer</span>
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-8">
          {company?.logo_url && (
            <img
              src={company.logo_url}
              alt="Logo"
              className="h-16 mb-6 object-contain"
            />
          )}

          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
                Entreprise
              </h3>
              <p className="text-lg font-medium text-gray-900">
                {company?.name}
              </p>
              {company?.email && (
                <p className="text-sm text-gray-600">{company.email}</p>
              )}
              {company?.phone && (
                <p className="text-sm text-gray-600">{company.phone}</p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
                Client
              </h3>
              <p className="text-lg font-medium text-gray-900">
                {order.quote?.client_name}
              </p>
              {order.quote?.client_email && (
                <p className="text-sm text-gray-600">
                  {order.quote?.client_email}
                </p>
              )}
              {order.quote?.client_phone && (
                <p className="text-sm text-gray-600">
                  {order.quote.client_phone}
                </p>
              )}
              {order.quote?.client_address && (
                <p className="text-sm text-gray-600">
                  {order.quote.client_address}
                </p>
              )}
            </div>
          </div>

          <div className="mb-8">
            <p className="text-sm text-gray-600">
              Date: {new Date(order.created_at).toLocaleDateString("fr-FR")}
            </p>
            {order.delivery_date && (
              <p className="text-sm text-gray-600">
                Date de livraison:{" "}
                {new Date(order.delivery_date).toLocaleDateString("fr-FR")}
              </p>
            )}
            <p className="text-sm text-gray-600">
              Statut:{" "}
              <span className="font-semibold">
                {order.status === "pending"
                  ? "En attente"
                  : order.status === "delivered"
                    ? "Livrée"
                    : "Annulée"}
              </span>
            </p>
          </div>

          <table className="w-full mb-8">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Description
                </th>
                {order.quote?.items?.some((i) => i.width && i.length) && (
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                    Dimensions (m)
                  </th>
                )}
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                  Quantité
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {order.quote?.items?.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {item.description}
                  </td>
                  {order.quote?.items?.some((i) => i.width && i.length) && (
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-mono">
                      {item.width && item.length
                        ? `${Number(item.width)} x ${Number(item.length)}`
                        : "-"}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {item.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {order.quote?.notes && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Notes
              </h3>
              <p className="text-sm text-gray-600">{order.quote.notes}</p>
            </div>
          )}

          {company?.signature_url &&
            order.quote?.include_signature !== false && (
            <div className="mt-8">
              <p className="text-sm text-gray-600 mb-2">Signature</p>
              <img
                src={company.signature_url}
                alt="Signature"
                className="h-16 object-contain"
              />
            </div>
          )}
          {company?.wallets && company.wallets.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-100">
              <h4 className="text-sm font-semibold text-gray-900 mb-3 text-center">
                Moyens de paiement acceptés
              </h4>
              <div className="flex flex-wrap justify-center gap-4">
                {company.wallets.map((wallet: any, index: number) => (
                  <div
                    key={index}
                    className="inline-flex items-center px-3 py-1.5 rounded-md bg-gray-50 border border-gray-100"
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-2">
                      {wallet.type}:
                    </span>
                    <span className="text-sm font-medium text-gray-900 font-mono">
                      {wallet.address}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
