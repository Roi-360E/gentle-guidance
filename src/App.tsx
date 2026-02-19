import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProcessingProvider } from "@/hooks/useProcessing";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import SubtitleEditor from "./pages/SubtitleEditor";
import Plans from "./pages/Plans";
import Downloads from "./pages/Downloads";
import NotFound from "./pages/NotFound";
import Sales from "./pages/Sales";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ProcessingProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/vendas" element={<Sales />} />
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/subtitles" element={<ProtectedRoute><SubtitleEditor /></ProtectedRoute>} />
              <Route path="/plans" element={<ProtectedRoute><Plans /></ProtectedRoute>} />
              <Route path="/downloads" element={<ProtectedRoute><Downloads /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ProcessingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
