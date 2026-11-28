import { useCallback, useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { SafetyAlertApiItem } from "../routes/api.safety-alert"
import { getLocationPreference } from "../utils/weather"

export type SafetyAlertPayload = {
    id?: string
    level?: "긴급재난문자" | "안전안내문자" | "위급재난문자"
    sender?: string
    message: string
    receivedAt?: string
}

const LAST_SEEN_KEY = "dashboard.safetyAlert.lastSeenId.v1"
const SAFETY_ALERT_ENABLED_KEY = "dashboard.safetyAlert.enabled.v1"
const RECENT_WINDOW_MS = 30 * 60 * 1000

export function getSafetyAlertEnabled(): boolean {
    if (typeof window === "undefined") return true
    try {
        const raw = localStorage.getItem(SAFETY_ALERT_ENABLED_KEY)
        return raw === null ? true : raw === "true"
    } catch {
        return true
    }
}

export function setSafetyAlertEnabled(enabled: boolean): void {
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(SAFETY_ALERT_ENABLED_KEY, String(enabled))
        window.dispatchEvent(new Event("dashboard:safety-alert-setting"))
    } catch {
        // ignore
    }
}

const DEFAULT_TEST_ALERT: SafetyAlertPayload = {
    level: "긴급재난문자",
    sender: "행정안전부",
    message:
        "[테스트] 금일 기상특보(호우경보)가 발효되었습니다. 하천변, 지하차도 등 위험지역 접근을 자제하고 안전에 유의하시기 바랍니다.",
}

export async function triggerSafetyAlert(payload?: Partial<SafetyAlertPayload>) {
    if (typeof window === "undefined") return
    if (!payload?.message) {
        try {
            const pref = getLocationPreference()
            const url = new URL("/api/safety-alert", window.location.origin)
            url.searchParams.set("latest", "1")
            if (pref.mode === "manual" && pref.name) {
                url.searchParams.set("region", pref.name)
            }
            const res = await fetch(url.toString(), { cache: "no-store" })
            if (res.ok) {
                const data = (await res.json()) as { alerts?: SafetyAlertApiItem[] }
                const latest = data.alerts?.[0]
                if (latest) {
                    window.dispatchEvent(
                        new CustomEvent("dashboard:safety-alert", {
                            detail: {
                                level: latest.level,
                                sender: latest.sender,
                                message: latest.message,
                                receivedAt: latest.receivedAt,
                            },
                        })
                    )
                    return
                }
            }
        } catch {
            // fallback to default test alert
        }
    }
    window.dispatchEvent(
        new CustomEvent("dashboard:safety-alert", {
            detail: {
                ...DEFAULT_TEST_ALERT,
                ...payload,
                receivedAt:
                    payload?.receivedAt ??
                    new Intl.DateTimeFormat("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                    }).format(new Date()),
            },
        })
    )
}

export function SafetyAlertOverlay() {
    const [alert, setAlert] = useState<SafetyAlertPayload | null>(null)
    const [enabled, setEnabled] = useState<boolean>(() => getSafetyAlertEnabled())

    useEffect(() => {
        const onSettingChange = () => setEnabled(getSafetyAlertEnabled())
        window.addEventListener("dashboard:safety-alert-setting", onSettingChange)
        return () => window.removeEventListener("dashboard:safety-alert-setting", onSettingChange)
    }, [])

    const dismiss = useCallback(() => {
        if (alert?.id) {
            try {
                localStorage.setItem(LAST_SEEN_KEY, alert.id)
            } catch {
                // ignore
            }
        }
        setAlert(null)
    }, [alert?.id])

    useEffect(() => {
        if (!enabled) return
        const pollSafetyAlerts = async () => {
            try {
                const pref = getLocationPreference()
                const url = new URL("/api/safety-alert", window.location.origin)
                if (pref.mode === "manual" && pref.name) {
                    url.searchParams.set("region", pref.name)
                }
                const res = await fetch(url.toString(), { cache: "no-store" })
                if (!res.ok) return
                const data = (await res.json()) as { alerts?: SafetyAlertApiItem[] }
                const latest = data.alerts?.[0]
                if (!latest) return

                const lastSeen = localStorage.getItem(LAST_SEEN_KEY)
                if (lastSeen === latest.id) return

                // 최근 30분 이내 발송된 신규 문자만 표시
                if (latest.timestamp > 0 && Date.now() - latest.timestamp > RECENT_WINDOW_MS) {
                    return
                }

                setAlert({
                    id: latest.id,
                    level: latest.level,
                    sender: latest.sender,
                    message: latest.message,
                    receivedAt: latest.receivedAt,
                })
            } catch {
                // ignore polling errors
            }
        }

        void pollSafetyAlerts()
        const timer = window.setInterval(() => void pollSafetyAlerts(), 60 * 1000)
        return () => window.clearInterval(timer)
    }, [enabled])

    useEffect(() => {
        const onAlert = (e: Event) => {
            const detail = (e as CustomEvent<SafetyAlertPayload>).detail
            if (!detail?.message) {
                setAlert({
                    ...DEFAULT_TEST_ALERT,
                    receivedAt: new Intl.DateTimeFormat("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                    }).format(new Date()),
                })
                return
            }
            setAlert(detail)
        }
        window.addEventListener("dashboard:safety-alert", onAlert)
        return () => window.removeEventListener("dashboard:safety-alert", onAlert)
    }, [])

    useEffect(() => {
        if (!alert) return
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") dismiss()
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [alert, dismiss])

    return (
        <AnimatePresence>
            {alert ? (
                <motion.div
                    role="alertdialog"
                    aria-modal="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    onClick={dismiss}
                    className="fixed inset-0 z-50 bg-gradient-to-br from-[#2b0b0e] via-[#160709] to-[#0a0506] flex flex-col justify-between px-8 sm:px-16 lg:px-24 py-14 sm:py-20 text-white select-none cursor-pointer"
                >
                    <div className="flex items-center gap-3 text-sm sm:text-base font-semibold tracking-tight">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                        <span className="text-red-400">{alert.level || "긴급재난문자"}</span>
                        {alert.sender ? (
                            <span className="text-white/45">· {alert.sender}</span>
                        ) : null}
                        {alert.receivedAt ? (
                            <span className="text-white/45 tabular-nums">· {alert.receivedAt}</span>
                        ) : null}
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="max-w-5xl text-[clamp(1.65rem,3.6vw,3.25rem)] font-bold leading-[1.35] tracking-tight text-white/95 break-keep"
                    >
                        {alert.message}
                    </motion.div>

                    <div className="text-xs sm:text-sm font-medium text-white/35">
                        화면을 터치하면 닫혀요
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    )
}
