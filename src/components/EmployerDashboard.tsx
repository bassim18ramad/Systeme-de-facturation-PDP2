import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase, Company } from "../lib/supabase";
import {
  LogOut,
  Building2,
  FileText,
  Truck,
  Receipt,
  Users,
  PenTool,
  Plus,
  Download,
  Loader2,
} from "lucide-react";
import { downloadDocumentsZip, BulkType } from "../utils/bulkDownload";
import { CompanySettings } from "./CompanySettings";
import { QuotesList, QuoteWithItems } from "./QuotesList";
import { DeliveryOrdersList, OrderWithDetails } from "./DeliveryOrdersList";
import { InvoicesList, InvoiceWithDetails } from "./InvoicesList";
import { EmployeeManagement } from "./EmployeeManagement";
import { QuoteViewer } from "./QuoteViewer";
import { DeliveryOrderViewer } from "./DeliveryOrderViewer";
import { InvoiceViewer } from "./InvoiceViewer";

import { QuoteForm } from "./QuoteForm";

type TabType = "quotes" | "orders" | "invoices" | "employees" | "settings";

export function EmployerDashboard() {
  const { signOut, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("quotes");

  // Modal states
  const [viewQuote, setViewQuote] = useState<QuoteWithItems | null>(null);
  const [editQuote, setEditQuote] = useState<QuoteWithItems | null>(null); // To trigger edit
  const [viewOrder, setViewOrder] = useState<OrderWithDetails | null>(null);
  const [viewInvoice, setViewInvoice] = useState<InvoiceWithDetails | null>(
    null,
  );

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quotesRefreshToken, setQuotesRefreshToken] = useState(0);
  // Export ZIP groupé (réservé à l'employeur)
  const [zipJob, setZipJob] = useState<{
    type: BulkType;
    done: number;
    total: number;
  } | null>(null);
  const [stats, setStats] = useState({
    totalQuotes: 0,
    draftQuotes: 0,
    sentQuotes: 0,
    orderedQuotes: 0,
    totalOrders: 0,
    pendingOrders: 0,
    deliveredOrders: 0,
    totalInvoices: 0,
    unpaidInvoices: 0,
    paidInvoices: 0,
  });

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    if (selectedCompany) {
      loadStats();
    }
    // Rafraîchir aussi à chaque changement d'onglet pour rester à jour
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany, activeTab]);

  async function loadCompanies() {
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setCompanies(data);
      if (data.length > 0 && !selectedCompany) {
        setSelectedCompany(data[0]);
      }
    }
  }

  async function loadStats() {
    if (!selectedCompany) return;

    const [quotesRes, ordersRes, invoicesRes] = await Promise.all([
      supabase
        .from("quotes")
        .select("*")
        .eq("company_id", selectedCompany.id),
      supabase
        .from("delivery_orders")
        .select("*")
        .eq("company_id", selectedCompany.id),
      supabase
        .from("invoices")
        .select("*")
        .eq("company_id", selectedCompany.id),
    ]);

    const quotes = quotesRes.data || [];
    const orders = ordersRes.data || [];
    const invoices = invoicesRes.data || [];
    const countBy = (list: { status?: string }[], status: string) =>
      list.filter((item) => item.status === status).length;

    setStats({
      totalQuotes: quotes.length,
      draftQuotes: countBy(quotes, "draft"),
      sentQuotes: countBy(quotes, "sent"),
      orderedQuotes: countBy(quotes, "ordered"),
      totalOrders: orders.length,
      pendingOrders: countBy(orders, "pending"),
      deliveredOrders: countBy(orders, "delivered"),
      totalInvoices: invoices.length,
      unpaidInvoices: countBy(invoices, "unpaid"),
      paidInvoices: countBy(invoices, "paid"),
    });
  }

  async function handleZipDownload(
    e: React.MouseEvent,
    type: BulkType,
    label: string,
  ) {
    e.stopPropagation();
    if (!selectedCompany || zipJob) return;

    setZipJob({ type, done: 0, total: 0 });
    try {
      const count = await downloadDocumentsZip(
        selectedCompany.id,
        type,
        profile?.full_name || "",
        (done, total) => setZipJob({ type, done, total }),
      );
      alert(
        `Archive ZIP générée : ${count} document${count > 1 ? "s" : ""} inclus (${label}s).`,
      );
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Erreur lors de la génération de l'archive",
      );
    } finally {
      setZipJob(null);
    }
  }

  const ZipButton = ({
    type,
    title,
    tooltip,
  }: {
    type: BulkType;
    title: string;
    tooltip: string;
  }) => {
    const running = zipJob?.type === type;
    return (
      <button
        onClick={(e) => handleZipDownload(e, type, title)}
        disabled={!!zipJob}
        title={tooltip}
        className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 hover:text-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {zipJob.total > 0 ? `${zipJob.done}/${zipJob.total}` : "..."}
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            ZIP
          </>
        )}
      </button>
    );
  };

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "new") {
      setSelectedCompany(null);
      setActiveTab("settings");
    } else {
      const company = companies.find((c) => c.id === value);
      if (company) {
        setSelectedCompany(company);
        if (activeTab === "settings" && !selectedCompany) {
          setActiveTab("quotes");
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col">
      <header className="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <div className="bg-blue-600 p-2 rounded-lg shadow-sm">
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <select
                    value={selectedCompany?.id || "new"}
                    onChange={handleCompanyChange}
                    className="text-lg font-bold text-gray-900 border-none bg-transparent focus:ring-0 cursor-pointer pr-8 pl-0 py-0"
                  >
                    {companies.length === 0 && (
                      <option value="" disabled>
                        Aucune entreprise
                      </option>
                    )}
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    <option value="new">+ Nouvelle entreprise</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  {profile?.full_name}
                </p>
                <p className="text-xs text-gray-500">Administrateur</p>
              </div>
              <div className="h-6 w-px bg-gray-200 mx-2 hidden sm:block"></div>
              <button
                onClick={signOut}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                title="Déconnexion"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full animate-fade-in">
        {selectedCompany && activeTab !== "settings" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div
              onClick={() => setActiveTab("quotes")}
              className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md hover:border-blue-200 hover:-translate-y-0.5 cursor-pointer animate-slide-up"
              style={{ animationDelay: "0s" }}
              title="Voir les devis"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    Total Devis
                  </p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {stats.totalQuotes}
                  </p>
                </div>
                <div className="bg-blue-50 p-3 rounded-xl">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="mt-4 flex items-center flex-wrap gap-1.5 text-sm">
                <span className="text-gray-600 font-medium bg-gray-100 px-2 py-0.5 rounded-full text-xs">
                  {stats.draftQuotes} brouillons
                </span>
                <span className="text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded-full text-xs">
                  {stats.sentQuotes} envoyés
                </span>
                <span className="text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full text-xs">
                  {stats.orderedQuotes} commandés
                </span>
                <ZipButton
                  type="quotes"
                  title="devi"
                  tooltip="Télécharger tous les devis en ZIP"
                />
              </div>
            </div>

            <div
              onClick={() => setActiveTab("orders")}
              className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md hover:border-purple-200 hover:-translate-y-0.5 cursor-pointer animate-slide-up"
              style={{ animationDelay: "0.1s" }}
              title="Voir les commandes"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    Total Commandes
                  </p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {stats.totalOrders}
                  </p>
                </div>
                <div className="bg-purple-50 p-3 rounded-xl">
                  <Truck className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <div className="mt-4 flex items-center flex-wrap gap-1.5 text-sm">
                <span className="text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full text-xs">
                  {stats.pendingOrders} en attente
                </span>
                <span className="text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full text-xs">
                  {stats.deliveredOrders} livrées
                </span>
                <ZipButton
                  type="orders"
                  title="commande"
                  tooltip="Télécharger tous les bons de commande en ZIP"
                />
              </div>
            </div>

            <div
              onClick={() => setActiveTab("invoices")}
              className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md hover:border-green-200 hover:-translate-y-0.5 cursor-pointer animate-slide-up"
              style={{ animationDelay: "0.2s" }}
              title="Voir les factures"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Factures</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {stats.totalInvoices}
                  </p>
                </div>
                <div className="bg-green-50 p-3 rounded-xl">
                  <Receipt className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="mt-4 flex items-center flex-wrap gap-1.5 text-sm">
                <span className="text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full text-xs">
                  {stats.unpaidInvoices} impayées
                </span>
                <span className="text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full text-xs">
                  {stats.paidInvoices} payées
                </span>
                <ZipButton
                  type="invoices"
                  title="facture"
                  tooltip="Télécharger toutes les factures en ZIP"
                />
              </div>
            </div>

            <div
              className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md hover:border-indigo-200 animate-slide-up"
              style={{ animationDelay: "0.3s" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Actions</p>
                  <p className="text-sm text-gray-600 mt-2">Gestion rapide</p>
                </div>
                <div className="bg-indigo-50 p-3 rounded-xl">
                  <PenTool className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <button
                onClick={() => setActiveTab("settings")}
                className="mt-4 w-full bg-gray-50 text-indigo-600 text-sm font-medium py-1.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
              >
                Gérer l'entreprise
              </button>
            </div>
          </div>
        )}

        <div
          className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-slide-up"
          style={{ animationDelay: "0.4s" }}
        >
          <div className="border-b border-gray-200 overflow-x-auto">
            <nav className="flex space-x-1 p-1" aria-label="Tabs">
              {[
                { id: "quotes", label: "Devis", icon: FileText },
                { id: "orders", label: "Commandes", icon: Truck },
                { id: "invoices", label: "Factures", icon: Receipt },
                { id: "employees", label: "Employés", icon: Users },
                { id: "settings", label: "Paramètres", icon: Building2 },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={`
                      flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 whitespace-nowrap
                      ${
                        activeTab === tab.id
                          ? "bg-blue-50 text-blue-700 shadow-sm"
                          : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                      }
                    `}
                  >
                    <Icon
                      className={`w-5 h-5 mr-2 ${
                        activeTab === tab.id
                          ? "text-blue-600"
                          : "text-gray-400 group-hover:text-gray-500"
                      }`}
                    />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-6 min-h-[400px]">
            {/* Logic to show content based on activeTab and selectedCompany */}
            {activeTab === "settings" ? (
              <div className="animate-fade-in">
                <CompanySettings
                  company={selectedCompany}
                  onUpdate={loadCompanies}
                />
              </div>
            ) : selectedCompany ? (
              <div className="animate-fade-in">
                {activeTab === "quotes" && (
                  <>
                    <div className="flex justify-end mb-4">
                      <button
                        onClick={() => {
                          setEditQuote(null);
                          setShowQuoteForm(true);
                        }}
                        className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-md transition-all duration-200"
                      >
                        <Plus className="w-5 h-5" />
                        <span>Nouveau Devis</span>
                      </button>
                    </div>
                    <QuotesList
                      companyId={selectedCompany.id}
                      onUpdate={() => {
                        loadStats();
                        setQuotesRefreshToken((prev) => prev + 1);
                      }}
                      onViewQuote={setViewQuote}
                      onEditQuote={(quote) => {
                        setEditQuote(quote);
                        setShowQuoteForm(true);
                      }}
                      refreshToken={quotesRefreshToken}
                    />
                  </>
                )}
                {activeTab === "orders" && (
                  <DeliveryOrdersList
                    companyId={selectedCompany.id}
                    onUpdate={loadStats}
                    onViewOrder={setViewOrder}
                  />
                )}
                {activeTab === "invoices" && (
                  <InvoicesList
                    companyId={selectedCompany.id}
                    onUpdate={loadStats}
                    onViewInvoice={setViewInvoice}
                  />
                )}
                {activeTab === "employees" && (
                  <EmployeeManagement companyId={selectedCompany.id} />
                )}
              </div>
            ) : (
              <div className="text-center py-12 animate-fade-in">
                <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900">
                  Aucune entreprise sélectionnée
                </h3>
                <p className="mt-2 text-gray-500">
                  Sélectionnez ou créez une entreprise pour commencer.
                </p>
                <button
                  onClick={() => setActiveTab("settings")}
                  className="mt-6 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                  Créer une entreprise
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modals rendered at root level */}
      {showQuoteForm && selectedCompany && (
        <QuoteForm
          companyId={selectedCompany.id}
          initialData={editQuote}
          onClose={() => {
            setShowQuoteForm(false);
            setEditQuote(null);
          }}
          onSuccess={() => {
            setShowQuoteForm(false);
            setEditQuote(null);
            setQuotesRefreshToken((prev) => prev + 1);
            loadStats();
          }}
        />
      )}
      {viewQuote && (
        <QuoteViewer quote={viewQuote} onClose={() => setViewQuote(null)} />
      )}
      {viewOrder && (
        <DeliveryOrderViewer
          order={viewOrder}
          onClose={() => setViewOrder(null)}
        />
      )}
      {viewInvoice && (
        <InvoiceViewer
          invoice={viewInvoice}
          onClose={() => setViewInvoice(null)}
        />
      )}
    </div>
  );
}
