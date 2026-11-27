import { useCallback, useEffect, useMemo, useState } from "react"
import { FaGoogle } from "react-icons/fa6"
import { IoAdd, IoClose, IoLogOutOutline, IoTrashOutline } from "react-icons/io5"
import {
    createGoogleEvent,
    deleteGoogleEvent,
    fetchGoogleAuthStatus,
    fetchGoogleCalendarData,
    fetchSchedule,
    logoutGoogle,
    type GoogleAuthStatus,
    type GoogleCalendarMeta,
    type ScheduleItem,
    updateGoogleEvent,
} from "../utils/schedule"
import { CustomSelect } from "./CalendarWidget"

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

type EventFormState = {
    mode: "create" | "edit"
    eventId?: string
    calendarId: string
    title: string
    startDate: string
    endDate: string
    startTime: string
    endTime: string
    allDay: boolean
    location: string
    description: string
}

export function ScheduleWidget() {
    const [now, setNow] = useState(() => new Date())
    const [items, setItems] = useState<ScheduleItem[]>(() => loadCachedSchedule())
    const [googleAuth, setGoogleAuth] = useState<GoogleAuthStatus>(() => loadCachedGoogleAuth())
    const [calendars, setCalendars] = useState<GoogleCalendarMeta[]>([])
    const [modal, setModal] = useState<EventFormState | null>(null)
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

    const handleGoogleLogout = async () => {
        await logoutGoogle()
        const emptyAuth: GoogleAuthStatus = { connected: false, user: null }
        saveCachedGoogleAuth(emptyAuth)
        setGoogleAuth(emptyAuth)
        setCalendars([])
        void loadAll()
    }

    const writableCalendars = useMemo(
        () => calendars.filter((c) => c.accessRole === "owner" || c.accessRole === "writer"),
        [calendars]
    )

    const openCreateModal = () => {
        const defaultCal =
            writableCalendars.find((c) => c.primary)?.id ?? writableCalendars[0]?.id ?? "primary"
        const todayStr = toDateInputValue(now)
        setModal({
            mode: "create",
            calendarId: defaultCal,
            title: "",
            startDate: todayStr,
            endDate: todayStr,
            startTime: "09:00",
            endTime: "10:00",
            allDay: false,
            location: "",
            description: "",
        })
    }

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
        })
    }

    const handleSaveModal = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!modal || !modal.title.trim()) {
            return
        }
        setSubmitting(true)
        try {
            if (modal.mode === "create") {
                await createGoogleEvent({
                    calendarId: modal.calendarId,
                    title: modal.title.trim(),
                    startDate: modal.startDate,
                    endDate: modal.endDate,
                    startTime: modal.startTime,
                    endTime: modal.endTime,
                    allDay: modal.allDay,
                    location: modal.location.trim() || undefined,
                    description: modal.description.trim() || undefined,
                })
            } else if (modal.eventId) {
                await updateGoogleEvent({
                    calendarId: modal.calendarId,
                    eventId: modal.eventId,
                    title: modal.title.trim(),
                    startDate: modal.startDate,
                    endDate: modal.endDate,
                    startTime: modal.startTime,
                    endTime: modal.endTime,
                    allDay: modal.allDay,
                    location: modal.location.trim() || undefined,
                    description: modal.description.trim() || undefined,
                })
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

    return (
        <div className="w-full h-full bg-gradient-to-br from-[#232834] via-[#1c202b] to-[#141720] overflow-hidden relative">
            <div className="relative h-full w-full max-w-[1440px] mx-auto px-6 sm:px-14 lg:px-20 py-14 sm:py-16 flex flex-col lg:flex-row gap-8 lg:gap-16">
                {/* 좌측 날짜 헤더 */}
                <div className="lg:w-[32%] shrink-0 flex flex-row lg:flex-col items-baseline lg:items-start justify-between lg:justify-center gap-3">
                    <div>
                        <div className="text-white/45 text-[clamp(1rem,1.6vw,1.35rem)] font-semibold tracking-tight">
                            {year}. {month}
                        </div>
                        <div className="flex items-baseline gap-3 lg:block">
                            <div className="text-white text-[clamp(3.25rem,8vw,7rem)] font-black leading-none tracking-tight">
                                {day}
                            </div>
                            <div className="text-white/90 text-[clamp(1.5rem,2.8vw,2.5rem)] font-bold lg:mt-2">
                                {weekday}
                            </div>
                        </div>
                    </div>
                    <div className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-white/[0.08] ring-1 ring-white/10 text-xs sm:text-sm font-medium text-white/75 lg:mt-6">
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
                        <div className="w-full rounded-3xl bg-white/[0.04] ring-1 ring-white/10 py-16 px-8 text-center">
                            <div className="text-white/60 text-lg sm:text-2xl font-semibold">
                                오늘 예정된 일정이 없습니다
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
                                        className={`flex items-center justify-between gap-4 sm:gap-6 rounded-2xl sm:rounded-3xl bg-white/[0.06] ring-1 ring-white/10 px-5 sm:px-7 py-4 sm:py-5 ${
                                            editable
                                                ? "cursor-pointer hover:bg-white/[0.1] transition"
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
                                                <div className="text-white text-[clamp(1.1rem,2vw,1.75rem)] font-bold leading-snug truncate">
                                                    {e.title}
                                                </div>
                                                {e.location ? (
                                                    <div className="text-white/45 text-xs sm:text-sm truncate mt-0.5">
                                                        {e.location}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="text-white/55 text-[clamp(0.85rem,1.2vw,1.1rem)] font-semibold whitespace-nowrap">
                                            {eventTimeText(e)}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {modal ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
                    data-disable-widget-swipe="true"
                    onClick={() => !submitting && setModal(null)}
                >
                    <form
                        onSubmit={handleSaveModal}
                        onClick={(ev) => ev.stopPropagation()}
                        className="w-full max-w-md rounded-3xl bg-[#1e222d] ring-1 ring-white/15 p-6 text-white space-y-4 shadow-2xl"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold">
                                {modal.mode === "create" ? "새 Google 일정" : "일정 수정"}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setModal(null)}
                                className="p-1.5 rounded-full hover:bg-white/10 text-white/60 cursor-pointer"
                            >
                                <IoClose className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 text-sm">
                            {modal.mode === "create" && writableCalendars.length > 1 ? (
                                <CustomSelect
                                    value={modal.calendarId}
                                    options={writableCalendars.map((c) => ({
                                        value: c.id,
                                        label: c.summary,
                                        dotColor: c.backgroundColor || "#6E8BFF",
                                    }))}
                                    onChange={(val) => setModal({ ...modal, calendarId: val })}
                                />
                            ) : null}

                            <input
                                type="text"
                                placeholder="일정 제목"
                                value={modal.title}
                                onChange={(ev) => setModal({ ...modal, title: ev.target.value })}
                                className="w-full rounded-xl bg-white/[0.07] ring-1 ring-white/15 px-3.5 py-2.5 text-white placeholder-white/40 outline-none focus:ring-[#6E8BFF]"
                                autoFocus
                            />

                            <label className="flex items-center gap-2 text-white/80 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={modal.allDay}
                                    onChange={(ev) =>
                                        setModal({ ...modal, allDay: ev.target.checked })
                                    }
                                    className="rounded accent-[#6E8BFF]"
                                />
                                하루 종일
                            </label>

                            <div className="grid grid-cols-2 gap-2.5">
                                <input
                                    type="date"
                                    value={modal.startDate}
                                    onChange={(ev) =>
                                        setModal({
                                            ...modal,
                                            startDate: ev.target.value,
                                            endDate:
                                                modal.endDate < ev.target.value
                                                    ? ev.target.value
                                                    : modal.endDate,
                                        })
                                    }
                                    className="rounded-xl bg-white/[0.07] ring-1 ring-white/15 px-3 py-2 text-white outline-none"
                                />
                                <input
                                    type="date"
                                    value={modal.endDate}
                                    onChange={(ev) =>
                                        setModal({ ...modal, endDate: ev.target.value })
                                    }
                                    className="rounded-xl bg-white/[0.07] ring-1 ring-white/15 px-3 py-2 text-white outline-none"
                                />
                            </div>

                            {!modal.allDay ? (
                                <div className="grid grid-cols-2 gap-2.5">
                                    <input
                                        type="time"
                                        value={modal.startTime}
                                        onChange={(ev) =>
                                            setModal({ ...modal, startTime: ev.target.value })
                                        }
                                        className="rounded-xl bg-white/[0.07] ring-1 ring-white/15 px-3 py-2 text-white outline-none"
                                    />
                                    <input
                                        type="time"
                                        value={modal.endTime}
                                        onChange={(ev) =>
                                            setModal({ ...modal, endTime: ev.target.value })
                                        }
                                        className="rounded-xl bg-white/[0.07] ring-1 ring-white/15 px-3 py-2 text-white outline-none"
                                    />
                                </div>
                            ) : null}

                            <input
                                type="text"
                                placeholder="장소 (선택)"
                                value={modal.location}
                                onChange={(ev) => setModal({ ...modal, location: ev.target.value })}
                                className="w-full rounded-xl bg-white/[0.07] ring-1 ring-white/15 px-3.5 py-2 text-white placeholder-white/40 outline-none"
                            />

                            <textarea
                                placeholder="메모 (선택)"
                                rows={2}
                                value={modal.description}
                                onChange={(ev) =>
                                    setModal({ ...modal, description: ev.target.value })
                                }
                                className="w-full rounded-xl bg-white/[0.07] ring-1 ring-white/15 px-3.5 py-2 text-white placeholder-white/40 outline-none resize-none"
                            />
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            {modal.mode === "edit" ? (
                                <button
                                    type="button"
                                    onClick={handleDeleteModal}
                                    disabled={submitting}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-semibold transition cursor-pointer disabled:opacity-50"
                                >
                                    <IoTrashOutline className="w-4 h-4" />
                                    삭제
                                </button>
                            ) : (
                                <div />
                            )}

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setModal(null)}
                                    disabled={submitting}
                                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium cursor-pointer"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-4 py-2 rounded-xl bg-[#6E8BFF] hover:bg-[#5b79f5] text-white text-sm font-semibold transition cursor-pointer disabled:opacity-50"
                                >
                                    {submitting ? "저장 중..." : "저장"}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            ) : null}
        </div>
    )
}
