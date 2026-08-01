import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase, Company } from "../lib/supabase";
import { LogOut, FileText, Truck, Receipt, Plus } from "lucide-react";
import { QuoteForm } from "./QuoteForm";
import { QuotesList, QuoteWithItems } from "./QuotesList";
import { DeliveryOrdersList, OrderWithDetails } from "./DeliveryOrdersList";
import { InvoicesList, InvoiceWithDetails } from "./InvoicesList";
import { QuoteViewer } from "./QuoteViewer";
import { DeliveryOrderViewer } from "./DeliveryOrderViewer";
import { InvoiceViewer } from "./InvoiceViewer";

// L'employé a les mêmes droits que l'employeur sur les devis, commandes et
// factures. La gestion des employés et de l'entreprise lui reste interdite et
// n'apparaît nulle part dans son interface.
type TabType = "quotes" | "orders" | "invoices";

export function EmployeeDashboard() {
  const { signOut, profile } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("quotes");

  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [editQuote, setEditQuote] = useState<QuoteWithItems | null>(null);
  const [viewQuote, setViewQuote] = useState<QuoteWithItems | null>(null);
  const [viewOrder, setViewOrder] = useState<OrderWithDetails | null>(null);
  const [viewInvoice, setViewInvoice] = useState<InvoiceWithDetails | null>(
    null,
  );
  const [quotesRefreshToken, setQuotesRefreshToken] = useState(0);
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
    loadCompany();
  }, [profile]);

  useEffect(() => {
    if (company) {
      loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, activeTab]);

  async function loadCompany() {
    if (!profile?.company_id) return;

    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", profile.company_id)
      .maybeSingle();

    if (!error && data) {
      setCompany(data);
    }
  }

  async function loadStats() {
    if (!company) return;

    const [quotesRes, ordersRes, invoicesRes] = await Promise.all([
      supabase.from("quotes").select("*").eq("company_id", company.id),
      supabase.from("delivery_orders").select("*").eq("company_id", company.id),
      supabase.from("invoices").select("*").eq("company_id", company.id),
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col">
      <header className="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <FileText className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {company?.name || "Tableau de bord Employé"}
                </h1>
                <p className="text-sm text-gray-500">Espace employé</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  {profile?.full_name}
                </p>
                <p className="text-xs text-gray-500">Employé</p>
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
        {!company ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center animate-scale-in">
            <div className="bg-gray-50 h-24 w-24 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileText className="w-10 h-10 text-gray-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Aucune entreprise assignée
            </h2>
            <p className="text-gray-600 max-w-sm mx-auto">
              Contactez votre employeur pour être assigné à une entreprise et
              commencer à créer des devis.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
                    <p className="text-sm font-medium text-gray-500">
                      Factures
                    </p>
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
                </div>
              </div>
            </div>

            <div
              className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-slide-up"
              style={{ animationDelay: "0.3s" }}
            >
              <div className="border-b border-gray-200 overflow-x-auto">
                <nav className="flex space-x-1 p-1" aria-label="Tabs">
                  {[
                    { id: "quotes", label: "Devis", icon: FileText },
                    { id: "orders", label: "Commandes", icon: Truck },
                    { id: "invoices", label: "Factures", icon: Receipt },
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
                              : "text-gray-400"
                          }`}
                        />
                        {tab.label}
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="p-6 min-h-[400px]">
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
                        companyId={company.id}
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
                      companyId={company.id}
                      onUpdate={loadStats}
                      onViewOrder={setViewOrder}
                    />
                  )}
                  {activeTab === "invoices" && (
                    <InvoicesList
                      companyId={company.id}
                      onUpdate={loadStats}
                      onViewInvoice={setViewInvoice}
                    />
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {showQuoteForm && company && (
        <QuoteForm
          companyId={company.id}
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
