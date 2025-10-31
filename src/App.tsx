import { BrowserRouter, Routes, Route } from "react-router-dom";
import { config } from "./utils/config";
import { cookieToInitialState } from "wagmi";
import { Providers } from "./Provider";
import { TransactionForm } from "./components/NPYTransactionForm";
import { Toaster } from "./components/ui/toaster";
import { Toaster as Sonner } from "sonner";

const App = () => {
  const cookieHeader = typeof document !== "undefined" ? document.cookie : "";
  const initialState = cookieToInitialState(config, cookieHeader);

  return (
    <Providers initialState={initialState}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TransactionForm />} />
        </Routes>
      </BrowserRouter>
    </Providers>
  );
};

export default App;
