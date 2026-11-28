import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { IoClose } from "react-icons/io5"
import {
    createGoogleEvent,
    deleteGoogleEvent,
    fetchGoogleAuthStatus,
    fetchGoogleCalendarData,
    fetchSchedule,
    type GoogleAuthStatus,
    type GoogleCalendarMeta,
    type ScheduleItem,
    updateGoogleEvent,
} from "../utils/schedule"
import { GoogleEventForm, type GoogleEventFormState } from "./CalendarWidget"
import { isLightClockAppearance, useClockAppearance } from "./Clock"

function weekdayKorean(d: Date) {
    return ["일", "월", "화", "수", "목", "금", "토"][d.getDay()] + "요일"
}

function pad2(n: number) {
    return String(n).padStart(2, "0")
}

function formatKoreanTime(d: Date) {
    return new Intl.DateTimeFormat("ko-KR", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(d)
}

function isSameDay(a: Date, b: Date) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    )
}

function eventTimeText(item: ScheduleItem) {
    const start = new Date(item.start)
    const end = item.end ? new Date(item.end) : undefined

    if (item.allDay) return "하루 종일"
    if (end) return `${formatKoreanTime(start)} - ${formatKoreanTime(end)}`
    return formatKoreanTime(start)
}

function markerColor(idx: number) {
    const colors = ["#6E8BFF", "#FF6B7A", "#7BE0B5", "#FFD166"]
    return colors[idx % colors.length]
}

function markerColorForItem(item: ScheduleItem, idx: number) {
    return item.color ?? markerColor(idx)
}

const SCHEDULE_CACHE_KEY = "dashboard.schedule.cache.v1"
let memoryScheduleCache: ScheduleItem[] | null = null

function loadCachedSchedule(): ScheduleItem[] {
    if (memoryScheduleCache) return memoryScheduleCache
    if (typeof window === "undefined") return []
    try {
        const raw = localStorage.getItem(SCHEDULE_CACHE_KEY)
        if (raw) {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed)) {
                memoryScheduleCache = parsed
                return parsed
            }
        }
    } catch {
        // ignore storage errors
    }
    return []
}

function saveCachedSchedule(items: ScheduleItem[]) {
    memoryScheduleCache = items
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(items))
    } catch {
        // ignore storage errors
    }
}

const GOOGLE_AUTH_CACHE_KEY = "dashboard.gauth.cache.v1"
let memoryGoogleAuthCache: GoogleAuthStatus | null = null

function loadCachedGoogleAuth(): GoogleAuthStatus {
    if (memoryGoogleAuthCache) return memoryGoogleAuthCache
    if (typeof window !== "undefined") {
        try {
            const raw = localStorage.getItem(GOOGLE_AUTH_CACHE_KEY)
            if (raw) {
                const parsed = JSON.parse(raw) as GoogleAuthStatus
                if (typeof parsed?.connected === "boolean") {
                    memoryGoogleAuthCache = parsed
                    return parsed
                }
            }
        } catch {
            // ignore storage errors
        }
    }
    return { connected: false, user: null }
}

function saveCachedGoogleAuth(auth: GoogleAuthStatus) {
    memoryGoogleAuthCache = auth
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(GOOGLE_AUTH_CACHE_KEY, JSON.stringify(auth))
    } catch {
        // ignore storage errors
    }
}

