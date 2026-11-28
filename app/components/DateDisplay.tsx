import { useEffect, useState } from "react"
import { isLightClockAppearance, useClockAppearance } from "./Clock"

export function DateDisplay() {
    const [date, setDate] = useState(new Date())
    const isLight = isLightClockAppearance(useClockAppearance())

    useEffect(() => {
        const now = new Date()

        const msUntilNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds())

        let interval: ReturnType<typeof setInterval>

        const timeout = setTimeout(() => {
            setDate(new Date())

            interval = setInterval(() => {
                setDate(new Date())
            }, 60000)
        }, msUntilNextMinute)

        return () => {
            clearTimeout(timeout)
            if (interval) clearInterval(interval)
        }
    }, [])

    const formatDate = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, "0")
        const day = String(date.getDate()).padStart(2, "0")
        const days = ["일", "월", "화", "수", "목", "금", "토"]
        const dayOfWeek = days[date.getDay()]

        return `${year}. ${month}. ${day} (${dayOfWeek})`
    }

    return (
        <div
            className={`text-[clamp(1.25rem,2.4vw,2.5rem)] font-bold font-['Inter'] leading-tight ${
                isLight ? "text-zinc-800" : "text-white"
            }`}
        >
            {formatDate(date)}
        </div>
    )
}
