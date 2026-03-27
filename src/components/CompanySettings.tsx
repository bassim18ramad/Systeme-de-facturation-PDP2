import { useState, useEffect } from "react";
import { supabase, Company } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { Building2, Save, Plus, Trash2 } from "lucide-react";

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

  const [formData, setFormData] = useState({
    name: company?.name || "",
    logo_url: company?.logo_url || "",
    signature_url: company?.signature_url || "",
    email: company?.email || "",
    phone: company?.phone || "",
    wallets: company?.wallets || [],
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

  async function handleDelete() {
    if (!company) return;
    if (
      !confirm(
        "Êtes-vous sûr de vouloir supprimer cette entreprise ? Cette action est irréversible et supprimera toutes les données associées.",
      )
    )
      return;

    try {
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", company.id);
      if (error) throw error;
      onUpdate();
    } catch (e: any) {
      alert("Erreur lors de la suppression: " + e.message);
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

        <div className="flex justify-end pt-4 border-t border-gray-200 gap-4">
          {company && (
            <button
              type="button"
              onClick={handleDelete}
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
    </div>
  );
}
