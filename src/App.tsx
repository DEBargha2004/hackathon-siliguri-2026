import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";
import { PwaReloadPrompt } from "@/components/pwa-reload-prompt";
import { HazardAnalyzerPanel } from "@/components/intelligence/hazard-analyzer-panel";
import { Mountain } from "lucide-react";

function App() {
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

            <div className="flex items-center gap-3">
              <ModeToggle />
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="mx-auto max-w-6xl p-4 sm:p-6 pb-16">
          <HazardAnalyzerPanel />
        </main>

        {/* PWA Update Banner */}
        <PwaReloadPrompt />
      </div>
    </ThemeProvider>
  );
}

export default App;
