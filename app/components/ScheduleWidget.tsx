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

export function ScheduleWidget() {
    const [now, setNow] = useState(() => new Date())
    const [items, setItems] = useState<ScheduleItem[]>([])

    // 현재 시각 갱신
    useEffect(() => {
        const t = window.setInterval(() => setNow(new Date()), 60 * 1000)
        return () => window.clearInterval(t)
    }, [])

    // 일정 로드
    useEffect(() => {
        let cancelled = false

        const load = async () => {
            const next = await fetchSchedule({ limit: 50 })
            if (!cancelled) setItems(next)
        }

        load()
        const interval = window.setInterval(load, 60 * 1000)
        return () => {
            cancelled = true
            window.clearInterval(interval)
        }
    }, [])

    // 🔹 오늘 일정만
    const upcoming = useMemo(() => {
        return items
            .filter((e) => {
                const start = new Date(e.start)
                return Number.isFinite(start.getTime()) && isSameDay(start, now)
            })
            .sort(
                (a, b) =>
                    new Date(a.start).getTime() - new Date(b.start).getTime()
            )
    }, [items, now])

    const day = pad2(now.getDate())
    const weekday = weekdayKorean(now)

    return (
        <div className="w-[860px] h-[440px] rounded-[60px] overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[#2B2F3A] to-[#1F2430]" />

            <div className="relative h-full w-full px-[56px] py-[44px] flex flex-col">
                {/* Header */}
                <div className="flex items-baseline gap-[18px] shrink-0">
                    <div className="text-white text-[50px] font-black leading-none">
                        {day}
                    </div>
                    <div className="text-white/95 text-[40px] font-black leading-none">
                        {weekday}
                    </div>
                </div>

                {/* Scroll Area */}
                <div className="mt-[26px] flex-1 overflow-y-auto pr-[12px]">
                    {upcoming.length === 0 ? (
                        <div className="text-white/70 text-[28px] font-bold">
                            오늘 일정이 없습니다.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-[14px]">
                            {upcoming.map((e, idx) => (
                                <div
                                    key={`${e.start}-${idx}`}
                                    className="flex items-center justify-between gap-[24px]"
                                >
                                    <div className="flex items-center gap-[18px] min-w-0">
                                        <div
                                            className="w-[10px] h-[35px] rounded-full shrink-0"
                                            style={{
                                                backgroundColor:
                                                    markerColor(idx),
                                            }}
                                        />
                                        <div className="min-w-0">
                                            <div className="text-white text-[33px] font-bold leading-tight line-clamp-1">
                                                {e.title}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-white/45 text-[20px] font-bold whitespace-nowrap">
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