function toDateInputValue(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function toTimeInputValue(d: Date) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function ScheduleWidget() {
    const [now, setNow] = useState(() => new Date())
    const [items, setItems] = useState<ScheduleItem[]>(() => loadCachedSchedule())
    const [, setGoogleAuth] = useState<GoogleAuthStatus>(() => loadCachedGoogleAuth())
    const [calendars, setCalendars] = useState<GoogleCalendarMeta[]>([])
    const [modal, setModal] = useState<GoogleEventFormState | null>(null)
    const [submitting, setSubmitting] = useState(false)

    // OAuth 에러 쿼리 처리
    useEffect(() => {
        if (typeof window === "undefined") return
        const url = new URL(window.location.href)
        const gcalError = url.searchParams.get("gcal_error")
        if (gcalError) {
            console.error(`Google 로그인 오류: ${gcalError}`)
            url.searchParams.delete("gcal_error")
            window.history.replaceState({}, document.title, url.toString())
        }
    }, [])

    // 현재 시각 갱신
    useEffect(() => {
        const t = window.setInterval(() => setNow(new Date()), 60 * 1000)
        return () => window.clearInterval(t)
    }, [])

    const loadAll = useCallback(async () => {
        const [auth, icalItems] = await Promise.all([
            fetchGoogleAuthStatus(),
            fetchSchedule({ limit: 50 }),
        ])
        setGoogleAuth((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(auth)) return prev
            saveCachedGoogleAuth(auth)
            return auth
        })

        let next: ScheduleItem[] = icalItems
        if (auth.connected) {
            const gcal = await fetchGoogleCalendarData()
            setCalendars((prev) =>
                JSON.stringify(prev) === JSON.stringify(gcal.calendars) ? prev : gcal.calendars
            )
            // Google 일정 + 중복되지 않는 iCal 일정 병합
            const seen = new Set(gcal.events.map((e) => `${e.title}|${e.start.slice(0, 10)}`))
            const filteredIcal = icalItems.filter(
                (e) => !seen.has(`${e.title}|${e.start.slice(0, 10)}`)
            )
            next = [...gcal.events, ...filteredIcal].sort(
                (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
            )
        } else {
            setCalendars((prev) => (prev.length === 0 ? prev : []))
        }

        setItems((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(next)) return prev
            saveCachedSchedule(next)
            return next
        })
    }, [])

    // 일정 로드 (캐시 비교 후 변경 시에만 갱신)
    useEffect(() => {
        void loadAll()
        const interval = window.setInterval(() => {
            void loadAll()
        }, 60 * 1000)
        return () => window.clearInterval(interval)
    }, [loadAll])

    const writableCalendars = useMemo(
        () => calendars.filter((c) => c.accessRole === "owner" || c.accessRole === "writer"),
        [calendars]
    )

    const openEditModal = (item: ScheduleItem) => {
        if (item.source !== "google" || !item.id) return
        const start = new Date(item.start)
        const end = item.end ? new Date(item.end) : new Date(start.getTime() + 60 * 60 * 1000)
        setModal({
            mode: "edit",
            eventId: item.id,
            calendarId: item.calendarId || "primary",
            title: item.title === "(제목 없음)" ? "" : item.title,
            startDate: toDateInputValue(start),
            endDate: toDateInputValue(end),
            startTime: toTimeInputValue(start),
            endTime: toTimeInputValue(end),
            allDay: Boolean(item.allDay),
            location: item.location || "",
            description: item.description || "",
            attendees: item.attendees ?? [],
            attendeeInput: "",
            addGoogleMeet: false,
            hangoutLink: item.hangoutLink,
            recurrence: "",
            reminderMinutes: 30,
            editingTime: false,
        })
    }

    const handleSaveModal = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!modal || !modal.title.trim()) {
            return
        }
        const pendingAttendee = modal.attendeeInput.trim()
        const finalAttendees =
            pendingAttendee && pendingAttendee.includes("@")
                ? Array.from(new Set([...modal.attendees, pendingAttendee]))
                : modal.attendees

        setSubmitting(true)
        try {
            const payload = {
                calendarId: modal.calendarId,
                title: modal.title.trim(),
                startDate: modal.startDate,
                endDate: modal.endDate,
                startTime: modal.startTime,
                endTime: modal.endTime,
                allDay: modal.allDay,
                location: modal.location.trim() || undefined,
                description: modal.description.trim() || undefined,
                attendees: finalAttendees.length > 0 ? finalAttendees : undefined,
                addGoogleMeet: modal.addGoogleMeet || undefined,
                recurrence: modal.recurrence || undefined,
                reminderMinutes: modal.reminderMinutes,
            }
            if (modal.mode === "create") {
                await createGoogleEvent(payload)
            } else if (modal.eventId) {
                await updateGoogleEvent({ ...payload, eventId: modal.eventId })
            }
            setModal(null)
            await loadAll()
        } catch (err) {
            console.error(err)
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeleteModal = async () => {
        if (!modal || modal.mode !== "edit" || !modal.eventId) return
        setSubmitting(true)
        try {
            await deleteGoogleEvent(modal.calendarId, modal.eventId)
            setModal(null)
            await loadAll()
        } catch (err) {
            console.error(err)
        } finally {
            setSubmitting(false)
        }
    }

    // 오늘 일정만
    const upcoming = useMemo(() => {
        return items
            .filter((e) => {
                const start = new Date(e.start)
                return Number.isFinite(start.getTime()) && isSameDay(start, now)
            })
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    }, [items, now])

    const day = pad2(now.getDate())
    const weekday = weekdayKorean(now)

    const year = now.getFullYear()
    const month = pad2(now.getMonth() + 1)
    const isLight = isLightClockAppearance(useClockAppearance())

    return (
        <div className="w-full h-full bg-transparent overflow-hidden relative">
            <div className="relative h-full w-full max-w-[1440px] mx-auto px-6 sm:px-14 lg:px-20 py-14 sm:py-16 flex flex-col lg:flex-row gap-8 lg:gap-16">
                {/* 좌측 날짜 헤더 */}
                <div className="lg:w-[32%] shrink-0 flex flex-row lg:flex-col items-baseline lg:items-start justify-between lg:justify-center gap-3">
                    <div>
                        <div
                            className={`text-[clamp(1rem,1.6vw,1.35rem)] font-semibold tracking-tight ${
                                isLight ? "text-zinc-500" : "text-white/45"
                            }`}
                        >
                            {year}. {month}
                        </div>
                        <div className="flex items-baseline gap-3 lg:block">
                            <div
                                className={`text-[clamp(3.25rem,8vw,7rem)] font-black leading-none tracking-tight ${
                                    isLight ? "text-zinc-900" : "text-white"
                                }`}
                            >
                                {day}
                            </div>
                            <div
                                className={`text-[clamp(1.5rem,2.8vw,2.5rem)] font-bold lg:mt-2 ${
                                    isLight ? "text-zinc-800" : "text-white/90"
                                }`}
                            >
                                {weekday}
                            </div>
                        </div>
                    </div>
                    <div
                        className={`inline-flex items-center px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium lg:mt-6 ${
                            isLight
                                ? "bg-black/[0.06] ring-1 ring-black/10 text-zinc-700"
                                : "bg-white/[0.08] ring-1 ring-white/10 text-white/75"
                        }`}
                    >
                        오늘 일정 {upcoming.length}건
                    </div>
                </div>

                {/* 우측 일정 리스트 */}
                <div
                    className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 no-scrollbar touch-pan-y select-none overscroll-x-none flex flex-col justify-center"
                    data-disable-widget-swipe="true"
                    style={{
                        WebkitOverflowScrolling: "touch",
                        touchAction: "pan-y",
                    }}
                >
                    {upcoming.length === 0 ? (
                        <div
                            className={`w-full rounded-3xl py-16 px-8 text-center backdrop-blur-md ${
                                isLight
                                    ? "bg-white/55 ring-1 ring-black/8 shadow-[0_12px_40px_rgba(0,0,0,0.06)]"
                                    : "bg-white/[0.04] ring-1 ring-white/10"
                            }`}
                        >
                            <div
                                className={`text-lg sm:text-2xl font-semibold ${
                                    isLight ? "text-black/55" : "text-white/60"
                                }`}
                            >
                                오늘 예정된 일정이 없어요. 좋은 하루 보내세요!
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3.5 sm:gap-4 my-auto">
                            {upcoming.map((e, idx) => {
                                const editable = e.source === "google" && Boolean(e.id)
                                return (
                                    <div
                                        key={`${e.id ?? e.start}-${idx}`}
                                        onClick={() => editable && openEditModal(e)}
                                        className={`flex items-center justify-between gap-4 sm:gap-6 rounded-2xl sm:rounded-3xl px-5 sm:px-7 py-4 sm:py-5 backdrop-blur-md ${
                                            isLight
                                                ? "bg-white/55 ring-1 ring-black/8 shadow-[0_8px_28px_rgba(0,0,0,0.05)]"
                                                : "bg-white/[0.06] ring-1 ring-white/10"
                                        } ${
                                            editable
                                                ? isLight
                                                    ? "cursor-pointer hover:bg-white/75 transition"
                                                    : "cursor-pointer hover:bg-white/[0.1] transition"
                                                : ""
                                        }`}
                                    >
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div
                                                className="w-1.5 sm:w-2 h-9 sm:h-11 rounded-full shrink-0"
                                                style={{
                                                    backgroundColor: markerColorForItem(e, idx),
                                                }}
                                            />
                                            <div className="min-w-0">
                                                <div
                                                    className={`text-[clamp(1.1rem,2vw,1.75rem)] font-bold leading-snug truncate ${
                                                        isLight ? "text-zinc-900" : "text-white"
                                                    }`}
                                                >
                                                    {e.title}
                                                </div>
                                                {e.location ? (
                                                    <div
                                                        className={`text-xs sm:text-sm truncate mt-0.5 ${
                                                            isLight
                                                                ? "text-zinc-400"
                                                                : "text-white/45"
                                                        }`}
                                                    >
                                                        {e.location}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div
                                            className={`text-[clamp(0.85rem,1.2vw,1.1rem)] font-semibold whitespace-nowrap ${
                                                isLight ? "text-zinc-500" : "text-white/55"
                                            }`}
                                        >
                                            {eventTimeText(e)}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {modal ? (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            onClick={() => !submitting && setModal(null)}
                            data-disable-widget-swipe="true"
                            className={`absolute inset-0 z-30 backdrop-blur-[2px] ${
                                isLight ? "bg-black/15" : "bg-black/25"
                            }`}
                        />
                        <motion.aside
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                            data-disable-widget-swipe="true"
                            className={`absolute top-0 right-0 bottom-0 z-40 w-[340px] max-w-[90%] shadow-2xl flex flex-col p-5 backdrop-blur-2xl ${
                                isLight
                                    ? "bg-white/55 border-l border-black/10 text-zinc-900"
                                    : "bg-black/30 border-l border-white/15 text-white"
                            }`}
                        >
                            <div
                                className={`flex items-center justify-between pb-3 border-b shrink-0 ${
                                    isLight ? "border-black/10" : "border-white/10"
                                }`}
                            >
                                <div>
                                    <div className="text-sm font-bold">
                                        {modal.mode === "create" ? "새 일정" : "일정 수정"}
                                    </div>
                                    <div
                                        className={`text-xs ${
                                            isLight ? "text-zinc-500" : "text-white/45"
                                        }`}
                                    >
                                        {modal.startDate}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => !submitting && setModal(null)}
                                    className={`p-1.5 rounded-lg cursor-pointer ${
                                        isLight
                                            ? "hover:bg-black/5 text-zinc-500"
                                            : "hover:bg-white/10 text-white/60"
                                    }`}
                                >
                                    <IoClose className="w-4 h-4" />
                                </button>
                            </div>

                            <GoogleEventForm
                                form={modal}
                                setForm={setModal}
                                calendars={calendars}
                                writableCalendars={writableCalendars}
                                submitting={submitting}
                                onSubmit={handleSaveModal}
                                onDelete={handleDeleteModal}
                                isLight={isLight}
                            />
                        </motion.aside>
                    </>
                ) : null}
            </AnimatePresence>
        </div>
    )
}
