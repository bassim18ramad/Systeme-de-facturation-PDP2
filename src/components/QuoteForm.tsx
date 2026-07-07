import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { X, Plus, Trash2 } from "lucide-react";

type QuoteFormProps = {
  companyId: string;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any; // Using any to avoid complex type import but ideally Quote & { items: QuoteItem[] }
};

type QuoteItem = {
  description: string;
  quantity: number | "";
  unit_price: number | "";
  width?: number | "";
  length?: number | "";
};

export function QuoteForm({
  companyId,
  onClose,
  onSuccess,
  initialData,
}: QuoteFormProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    created_at: initialData?.created_at
      ? initialData.created_at.split("T")[0]
      : "",
    client_name: initialData?.client_name || "Client Divers",
    client_email: initialData?.client_email || "",
    client_phone: initialData?.client_phone || "",
    client_address: initialData?.client_address || "",
    notes:
      initialData?.notes ||
      "Nous vous remercions pour la confiance que vous nous accordez et restons à votre entière disposition pour toute information complémentaire.",
    include_tva: initialData?.include_tva || false,
    stamp_duty: initialData ? (initialData.stamp_duty ?? 0) : 1000,
  });

  const [items, setItems] = useState<QuoteItem[]>(
    initialData?.items
      ? initialData.items.map((i: any) => ({
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          width: i.width,
          length: i.length,
        }))
      : [
          {
            description: "",
            quantity: 1,
            unit_price: 0,
            width: "",
            length: "",
          },
        ],
  );

  function addItem() {
    setItems([
      ...items,
      {
        description: "",
        quantity: 1,
        unit_price: 0,
        width: "",
        length: "",
      },
    ]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(
    index: number,
    field: keyof QuoteItem,
    value: string | number,
  ) {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  }

  function calculateSubtotal() {
    return items.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      const width = item.width ? Number(item.width) : 0;
      const length = item.length ? Number(item.length) : 0;
      const sqMeters = width && length ? width * length : 1;

      return sum + qty * price * sqMeters;
    }, 0);
  }

  function calculateTotal() {
    const subtotal = calculateSubtotal();
    const tva = formData.include_tva ? subtotal * 0.18 : 0; // 18% is common in some places, but check specific.
    // Djibouti is 10%. User says "TVA". I will use 0.10 but maybe add a comment.
    // Let's assume standard VAT.
    return (
      subtotal +
      (formData.include_tva ? subtotal * 0.1 : 0) +
      (Number(formData.stamp_duty) || 0)
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!companyId) throw new Error("ID de l'entreprise manquant");
      if (!profile?.id) throw new Error("Profil utilisateur manquant");

      const totalAmount = calculateTotal();

      let quoteId = initialData?.id;

      if (initialData) {
        // Update Logic
        const { error: quoteError } = await supabase
          .from("quotes")
          .update({
            created_at: formData.created_at || null,
            client_name: formData.client_name,
            client_email: formData.client_email,
            client_phone: formData.client_phone || null,
            client_address: formData.client_address || null,
            notes: formData.notes || null,
            include_tva: formData.include_tva,
            stamp_duty: Number(formData.stamp_duty) || 0,
            total_amount: totalAmount,
          })
          .eq("id", initialData.id);
        if (quoteError) throw quoteError;

        // Clear Items
        const { error: deleteError } = await supabase
          .from("quote_items")
          .delete()
          .eq("quote_id", initialData.id);

        if (deleteError) throw deleteError;
      } else {
        // Create Logic
        // Fetch Company Name for ID generation
        const { data: companyData } = await supabase
          .from("companies")
          .select("name")
          .eq("id", companyId)
          .single();

        const companyName = companyData?.name
          ? companyData.name
              .trim()
              .split(/\s+/) // Handle multiple spaces
              .map((word: string) => word[0])
              .join("")
              .toUpperCase()
          : "ENT";

        const currentYear = new Date().getFullYear();
        const prefix = `${companyName}/DEV-${currentYear}`;

        // Prochain numéro = max des séquences existantes + 1.
        // (Se baser sur le dernier devis par created_at génère des doublons
        // dès qu'une date de création a été modifiée/antidatée.)
        const { data: existingQuotes } = await supabase
          .from("quotes")
          .select("quote_number")
          .eq("company_id", companyId)
          // Search for both formats to maintain sequence continuity
          .or(
            `quote_number.ilike.${companyName}_DEV-${currentYear}%,quote_number.ilike.${companyName}/DEV-${currentYear}%`,
          );

        let sequence = 1;
        for (const q of existingQuotes || []) {
          if (!q.quote_number) continue;
          const parts = q.quote_number.split("-");
          const lastSeqPart = parts[parts.length - 1]; // e.g., 202600001
          if (lastSeqPart.length >= 5) {
            const seqNum = parseInt(lastSeqPart.slice(-5));
            if (!isNaN(seqNum) && seqNum + 1 > sequence) {
              sequence = seqNum + 1;
            }
          }
        }

        const quoteNumber = `${prefix}${sequence.toString().padStart(5, "0")}`;

        const { data: quoteData, error: quoteError } = await supabase
          .from("quotes")
          .insert({
            quote_number: quoteNumber,
            company_id: companyId,
            client_name: formData.client_name,
            client_email: formData.client_email,
            client_phone: formData.client_phone || null,
            client_address: formData.client_address || null,
            notes: formData.notes || null,
            include_tva: formData.include_tva,
            stamp_duty: Number(formData.stamp_duty) || 0,
            total_amount: totalAmount,
            status: "draft",
            created_by: profile?.id,
          })
          .select()
          .single();
        if (quoteError) throw quoteError;
        quoteId = quoteData.id;
      }

      // Insert Items
      const itemsToInsert = items.map((item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unit_price) || 0;
        const width = item.width ? Number(item.width) : null;
        const length = item.length ? Number(item.length) : null;
        const sqMeters = width && length ? width * length : null;
        const multiplier = sqMeters ? sqMeters : 1;

        return {
          quote_id: quoteId, // Use variable
          description: item.description,
          quantity: qty,
          unit_price: price,
          width: width,
          length: length,
          total_price: qty * price * multiplier,
        };
      });

      const { error: itemsError } = await supabase
        .from("quote_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      onSuccess();
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : "Une erreur est survenue";
      setError(message);
      alert(`Erreur: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="sticky top-0 bg-white/90 backdrop-blur border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">
            {initialData ? "Modifier le Devis" : "Nouveau Devis"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg animate-slide-up">
              {error}
            </div>
          )}

          {initialData && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date de création
              </label>
              <input
                type="date"
                value={formData.created_at}
                onChange={(e) =>
                  setFormData({ ...formData, created_at: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom du client *
              </label>
              <input
                type="text"
                required
                value={formData.client_name}
                onChange={(e) =>
                  setFormData({ ...formData, client_name: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Client Divers"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email du client
              </label>
              <input
                type="email"
                value={formData.client_email}
                onChange={(e) =>
                  setFormData({ ...formData, client_email: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Téléphone
              </label>
              <input
                type="tel"
                value={formData.client_phone}
                onChange={(e) =>
                  setFormData({ ...formData, client_phone: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Adresse
              </label>
              <input
                type="text"
                value={formData.client_address}
                onChange={(e) =>
                  setFormData({ ...formData, client_address: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Articles</h3>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-md transition-all duration-200"
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter</span>
              </button>
            </div>

            <div className="space-y-4">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="flex gap-3 items-start bg-gray-50 p-4 rounded-lg"
                >
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-4">
                      <input
                        type="text"
                        placeholder="Description"
                        required
                        value={item.description}
                        onChange={(e) =>
                          updateItem(index, "description", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="md:col-span-1">
                      <input
                        type="number"
                        placeholder="Lrg (m)"
                        min="0"
                        step="0.01"
                        value={item.width || ""}
                        onChange={(e) =>
                          updateItem(
                            index,
                            "width",
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value),
                          )
                        }
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        title="Largeur"
                      />
                    </div>
                    <div className="md:col-span-1">
                      <input
                        type="number"
                        placeholder="Lng (m)"
                        min="0"
                        step="0.01"
                        value={item.length || ""}
                        onChange={(e) =>
                          updateItem(
                            index,
                            "length",
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value),
                          )
                        }
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        title="Longueur"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <input
                        type="number"
                        placeholder="Qte"
                        required
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(
                            index,
                            "quantity",
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value),
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <input
                        type="number"
                        placeholder="Prix unitaire"
                        required
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) =>
                          updateItem(
                            index,
                            "unit_price",
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value),
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        aria-label="Prix en FDJ"
                      />
                    </div>
                    <div className="md:col-span-2 flex items-center justify-end font-medium text-gray-700 px-3 py-2">
                      {(
                        (Number(item.quantity) || 0) *
                        (Number(item.unit_price) || 0) *
                        (item.width && item.length
                          ? Number(item.width) * Number(item.length)
                          : 1)
                      ).toLocaleString()}{" "}
                      FDJ
                    </div>
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-red-600 hover:text-red-700 p-2"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center space-x-2 p-2 bg-white rounded border border-gray-200 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={formData.include_tva}
                  onChange={(e) =>
                    setFormData({ ...formData, include_tva: e.target.checked })
                  }
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-700">
                  Appliquer la TVA (10%)
                </span>
              </label>

              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  Frais de timbre:
                </label>
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={formData.stamp_duty || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        stamp_duty: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2 text-gray-500 text-sm">
                    FDJ
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Total Hors Taxe:</span>
                <span>{calculateSubtotal().toLocaleString()} FDJ</span>
              </div>

              {formData.include_tva && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>TVA (10%):</span>
                  <span>
                    {(calculateSubtotal() * 0.1).toLocaleString()} FDJ
                  </span>
                </div>
              )}

              {formData.stamp_duty > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Frais de timbre:</span>
                  <span>
                    {Number(formData.stamp_duty).toLocaleString()} FDJ
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <span className="text-lg font-semibold text-gray-900">
                  Total
                </span>
                <span className="text-2xl font-bold text-blue-600">
                  {calculateTotal().toLocaleString()} FDJ
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-4 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading
                ? initialData
                  ? "Modification..."
                  : "Création..."
                : initialData
                  ? "Enregistrer les modifications"
                  : "Créer le devis"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
