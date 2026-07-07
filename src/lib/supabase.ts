import { createClient } from "./supabase-custom";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "http://localhost:3000";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "mock-key";

if (!supabaseUrl || !supabaseAnonKey) {
  // throw new Error("Missing Supabase environment variables");
  // Relaxed check for local server
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  role: "employee" | "employer";
  company_id: string | null;
  status: "active" | "pending";
  created_at: string;
};

export type Company = {
  id: string;
  name: string;
  logo_url: string | null;
  signature_url: string | null;
  employer_id: string;
  created_at: string;
  email: string | null;
  phone: string | null;
  wallets: { type: string; address: string }[] | null;
};

export type Quote = {
  id: string;
  quote_number: string;
  company_id: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  client_address: string | null;
  status: "draft" | "sent" | "ordered" | "cancelled";
  total_amount: number;
  include_tva?: boolean;
  stamp_duty?: number;
  include_signature?: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type QuoteItem = {
  id: string;
  quote_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  square_meters?: number | null;
  width?: number | null;
  length?: number | null;
  total_price: number;
  created_at: string;
};

export type DeliveryOrder = {
  id: string;
  order_number: string;
  quote_id: string;
  company_id: string;
  status: "pending" | "delivered" | "cancelled";
  delivery_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  delivery_order_id: string;
  company_id: string;
  status: "unpaid" | "paid" | "cancelled";
  payment_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type DownloadLog = {
  id: string;
  document_type: "quote" | "delivery_order" | "invoice";
  document_id: string;
  downloaded_by: string;
  downloaded_at: string;
};
