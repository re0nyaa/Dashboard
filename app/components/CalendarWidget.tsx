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

    for (let i = 0; i < 35; i++) {
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

async function fetchKoreanHolidays(
    year: number,
    month: number
): Promise<HolidaySet> {
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
        const timer = window.setInterval(() => setNow(new Date()), 60 * 1000)
        return () => window.clearInterval(timer)
    }, [])

    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")

    useEffect(() => {
        fetchKoreanHolidays(year, now.getMonth() + 1).then(setHolidays)
    }, [year, now.getMonth()])

    const weekdayNames = [
        "일요일",
        "월요일",
        "화요일",
        "수요일",
        "목요일",
        "금요일",
        "토요일",
    ]

    const weekday = weekdayNames[now.getDay()]

    const grid = useMemo(
        () => buildMonthGrid(now),
        [now.getFullYear(), now.getMonth(), now.getDate()]
    )

    return (
        <div className="w-[860px] h-[440px] rounded-[60px] overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[#f6b3b3] to-[#f5d7d7]" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-white/0" />

            <div className="relative h-full w-full flex items-stretch px-[56px] py-[44px]">
                <div className="flex-1 min-w-0 flex flex-col justify-start">
                    <div className="text-white/90 text-[34px] font-black tracking-tight">
                        {year}. {month}
                    </div>
                    <div className="mt-[-10px] text-white text-[96px] font-black leading-none tracking-tight">
                        {day}
                    </div>
                    <div className="mt-[6px] text-white/95 text-[42px] font-black leading-none tracking-tight">
                        {weekday}
                    </div>
                </div>

                <div className="w-[420px] flex items-center justify-end">
                    <div className="grid grid-cols-7 gap-[10px]">
                        {grid.map((cell, idx) => {
                            const isSunday = cell.col === 0
                            const isSaturday = cell.col === 6
                            const isSelected = cell.inMonth && cell.isToday

                            const yyyymmdd =
                                year * 10000 +
                                (now.getMonth() + 1) * 100 +
                                cell.day

                            const isHoliday =
                                cell.inMonth && holidays.has(yyyymmdd)

                            const base =
                                "w-[50px] h-[50px] rounded-[10px] flex items-center justify-center text-[26px] font-black"

                            if (!cell.inMonth) {
                                return (
                                    <div
                                        key={idx}
                                        className={`${base} bg-white/35 text-black/35`}
                                    >
                                        {cell.day}
                                    </div>
                                )
                            }

                            if (isSelected) {
                                return (
                                    <div
                                        key={idx}
                                        className={`${base} bg-[#ff5a5a] text-white`}
                                    >
                                        {cell.day}
                                    </div>
                                )
                            }

                            if (isHoliday) {
                                return (
                                    <div
                                        key={idx}
                                        className={`${base} bg-white/70 text-red-500`}
                                    >
                                        {cell.day}
                                    </div>
                                )
                            }

                            const weekendColor = isSunday
                                ? "text-red-500"
                                : isSaturday
                                ? "text-blue-500"
                                : "text-black"

                            return (
                                <div
                                    key={idx}
                                    className={`${base} bg-white/70 ${weekendColor}`}
                                >
                                    {cell.day}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
