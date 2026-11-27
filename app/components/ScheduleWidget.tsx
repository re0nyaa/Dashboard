import { useEffect, useMemo, useState } from "react"
import { fetchSchedule, type ScheduleItem } from "../utils/schedule"

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

export function ScheduleWidget() {
    const [now, setNow] = useState(() => new Date())
    const [items, setItems] = useState<ScheduleItem[]>(() => loadCachedSchedule())

    // 현재 시각 갱신
    useEffect(() => {
        const t = window.setInterval(() => setNow(new Date()), 60 * 1000)
        return () => window.clearInterval(t)
    }, [])

    // 일정 로드 (캐시 비교 후 변경 시에만 갱신)
    useEffect(() => {
        let cancelled = false

        const load = async () => {
            const next = await fetchSchedule({ limit: 50 })
            if (cancelled) return
            setItems((prev) => {
                if (JSON.stringify(prev) === JSON.stringify(next)) {
                    return prev
                }
                saveCachedSchedule(next)
                return next
            })
        }

        load()
        const interval = window.setInterval(load, 60 * 1000)
        return () => {
            cancelled = true
            window.clearInterval(interval)
        }
    }, [])

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
                    <div className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-white/[0.08] ring-1 ring-white/10 text-xs sm:text-sm font-medium text-white/75 lg:mt-6">
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
                            {upcoming.map((e, idx) => (
                                <div
                                    key={`${e.start}-${idx}`}
                                    className="flex items-center justify-between gap-4 sm:gap-6 rounded-2xl sm:rounded-3xl bg-white/[0.06] ring-1 ring-white/10 px-5 sm:px-7 py-4 sm:py-5"
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
                                        </div>
                                    </div>

                                    <div className="text-white/55 text-[clamp(0.85rem,1.2vw,1.1rem)] font-semibold whitespace-nowrap">
                                        {eventTimeText(e)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
