import * as React from "react"
import { useRegisterSW } from "virtual:pwa-register/react"
import { Download, RefreshCw, Wifi, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function PwaReloadPrompt() {
  const [installPrompt, setInstallPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = React.useState(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(display-mode: standalone)").matches
    }
    return false
  })

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      console.log("PWA Service Worker registered:", registration)
    },
    onRegisterError(error) {
      console.error("PWA Service Worker registration error:", error)
    },
  })

  React.useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setInstallPrompt(null)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall)
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === "accepted") {
      setInstallPrompt(null)
    }
  }

  const closeOfflineReady = () => setOfflineReady(false)
  const closeNeedRefresh = () => setNeedRefresh(false)

  return (
    <>
      {/* Offline Ready Notification */}
      {offlineReady && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-lg text-card-foreground">
          <Wifi className="text-primary" />
          <div className="flex flex-col">
            <span className="text-xs font-semibold">Offline Ready</span>
            <span className="text-[11px] text-muted-foreground">
              App content is cached for offline use.
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={closeOfflineReady}
            aria-label="Dismiss offline ready notice"
          >
            <X />
          </Button>
        </div>
      )}

      {/* New Version Reload Notification */}
      {needRefresh && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-primary/30 bg-card p-3 shadow-xl text-card-foreground animate-in fade-in slide-in-from-bottom-3">
          <RefreshCw className="text-primary animate-spin" />
          <div className="flex flex-col">
            <span className="text-xs font-semibold">Update Available</span>
            <span className="text-[11px] text-muted-foreground">
              New version ready to load.
            </span>
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            <Button
              size="xs"
              variant="default"
              onClick={() => updateServiceWorker(true)}
            >
              Reload
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={closeNeedRefresh}
              aria-label="Dismiss update notice"
            >
              <X />
            </Button>
          </div>
        </div>
      )}

      {/* Install App Prompt (when installable and not yet installed) */}
      {installPrompt && !isInstalled && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2.5 rounded-xl border border-border bg-card/90 backdrop-blur-md px-3 py-2 shadow-md">
          <Button
            variant="outline"
            size="sm"
            onClick={handleInstall}
            className="text-xs"
          >
            <Download data-icon="inline-start" />
            Install App
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setInstallPrompt(null)}
            aria-label="Dismiss install prompt"
          >
            <X />
          </Button>
        </div>
      )}
    </>
  )
}
