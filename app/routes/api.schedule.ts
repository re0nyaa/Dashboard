import type { ScheduleItem } from "../utils/schedule"
import ical from "node-ical"

const DEFAULT_LIMIT = 10

function toInt(value: string | null, fallback: number) {
    const n = Number(value)
    return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function startOfToday(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isAllDayEvent(start: Date, end?: Date) {
    if (!end) return false
    const isMidnight = (dt: Date) =>
        dt.getHours() === 0 && dt.getMinutes() === 0 && dt.getSeconds() === 0

    const durationMs = end.getTime() - start.getTime()
    const atLeastDay = durationMs >= 23 * 60 * 60 * 1000

    return isMidnight(start) && isMidnight(end) && atLeastDay
}

export async function loader({ request }: { request: Request }) {
    const url = new URL(request.url)
    const limit = Math.min(
        50,
        Math.max(1, toInt(url.searchParams.get("limit"), DEFAULT_LIMIT))
    )

    const icalUrl = process.env.ICAL_URL
    if (!icalUrl) {
        return new Response(JSON.stringify([] satisfies ScheduleItem[]), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
            },
        })
    }

    try {
        // node-ical doesn't support AbortController directly; enforce a coarse timeout.
        const data = (await Promise.race([
            ical.async.fromURL(icalUrl),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("iCal fetch timeout")), 8000)
            ),
        ])) as Record<string, any>

        const todayStart = startOfToday()

        const events = Object.values(data)
            .filter((e: any) => e && e.type === "VEVENT")
            .filter((e: any) => e.status !== "CANCELLED")
            .filter((e: any) => e.start instanceof Date)
            .filter((e: any) => e.start.getTime() >= todayStart.getTime())
            .sort((a: any, b: any) => a.start.getTime() - b.start.getTime())
            .slice(0, limit)
            .map((e: any) => {
                const start: Date = e.start
                const end: Date | undefined =
                    e.end instanceof Date ? e.end : undefined
                return {
                    title: String(e.summary ?? "(제목 없음)"),
                    start: start.toISOString(),
                    end: end?.toISOString(),
                    allDay: isAllDayEvent(start, end),
                } satisfies ScheduleItem
            })

        return new Response(JSON.stringify(events), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
            },
        })
    } catch (error) {
        console.error("Error fetching schedule (server):", error)
        return new Response(JSON.stringify([] satisfies ScheduleItem[]), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
            },
        })
    }
}
