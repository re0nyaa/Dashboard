import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
} from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { ReactNode } from "react"
import {
    IoAlertCircleOutline,
    IoCheckmarkCircleOutline,
    IoClose,
} from "react-icons/io5"

export type ToastKind = "info" | "success" | "error" | "warning"

export interface ToastItemData {
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

const TOAST_STYLE: Record<
    ToastKind,
    {
        container: string
        closeBtn: string
        Icon?: typeof IoCheckmarkCircleOutline
    }
> = {
    info: {
        container: "bg-[#111214] border border-white/12 text-white",
        closeBtn: "text-white/50 hover:text-white hover:bg-white/10",
    },
    success: {
        container: "bg-[#16a34a] border border-transparent text-white",
        closeBtn: "text-white/75 hover:text-white hover:bg-black/15",
        Icon: IoCheckmarkCircleOutline,
    },
    error: {
        container: "bg-[#dc2626] border border-transparent text-white",
        closeBtn: "text-white/75 hover:text-white hover:bg-black/15",
        Icon: IoAlertCircleOutline,
    },
    warning: {
        container: "bg-[#f97316] border border-transparent text-black",
        closeBtn: "text-black/60 hover:text-black hover:bg-black/10",
        Icon: IoAlertCircleOutline,
    },
}

export function ToastBar({
    toast,
    onClose,
}: {
    toast: ToastItemData
    onClose: (id: number) => void
}) {
    const { container, closeBtn, Icon } = TOAST_STYLE[toast.kind]

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: 48, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 48, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.8 }}
            className={`pointer-events-auto flex items-center gap-2.5 w-[340px] max-w-[calc(100vw-3rem)] min-h-[46px] rounded-lg px-4 py-3 shadow-xl ${container}`}
        >
            {Icon ? <Icon className="w-5 h-5 shrink-0" /> : null}
            <div className="flex-1 min-w-0 min-h-5 flex items-center text-sm font-semibold leading-snug break-words">
                {toast.message}
            </div>
            <button
                type="button"
                aria-label="Close toast"
                onClick={() => onClose(toast.id)}
                className={`w-6 h-6 shrink-0 rounded flex items-center justify-center transition cursor-pointer ${closeBtn}`}
            >
                <IoClose className="w-4 h-4" />
            </button>
        </motion.div>
    )
}

export function ToasterProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItemData[]>([])
    const timersRef = useRef<Map<number, number>>(new Map())

    const removeToast = useCallback((id: number) => {
        const timer = timersRef.current.get(id)
        if (timer != null) {
            window.clearTimeout(timer)
            timersRef.current.delete(id)
        }
        setToasts((prev) => prev.filter((t) => t.id !== id))
    }, [])

    const pushToast = useCallback(
        (message: string, opts?: { kind?: ToastKind; durationMs?: number }) => {
            const duration = Math.max(1200, Math.min(10000, opts?.durationMs ?? 4000))
            const kind = opts?.kind ?? "info"
            const id = Date.now() + Math.random()

            setToasts((prev) => [...prev, { id, message, kind, duration }])

            const timer = window.setTimeout(() => {
                removeToast(id)
            }, duration)
            timersRef.current.set(id, timer)
        },
        [removeToast]
    )

    const value = useMemo<ToasterContextValue>(() => ({ pushToast }), [pushToast])

    return (
        <ToasterContext.Provider value={value}>
            {children}

            <div className="fixed right-6 bottom-6 z-50 flex flex-col items-end gap-2.5 pointer-events-none">
                <AnimatePresence mode="popLayout">
                    {toasts.map((t) => (
                        <ToastBar key={t.id} toast={t} onClose={removeToast} />
                    ))}
                </AnimatePresence>
            </div>
        </ToasterContext.Provider>
    )
}
