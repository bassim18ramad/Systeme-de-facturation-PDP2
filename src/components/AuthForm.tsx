import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { LogIn } from "lucide-react";

export function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"employee" | "employer">("employee");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const { signIn, signUp, profileError } = useAuth();

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleForgotPassword() {
    if (!email) {
      setError("Veuillez entrer votre email d'abord.");
      return;
    }
    setForgotLoading(true);
    try {
      const response = await fetch(
        `/auth/v1/recover`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );
      if (response.ok) {
        setSuccessMessage(
          "Email de réinitialisation envoyé ! Vérifiez votre boîte de réception.",
        );
        setShowForgotPassword(false);
        setError(""); // Clear any previous errors
      } else {
        throw new Error("Erreur lors de l'envoi.");
      }
    } catch (err) {
      setError("Impossible d'envoyer l'email.");
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (
            error.message.includes("Invalid login credentials") ||
            error.message.includes("Invalid credentials")
          ) {
            setShowForgotPassword(true); // <--- Show Link
            throw new Error("Email incorrect ou mot de passe erroné.");
          }
          throw error;
        }
      } else {
        if (password.length < 8) {
          throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
        }
        if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
          throw new Error("Le mot de passe doit contenir des lettres et des chiffres.");
        }

        const { data, error } = await signUp(
          email,
          password,
          fullName,
          role,
          role === "employer" ? undefined : "", // Employee starts with no company (pending assignment)
        );
        if (error) {
          if (error.message.includes("User already registered")) {
            throw new Error("Cet email est déjà utilisé");
          }
          throw error;
        }

        // Si l'inscription réussit mais pas de session (email confirm nécessaire)
        if (data?.user && !data.session) {
          setSuccessMessage(
            "Inscription réussie ! Veuillez consulter vos emails pour le lien de validation.",
          );
          setIsLogin(true);
          setEmail("");
          setPassword("");
        }
        // Si data.session existe, l'utilisateur est connecté automatiquement
        // Le useEffect dans AuthContext va mettre à jour l'état et rediger l'utilisateur
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "Cet email est déjà utilisé"
      ) {
        setError(
          "Cet email est déjà lié à un compte. Voulez-vous vous connecter ?",
        );
      } else {
        setError(
          err instanceof Error ? err.message : "Une erreur est survenue",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError("");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 flex items-center justify-center p-4">
      <div className="glass-effect rounded-2xl shadow-2xl p-8 w-full max-w-md border border-white/50 animate-scale-in">
        <div className="flex items-center justify-center mb-8">
          <div className="bg-blue-600 p-3 rounded-xl shadow-lg shadow-blue-200">
            <LogIn className="w-8 h-8 text-white" />
          </div>
        </div>

        <h1
          className="text-3xl font-bold text-center mb-2 text-gray-800 animate-fade-in"
          style={{ animationDelay: "0.1s" }}
        >
          {isLogin ? "Connexion" : "Inscription"}
        </h1>
        <p
          className="text-center text-gray-600 mb-8 animate-fade-in"
          style={{ animationDelay: "0.2s" }}
        >
          Plateforme de gestion de devis
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 animate-slide-up">
            {error}
          </div>
        )}

        {!error && successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 animate-slide-up whitespace-pre-line">
            <span dangerouslySetInnerHTML={{ __html: successMessage }} />
          </div>
        )}

        {!error && !successMessage && profileError && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg mb-4 animate-slide-up">
            {profileError}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4 animate-fade-in"
          style={{ animationDelay: "0.3s" }}
        >
          {!isLogin && (
            <div className="group">
              <label
                htmlFor="fullName"
                className="block text-sm font-medium text-gray-700 mb-1 group-focus-within:text-blue-600 transition-colors"
              >
                Nom complet
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ease-in-out hover:border-gray-400"
              />
            </div>
          )}

          <div className="group">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1 group-focus-within:text-blue-600 transition-colors"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ease-in-out hover:border-gray-400"
            />
          </div>

          <div className="group">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1 group-focus-within:text-blue-600 transition-colors"
              >
                Mot de passe
              </label>
              {showForgotPassword && isLogin && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={forgotLoading}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline mb-1"
                >
                  {forgotLoading ? "Envoi..." : "Mot de passe oublié ?"}
                </button>
              )}
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ease-in-out hover:border-gray-400"
            />
          </div>

          {!isLogin && role === "employee" && (
            <div className="bg-blue-50 p-4 rounded-lg mb-4 text-sm text-blue-800 animate-slide-up border border-blue-100">
              <p>
                <strong>Information importante :</strong> Après votre
                inscription, votre employeur devra vous associer à son
                entreprise en utilisant votre adresse email pour activer votre
                accès.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 transform hover:-translate-y-0.5 active:translate-y-0"
          >
            {loading
              ? "Chargement..."
              : isLogin
                ? "Se connecter"
                : "S'inscrire"}
          </button>
        </form>

        <div
          className="mt-6 text-center animate-fade-in"
          style={{ animationDelay: "0.4s" }}
        >
          <button
            onClick={toggleMode}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium hover:underline transition-all"
          >
            {isLogin
              ? "Pas de compte ? S'inscrire"
              : "Déjà un compte ? Se connecter"}
          </button>
        </div>
      </div>
    </div>
  );
}
