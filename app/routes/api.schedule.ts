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

function splitCsv(value: string | undefined): string[] {
    if (!value) return []
    return value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
}

function defaultColorForIndex(idx: number) {
    // URL 1 = red (요구사항)
    const colors = ["#FF6B7A", "#6E8BFF", "#7BE0B5", "#FFD166"]
    return colors[idx % colors.length]
}

function getIcalSources(): Array<{ id: string; url: string; color: string }> {
    const urlsFromCsv = splitCsv(process.env.ICAL_URLS)
    const colorsFromCsv = splitCsv(process.env.ICAL_COLORS)

    const sources: Array<{ id: string; url: string; color: string }> = []

    if (urlsFromCsv.length > 0) {
        urlsFromCsv.forEach((u, idx) => {
            const id = String(idx + 1)
            const color =
                colorsFromCsv[idx] ??
                process.env[`ICAL_COLOR_${id}`] ??
                defaultColorForIndex(idx)
            sources.push({ id, url: u, color })
        })
        return sources
    }

    // ICAL_URL_1, ICAL_URL_2 ... 형태 지원
    for (let i = 1; i <= 10; i++) {
        const u = process.env[`ICAL_URL_${i}`]
        if (!u) continue
        const color =
            process.env[`ICAL_COLOR_${i}`] ?? defaultColorForIndex(i - 1)
        sources.push({ id: String(i), url: u, color })
    }
    if (sources.length > 0) return sources

    // 기존 단일 ICAL_URL fallback
    const single = process.env.ICAL_URL
    if (single) {
        sources.push({
            id: "1",
            url: single,
            color: process.env.ICAL_COLOR_1 ?? defaultColorForIndex(0),
        })
    }

    return sources
}

export async function loader({ request }: { request: Request }) {
    const url = new URL(request.url)
    const limit = Math.min(
        50,
        Math.max(1, toInt(url.searchParams.get("limit"), DEFAULT_LIMIT))
    )

    const sources = getIcalSources()
    if (sources.length === 0) {
        return new Response(JSON.stringify([] satisfies ScheduleItem[]), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
            },
        })
    }

    try {
        const todayStart = startOfToday()

        const results = await Promise.allSettled(
            sources.map(async (src) => {
                // node-ical doesn't support AbortController directly; enforce a coarse timeout.
                const data = (await Promise.race([
                    ical.async.fromURL(src.url),
                    new Promise((_, reject) =>
                        setTimeout(
                            () => reject(new Error("iCal fetch timeout")),
                            8000
                        )
                    ),
                ])) as Record<string, any>

                const events = Object.values(data)
                    .filter((e: any) => e && e.type === "VEVENT")
                    .filter((e: any) => e.status !== "CANCELLED")
                    .filter((e: any) => e.start instanceof Date)
                    .filter(
                        (e: any) => e.start.getTime() >= todayStart.getTime()
                    )
                    .map((e: any) => {
                        const start: Date = e.start
                        const end: Date | undefined =
                            e.end instanceof Date ? e.end : undefined
                        return {
                            title: String(e.summary ?? "(제목 없음)"),
                            start: start.toISOString(),
                            end: end?.toISOString(),
                            allDay: isAllDayEvent(start, end),
                            sourceId: src.id,
                            color: src.color,
                        } satisfies ScheduleItem
                    })

                return events
            })
        )

        const merged = results
            .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
            .sort(
                (a, b) =>
                    new Date(a.start).getTime() - new Date(b.start).getTime()
            )
            .slice(0, limit)

        return new Response(JSON.stringify(merged), {
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
