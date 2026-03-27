import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function VerifyEmail() {
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    const verify = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      if (!token) {
        setStatus("error");
        setMessage("Token de vérification manquant.");
        return;
      }

      try {
        // We'll use the supabase client to call our custom backend endpoint if integrated
        // But our supabase client is likely pointing to the Mock Server
        // So we can assume supabase.auth.api (if generic) or just fetch directly.
        // Since we modified server/routes/auth.js, we have /auth/v1/verify

        // Use a relative path to ensure it hits the Vercel rewrite correctly
        const response = await fetch(
          `/auth/v1/verify?token=${token}`,
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Échec de la vérification");
        }

        // Auto-login if session is returned
        if (data.session) {
          console.log("Session validée, connexion auto...");
          await supabase.auth.setSession(data.session);
          // Wait briefly for storage to persist
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        setStatus("success");

        // Auto redirect after delay
        setTimeout(() => {
          window.location.href = "/";
        }, 1500);
      } catch (err: any) {
        setStatus("error");
        setMessage(err.message);
      }
    };

    verify();
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">
            Vérification de l'email en cours...
          </p>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center animate-scale-in">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Email Vérifié !
          </h2>
          <p className="text-gray-600 mb-6">
            Votre adresse email a été confirmée avec succès. Vous allez être
            redirigé vers votre espace...
          </p>
          <button
            onClick={() => (window.location.href = "/")}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors"
          >
            Aller à mon espace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center animate-scale-in">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
          <svg
            className="h-8 w-8 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          Échec de la vérification
        </h2>
        <p className="text-red-600 mb-6">{message}</p>
        <button
          onClick={() => (window.location.href = "/")}
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          Retour à l'accueil
        </button>
      </div>
    </div>
  );
}
