import { useState, useEffect } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";
import { PwaReloadPrompt } from "@/components/pwa-reload-prompt";
import { HazardAnalyzerPanel } from "@/components/intelligence/hazard-analyzer-panel";
import { AlertRelayPanel } from "@/components/relay/alert-relay-panel";
import { listOfficialAlerts } from "@/lib/relay/alert-store";
import { Mountain, Radio } from "lucide-react";

function App() {
  const [activeTab, setActiveTab] = useState<"analyzer" | "relay">("analyzer");
  const [alertCount, setAlertCount] = useState<number>(0);

  useEffect(() => {
    const updateCount = async () => {
      try {
        const list = await listOfficialAlerts();
        setAlertCount(list.length);
      } catch {
        // ignore
      }
    };
    updateCount();
    const interval = setInterval(updateCount, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
        {/* Navigation / Header */}
        <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                <Mountain className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-tight">DHR Hazard Reporter</span>
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  Offline-First Slope Intelligence • Siliguri & Darjeeling Corridor
                </span>
              </div>
            </div>

            {/* Centered Navigation Switcher */}
            <div className="flex items-center rounded-xl bg-muted p-1 border border-border/60">
              <button
                onClick={() => setActiveTab("analyzer")}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "analyzer"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Mountain className="h-3.5 w-3.5 text-emerald-600" />
                <span className="hidden sm:inline">Hazard Analyzer</span>
                <span className="sm:hidden">Analyzer</span>
              </button>

              <button
                onClick={() => setActiveTab("relay")}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "relay"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Radio className="h-3.5 w-3.5 text-blue-600" />
                <span>Corridor Relay</span>
                {alertCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-blue-600 text-[10px] font-bold text-white px-1.5 py-0.2">
                    {alertCount}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <ModeToggle />
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="mx-auto max-w-6xl p-4 sm:p-6 pb-16">
          {activeTab === "analyzer" ? (
            <HazardAnalyzerPanel />
          ) : (
            <AlertRelayPanel onNavigateToAnalyzer={() => setActiveTab("analyzer")} />
          )}
        </main>

        {/* PWA Update Banner */}
        <PwaReloadPrompt />
      </div>
    </ThemeProvider>
  );
}

export default App;

