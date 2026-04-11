import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Training from "./pages/Training";
import Playground from "./pages/Playground";
import Chat from "./pages/Chat";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen hero-gradient">
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/training" element={<Training />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
