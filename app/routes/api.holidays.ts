import { XMLParser } from "fast-xml-parser"

const HOLIDAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000

const holidayCache = new Map<string, { expiresAt: number; days: number[] }>()

function toArray<T>(value: T | T[] | undefined | null): T[] {
    if (!value) return []
    return Array.isArray(value) ? value : [value]
}

function toInt(value: string | null): number | undefined {
    if (!value) return undefined
    const n = Number(value)
    return Number.isFinite(n) ? Math.trunc(n) : undefined
}

export async function loader({ request }: { request: Request }) {
    const apiKey =
        process.env.KOREAN_HOLIDAY_API_KEY ??
        process.env.VITE_KOREAN_HOLIDAY_API_KEY

    if (!apiKey) {
        return new Response("Missing KOREAN_HOLIDAY_API_KEY", { status: 500 })
    }

    const url = new URL(request.url)
    const yearParam = toInt(url.searchParams.get("year"))
    const monthParam = toInt(url.searchParams.get("month"))

    const now = new Date()
    const year = yearParam ?? now.getFullYear()
    const month = monthParam ?? now.getMonth() + 1

    if (month < 1 || month > 12) {
        return new Response("Invalid month", { status: 400 })
    }

    const cacheKey = `${year}-${String(month).padStart(2, "0")}`
    const cached = holidayCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
        return new Response(JSON.stringify(cached.days), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "public, max-age=3600",
            },
        })
    }

    const mm = String(month).padStart(2, "0")

    // NOTE: data.go.kr service keys are often already URL-encoded.
    // Using URLSearchParams can double-encode and break auth, so keep it raw.
    const upstreamUrl =
        `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getHoliDeInfo` +
        `?serviceKey=${apiKey}` +
        `&numOfRows=31` +
        `&pageNo=1` +
        `&solYear=${year}` +
        `&solMonth=${mm}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    try {
        const response = await fetch(upstreamUrl, {
            signal: controller.signal,
            headers: {
                accept: "application/xml, text/xml;q=0.9, */*;q=0.1",
                "user-agent":
                    "Mozilla/5.0 (compatible; 29inch-dashboard/1.0; +https://localhost)",
            },
        })

        if (!response.ok) {
            return new Response(JSON.stringify([] satisfies number[]), {
                status: 200,
                headers: {
                    "content-type": "application/json; charset=utf-8",
                },
            })
        }

        const xmlText = await response.text()

        const parser = new XMLParser({
            ignoreAttributes: false,
        })

        const parsed = parser.parse(xmlText) as any
        const itemsRaw = parsed?.response?.body?.items?.item
        const items = toArray(itemsRaw)

        const days = items
            .filter((item: any) => String(item?.isHoliday ?? "").trim() === "Y")
            .map((item: any) =>
                Number.parseInt(String(item?.locdate ?? ""), 10)
            )
            .filter((n: number) => Number.isFinite(n))

        holidayCache.set(cacheKey, {
            expiresAt: Date.now() + HOLIDAY_CACHE_TTL_MS,
            days,
        })

        return new Response(JSON.stringify(days), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "public, max-age=3600",
            },
        })
    } catch (error) {
        console.error("Error fetching holidays (server):", error)
        return new Response(JSON.stringify([] satisfies number[]), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
            },
        })
    } finally {
        clearTimeout(timeout)
    }
}
