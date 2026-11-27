import { useEffect, useMemo, useState } from "react"

type DayCell = {
    day: number
    inMonth: boolean
    isToday: boolean
    col: number
}

type HolidaySet = Set<number>

function buildMonthGrid(date: Date): DayCell[] {
    const year = date.getFullYear()
    const month = date.getMonth()
    const today = date.getDate()

    const firstDayCol = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()

    const cells: DayCell[] = []

    const totalCells = firstDayCol + daysInMonth <= 35 ? 35 : 42

    for (let i = 0; i < totalCells; i++) {
        const col = i % 7
        const dayInMonth = i - firstDayCol + 1

        if (dayInMonth < 1) {
            cells.push({
                day: daysInPrevMonth + dayInMonth,
                inMonth: false,
                isToday: false,
                col,
            })
            continue
        }

        if (dayInMonth > daysInMonth) {
            cells.push({
                day: dayInMonth - daysInMonth,
                inMonth: false,
                isToday: false,
                col,
            })
            continue
        }

        cells.push({
            day: dayInMonth,
            inMonth: true,
            isToday: dayInMonth === today,
            col,
        })
    }

    return cells
}

async function fetchKoreanHolidays(year: number, month: number): Promise<HolidaySet> {
    const url = `/api/holidays?year=${year}&month=${month}`

    try {
        const res = await fetch(url)
        if (!res.ok) return new Set<number>()

        const days = (await res.json()) as unknown
        if (!Array.isArray(days)) return new Set<number>()

        const set = new Set<number>()
        for (const d of days) {
            const n = typeof d === "number" ? d : Number.parseInt(String(d), 10)
            if (Number.isFinite(n)) set.add(n)
        }
        return set
    } catch {
        return new Set<number>()
    }
}

export function CalendarWidget() {
    const [now, setNow] = useState(() => new Date())
    const [holidays, setHolidays] = useState<HolidaySet>(new Set())
    useEffect(() => {
        const now = new Date()

        const msUntilMidnight =
            new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()

        let interval: number

        const timeout = window.setTimeout(() => {
            setNow(new Date())

            interval = window.setInterval(
                () => {
                    setNow(new Date())
                },
                24 * 60 * 60 * 1000
            )
        }, msUntilMidnight)

        return () => {
            clearTimeout(timeout)
            if (interval) clearInterval(interval)
        }
    }, [])

    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")

    useEffect(() => {
        fetchKoreanHolidays(year, now.getMonth() + 1).then(setHolidays)
    }, [year, now.getMonth()])

    const weekdayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]

    const weekday = weekdayNames[now.getDay()]

    const grid = useMemo(
        () => buildMonthGrid(now),
        [now.getFullYear(), now.getMonth(), now.getDate()]
    )

    const dayHeaders = ["일", "월", "화", "수", "목", "금", "토"]
    const monthNamesEn = [
        "JANUARY",
        "FEBRUARY",
        "MARCH",
        "APRIL",
        "MAY",
        "JUNE",
        "JULY",
        "AUGUST",
        "SEPTEMBER",
        "OCTOBER",
        "NOVEMBER",
        "DECEMBER",
    ]
    const monthEn = monthNamesEn[now.getMonth()]
    const rowCount = grid.length / 7

    return (
        <div className="w-full h-full bg-gradient-to-br from-[#18181b] via-[#141417] to-[#0f0f12] overflow-hidden relative select-none">
            <div className="relative h-full w-full max-w-[1440px] mx-auto px-6 sm:px-14 lg:px-20 py-14 sm:py-16 flex flex-col lg:flex-row items-stretch gap-8 lg:gap-16">
                {/* 좌측 오늘 날짜 히어로 */}
                <div className="lg:w-[30%] shrink-0 flex flex-row lg:flex-col items-end lg:items-start justify-between lg:justify-center">
                    <div>
                        <div className="text-[#FF453A] text-xs sm:text-sm font-bold tracking-[0.2em] uppercase">
                            {monthEn} {year}
                        </div>
                        <div className="mt-1 text-white/50 text-base sm:text-xl font-semibold tracking-tight">
                            {year}년 {now.getMonth() + 1}월
                        </div>
                    </div>

                    <div className="flex items-baseline gap-3 lg:block lg:mt-6">
                        <div className="text-white text-[clamp(3.75rem,9.5vw,9rem)] font-black leading-none tracking-tighter tabular-nums">
                            {day}
                        </div>
                        <div className="text-white/85 text-[clamp(1.25rem,2.4vw,2.25rem)] font-bold tracking-tight lg:mt-3">
                            {weekday}
                        </div>
                    </div>
                </div>

                {/* 우측 OS 다크 글래스 월간 캘린더 */}
                <div className="flex-1 min-h-0 flex flex-col justify-center">
                    <div className="w-full h-full max-h-[640px] rounded-[32px] bg-white/[0.04] ring-1 ring-white/10 backdrop-blur-2xl p-5 sm:p-8 flex flex-col">
                        {/* 요일 헤더 */}
                        <div className="grid grid-cols-7 pb-3 sm:pb-4 border-b border-white/[0.08] shrink-0">
                            {dayHeaders.map((label, i) => (
                                <div
                                    key={label}
                                    className={`text-center text-xs sm:text-sm font-bold tracking-wider ${
                                        i === 0
                                            ? "text-[#FF6B6B]"
                                            : i === 6
                                              ? "text-[#64B5F6]"
                                              : "text-white/40"
                                    }`}
                                >
                                    {label}
                                </div>
                            ))}
                        </div>

                        {/* 날짜 그리드 */}
                        <div
                            className={`grid grid-cols-7 flex-1 pt-2 ${
                                rowCount === 5 ? "grid-rows-5" : "grid-rows-6"
                            }`}
                        >
                            {grid.map((cell, idx) => {
                                const isSunday = cell.col === 0
                                const isSaturday = cell.col === 6
                                const isSelected = cell.inMonth && cell.isToday

                                const yyyymmdd =
                                    year * 10000 + (now.getMonth() + 1) * 100 + cell.day
                                const isHoliday = cell.inMonth && holidays.has(yyyymmdd)

                                if (!cell.inMonth) {
                                    return (
                                        <div
                                            key={idx}
                                            className="flex items-center justify-center text-[clamp(0.95rem,1.8vw,1.5rem)] font-semibold text-white/15 tabular-nums"
                                        >
                                            {cell.day}
                                        </div>
                                    )
                                }

                                if (isSelected) {
                                    return (
                                        <div
                                            key={idx}
                                            className="flex flex-col items-center justify-center"
                                        >
                                            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-[#FF453A] text-white flex items-center justify-center text-[clamp(1rem,1.9vw,1.6rem)] font-extrabold tabular-nums">
                                                {cell.day}
                                            </div>
                                        </div>
                                    )
                                }

                                const textColor =
                                    isHoliday || isSunday
                                        ? "text-[#FF6B6B]"
                                        : isSaturday
                                          ? "text-[#64B5F6]"
                                          : "text-white/90"

                                return (
                                    <div
                                        key={idx}
                                        className="flex flex-col items-center justify-center gap-1"
                                    >
                                        <span
                                            className={`text-[clamp(0.95rem,1.8vw,1.55rem)] font-bold tabular-nums leading-none ${textColor}`}
                                        >
                                            {cell.day}
                                        </span>
                                        {isHoliday && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B6B]" />
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
