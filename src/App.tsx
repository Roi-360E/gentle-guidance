import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProcessingProvider } from "@/hooks/useProcessing";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { FacebookPixelProvider } from "@/components/FacebookPixelProvider";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import PlansPage from "./pages/PlansPage";
import SignupPage from "./pages/SignupPage";
import SubtitleEditor from "./pages/SubtitleEditor";
import Plans from "./pages/Plans";
import Downloads from "./pages/Downloads";
import NotFound from "./pages/NotFound";
import Sales from "./pages/Sales";
import AutoSubtitles from "./pages/AutoSubtitles";
import InstagramCallback from "./pages/InstagramCallback";
import ViralFlux from "./pages/ViralFlux";
import ResetPassword from "./pages/ResetPassword";
import ForgotPassword from "./pages/ForgotPassword";
import AdminPlans from "./pages/AdminPlans";
import VoiceRewrite from "./pages/VoiceRewrite";
import ThankYou from "./pages/ThankYou";
import ShortsReels from "./pages/ShortsReels";
import Onboarding from "./pages/Onboarding";

// Checkout is now integrated into SignupPage at /cadastro/:plano
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PWAInstallPrompt />
      <FacebookPixelProvider />
      <BrowserRouter>
        <AuthProvider>
          <ProcessingProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/planos" element={<PlansPage />} />
              <Route path="/cadastro/:plano" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/auth/instagram/callback" element={<InstagramCallback />} />
              <Route path="/vendas" element={<Sales />} />
              <Route path="/viral-flux" element={<ViralFlux />} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/subtitles" element={<ProtectedRoute><SubtitleEditor /></ProtectedRoute>} />
              <Route path="/plans" element={<ProtectedRoute><Plans /></ProtectedRoute>} />
              <Route path="/checkout" element={<Navigate to="/planos" replace />} />
              <Route path="/admin/plans" element={<ProtectedRoute><AdminPlans /></ProtectedRoute>} />
              <Route path="/downloads" element={<ProtectedRoute><Downloads /></ProtectedRoute>} />
              <Route path="/auto-subtitles" element={<ProtectedRoute><AutoSubtitles /></ProtectedRoute>} />
              <Route path="/voice-rewrite" element={<ProtectedRoute><VoiceRewrite /></ProtectedRoute>} />
              <Route path="/shorts-reels" element={<ProtectedRoute><ShortsReels /></ProtectedRoute>} />
              <Route path="/obrigado" element={<ThankYou />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ProcessingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
