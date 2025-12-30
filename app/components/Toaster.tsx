import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { ReactNode } from "react"

export type ToastKind = "info" | "success" | "error"

interface Toast {
    id: number
    message: string
    kind: ToastKind
    duration: number
}

interface ToasterContextValue {
    pushToast: (message: string, opts?: { kind?: ToastKind; durationMs?: number }) => void
}

const ToasterContext = createContext<ToasterContextValue | null>(null)

export function useToaster(): ToasterContextValue {
    const ctx = useContext(ToasterContext)
    if (!ctx) {
        throw new Error("useToaster must be used within ToasterProvider")
    }
    return ctx
}

export function ToasterProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
    }, [])

    const pushToast = useCallback(
        (message: string, opts?: { kind?: ToastKind; durationMs?: number }) => {
            const duration = Math.max(1200, Math.min(10000, opts?.durationMs ?? 10000))
            const kind = opts?.kind ?? "info"
            const id = Date.now() + Math.random()

            setToasts((prev) => [...prev, { id, message, kind, duration }])

            window.setTimeout(() => {
                removeToast(id)
            }, duration)
        },
        [removeToast]
    )

    const value = useMemo<ToasterContextValue>(() => ({ pushToast }), [pushToast])

    const palette: Record<ToastKind, { bg: string; border: string; text: string }> = {
        info: {
            bg: "bg-slate-500",
            border: "border-slate-500",
            text: "text-slate-50",
        },
        success: {
            bg: "bg-emerald-500",
            border: "border-emerald-500",
            text: "text-emerald-50",
        },
        error: {
            bg: "bg-rose-500    ",
            border: "border-rose-500",
            text: "text-rose-50",
        },
    }

    return (
        <ToasterContext.Provider value={value}>
            {children}

            <div className="fixed right-6 bottom-6 z-50 flex flex-col items-end gap-3">
                <AnimatePresence initial={false}>
                    {toasts.map((t) => {
                        const colors = palette[t.kind]
                        return (
                            <motion.div
                                key={t.id}
                                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                                transition={{ duration: 0.18, ease: "easeOut" }}
                                className={
                                    "pointer-events-auto relative w-full max-w-[320px] rounded-xl border px-4 py-3 shadow-xl backdrop-blur break-words " +
                                    colors.bg +
                                    " " +
                                    colors.border +
                                    " " +
                                    colors.text
                                }
                            >
                                <button
                                    aria-label="Close toast"
                                    className="absolute right-2 top-2 h-6 w-6 rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition"
                                    onClick={() => removeToast(t.id)}
                                >
                                    ×
                                </button>

                                <div className="text-sm font-semibold leading-tight pr-6 break-words">
                                    {t.message}
                                </div>
                            </motion.div>
                        )
                    })}
                </AnimatePresence>
            </div>
        </ToasterContext.Provider>
    )
}
