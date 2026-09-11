import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase, Company } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { Building2, Save, Plus, Trash2, AlertTriangle } from "lucide-react";

type CompanySettingsProps = {
  company: Company | null;
  onUpdate: () => void;
};

export function CompanySettings({ company, onUpdate }: CompanySettingsProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(!company);
  // Verrou de suppression de l'entreprise
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [countingDocs, setCountingDocs] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteCounts, setDeleteCounts] = useState<{
    quotes: number;
    orders: number;
    invoices: number;
  } | null>(null);

  const [formData, setFormData] = useState({
    name: company?.name || "",
    logo_url: company?.logo_url || "",
    signature_url: company?.signature_url || "",
    email: company?.email || "",
    phone: company?.phone || "",
    wallets: company?.wallets || [],
    payment_terms: company?.payment_terms || "",
  });

  useEffect(() => {
    setIsCreating(!company);
    setFormData({
      name: company?.name || "",
      logo_url: company?.logo_url || "",
      signature_url: company?.signature_url || "",
      email: company?.email || "",
      phone: company?.phone || "",
      wallets: company?.wallets || [],
      payment_terms: company?.payment_terms || "",
    });
  }, [company]);

  const addWallet = () => {
    setFormData((prev) => ({
      ...prev,
      wallets: [...(prev.wallets || []), { type: "", address: "" }],
    }));
  };

  const updateWallet = (
    index: number,
    field: "type" | "address",
    value: string,
  ) => {
    const newWallets = [...(formData.wallets || [])];
    newWallets[index] = { ...newWallets[index], [field]: value };
    setFormData((prev) => ({ ...prev, wallets: newWallets }));
  };

  const removeWallet = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      wallets: (prev.wallets || []).filter((_, i) => i !== index),
    }));
  };

  async function uploadImage(file: File, type: "logo" | "signature") {
    if (!profile?.id) {
      setError("Profil utilisateur introuvable.");
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setError("Mode démo actif : connecte un compte réel pour uploader.");
      return;
    }

    const bucket = "company-assets";
    const fileExt = file.name.split(".").pop();
    const filePath = `${profile.id}/${type}-${Date.now()}.${fileExt}`;

    try {
      if (type === "logo") setUploadingLogo(true);
      if (type === "signature") setUploadingSignature(true);

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

      if (type === "logo") {
        setFormData((prev) => ({ ...prev, logo_url: data.publicUrl }));
      } else {
        setFormData((prev) => ({ ...prev, signature_url: data.publicUrl }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload");
    } finally {
      if (type === "logo") setUploadingLogo(false);
      if (type === "signature") setUploadingSignature(false);
    }
  }

  // Ouvre la fenêtre de suppression après avoir compté ce qui serait détruit.
  // Supprimer une entreprise efface en cascade ses devis, bons de commande et
  // factures : le comptage est donc affiché avant toute confirmation.
  async function openDeleteDialog() {
    if (!company) return;
    setDeleteConfirmName("");
    setDeleteCounts(null);
    setShowDeleteDialog(true);
    setCountingDocs(true);

    const [quotesRes, ordersRes, invoicesRes] = await Promise.all([
      supabase.from("quotes").select("*").eq("company_id", company.id),
      supabase.from("delivery_orders").select("*").eq("company_id", company.id),
      supabase.from("invoices").select("*").eq("company_id", company.id),
    ]);

    setDeleteCounts({
      quotes: (quotesRes.data || []).length,
      orders: (ordersRes.data || []).length,
      invoices: (invoicesRes.data || []).length,
    });
    setCountingDocs(false);
  }

  async function handleDelete() {
    if (!company || !deleteCounts) return;
    // Double garde : facturation existante, puis nom saisi à l'identique
    if (deleteCounts.invoices > 0) return;
    if (deleteConfirmName.trim() !== company.name) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", company.id);
      if (error) throw error;
      setShowDeleteDialog(false);
      onUpdate();
    } catch (e: any) {
      alert("Erreur lors de la suppression: " + e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setError(
          "Mode démo actif : connecte un compte réel pour créer une entreprise.",
        );
        return;
      }
      if (company) {
        // Handle update
        const updates: any = {
          name: formData.name,
          logo_url: formData.logo_url || null,
          signature_url: formData.signature_url || null,
          email: formData.email || null,
          phone: formData.phone || null,
          wallets: formData.wallets || [],
          payment_terms: formData.payment_terms || null,
        };

        // Remove undefined fields just in case
        Object.keys(updates).forEach(
          (key) => updates[key] === undefined && delete updates[key],
        );

        const { error: updateError } = await supabase
          .from("companies")
          .update(updates)
          .eq("id", company.id);

        if (updateError) throw updateError;
        alert("Entreprise mise à jour avec succès");
      } else {
        const { error: insertError } = await supabase.from("companies").insert({
          name: formData.name,
          logo_url: formData.logo_url || null,
          signature_url: formData.signature_url || null,
          email: formData.email || null,
          phone: formData.phone || null,
          wallets: formData.wallets || [],
          payment_terms: formData.payment_terms || null,
          employer_id: profile?.id,
        });

        if (insertError) throw insertError;
        alert("Entreprise créée avec succès");
        setIsCreating(false);
      }

      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-fade-in">
      <div className="flex items-center space-x-3 mb-6">
        <Building2 className="w-8 h-8 text-blue-600" />
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {company ? "Paramètres de l'entreprise" : "Créer une entreprise"}
          </h2>
          <p className="text-sm text-gray-600">
            Gérez les informations de votre entreprise
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 animate-slide-up">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nom de l'entreprise *
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email de l'entreprise
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="contact@entreprise.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Téléphone de l'entreprise
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="+253 77 00 00 00"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Comptes Wallet
          </label>
          <div className="space-y-3">
            {(formData.wallets || []).map((wallet, index) => (
              <div key={index} className="flex gap-3">
                <input
                  type="text"
                  value={wallet.type}
                  onChange={(e) => updateWallet(index, "type", e.target.value)}
                  placeholder="Type (ex: USDT, Orange Money)"
                  className="w-1/3 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={wallet.address}
                  onChange={(e) =>
                    updateWallet(index, "address", e.target.value)
                  }
                  placeholder="Adresse ou Numéro"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => removeWallet(index)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addWallet}
              className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Ajouter un wallet
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL du logo
          </label>
          <input
            type="text"
            value={formData.logo_url}
            onChange={(e) =>
              setFormData({ ...formData, logo_url: e.target.value })
            }
            placeholder="https://exemple.com/logo.png"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <div className="mt-2 flex items-center gap-3">
            <input
              type="file"
              accept="image/png"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadImage(file, "logo");
              }}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {uploadingLogo && (
              <span className="text-sm text-gray-500">Upload...</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            URL de l'image du logo (sera affichée dans les documents)
          </p>
          {formData.logo_url && (
            <div className="mt-2">
              <img
                src={formData.logo_url}
                alt="Logo"
                className="h-16 object-contain border border-gray-200 rounded p-2"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL de la signature
          </label>
          <input
            type="text"
            value={formData.signature_url}
            onChange={(e) =>
              setFormData({ ...formData, signature_url: e.target.value })
            }
            placeholder="https://exemple.com/signature.png"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <div className="mt-2 flex items-center gap-3">
            <input
              type="file"
              accept="image/png"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadImage(file, "signature");
              }}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {uploadingSignature && (
              <span className="text-sm text-gray-500">Upload...</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            URL de l'image de signature (sera affichée dans les documents)
          </p>
          {formData.signature_url && (
            <div className="mt-2">
              <img
                src={formData.signature_url}
                alt="Signature"
                className="h-16 object-contain border border-gray-200 rounded p-2"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Règlement
          </label>
          <textarea
            value={formData.payment_terms}
            onChange={(e) =>
              setFormData({ ...formData, payment_terms: e.target.value })
            }
            rows={5}
            placeholder={
              "Ex. :\n- Règlement à 30 jours à compter de la date de facture\n- Paiement par virement ou espèces\n- Pénalités de retard : 2% par mois"
            }
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Vos conditions de règlement. Elles s'affichent à droite de la
            signature sur les devis, bons de commande et factures, lorsque la
            case « Inclure le règlement » est cochée sur le devis.
          </p>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-200 gap-4">
          {company && (
            <button
              type="button"
              onClick={openDeleteDialog}
              className="mr-auto inline-flex items-center space-x-2 px-6 py-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 hover:shadow-sm transition-all duration-200"
            >
              <Trash2 className="w-5 h-5" />
              <span>Supprimer l'entreprise</span>
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-md transition-all duration-200 disabled:opacity-50 transform hover:-translate-y-0.5"
          >
            {company ? (
              <Save className="w-5 h-5" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
            <span>
              {loading
                ? "Enregistrement..."
                : company
                  ? "Enregistrer"
                  : "Créer"}
            </span>
          </button>
        </div>
      </form>

      {showDeleteDialog &&
        company &&
        createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-[110] p-4 pt-[6vh] overflow-y-auto">
            <div className="bg-white rounded-xl p-6 max-w-lg w-full animate-slide-up">
              <div className="flex items-start gap-3 mb-4">
                <div className="bg-red-50 p-2 rounded-lg">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Supprimer « {company.name} »
                  </h3>
                  <p className="text-sm text-gray-600">
                    Cette action est irréversible.
                  </p>
                </div>
              </div>

              {countingDocs && (
                <p className="text-sm text-gray-600 py-6 text-center">
                  Vérification des documents liés...
                </p>
              )}

              {!countingDocs && deleteCounts && (
                <>
                  {deleteCounts.invoices > 0 ? (
                    <>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                        <p className="text-sm text-red-800 font-semibold mb-2">
                          Suppression bloquée
                        </p>
                        <p className="text-sm text-red-700">
                          Cette entreprise contient encore{" "}
                          <strong>{deleteCounts.invoices} facture(s)</strong>.
                          Supprimer l'entreprise détruirait définitivement toute
                          votre facturation.
                        </p>
                        <p className="text-sm text-red-700 mt-2">
                          Si vous voulez réellement tout effacer, supprimez
                          d'abord les factures depuis l'onglet Factures.
                        </p>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-sm text-gray-700">
                        Documents liés : {deleteCounts.quotes} devis ·{" "}
                        {deleteCounts.orders} bon(s) de commande ·{" "}
                        {deleteCounts.invoices} facture(s)
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setShowDeleteDialog(false)}
                          className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          Fermer
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-800">
                        Seront également supprimés :{" "}
                        <strong>{deleteCounts.quotes} devis</strong> et{" "}
                        <strong>
                          {deleteCounts.orders} bon(s) de commande
                        </strong>
                        .
                      </div>

                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Pour confirmer, saisissez le nom exact de l'entreprise :{" "}
                        <span className="font-mono text-gray-900">
                          {company.name}
                        </span>
                      </label>
                      <input
                        type="text"
                        value={deleteConfirmName}
                        onChange={(e) => setDeleteConfirmName(e.target.value)}
                        placeholder={company.name}
                        autoComplete="off"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 mb-4"
                      />

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowDeleteDialog(false)}
                          className="px-5 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={
                            deleting ||
                            deleteConfirmName.trim() !== company.name
                          }
                          className="px-5 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {deleting
                            ? "Suppression..."
                            : "Supprimer définitivement"}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
