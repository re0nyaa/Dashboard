import { useEffect, useState } from "react"

export function DateDisplay() {
    const [date, setDate] = useState(new Date())

    useEffect(() => {
        const timer = setInterval(() => {
            setDate(new Date())
        }, 60000)

        return () => clearInterval(timer)
    }, [])

    const formatDate = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, "0")
        const day = String(date.getDate()).padStart(2, "0")
        const days = ["일", "월", "화", "수", "목", "금", "토"]
        const dayOfWeek = days[date.getDay()]

        return `${year}. ${month}. ${day} (${dayOfWeek})`
    }

    return <div className="text-white text-[40px] font-bold font-['Inter']">{formatDate(date)}</div>
}
