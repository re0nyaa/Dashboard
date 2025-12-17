import { XMLParser } from "fast-xml-parser"

type WeatherIconKey = "sun" | "partly" | "cloud" | "rain" | "snow"

const defaultLink = "https://apihub.kma.go.kr/api/typ02/openApi/"
export type WeatherCardForecastItem = {
    date: string
    weekday: string
    minTemp: number
    maxTemp: number
    icon: WeatherIconKey
}

export type WeatherCardData = {
    location: string
    temperature: number
    condition: string
    feelsLike: number
    minTemp: number
    maxTemp: number
    forecast: WeatherCardForecastItem[]
}

const CACHE_TTL_MS = 10 * 60 * 1000

type CacheEntry = {
    ts: number
    payload: WeatherCardData
}

declare global {
    var __kmaWeatherCache: Map<string, CacheEntry> | undefined
}

function getCache() {
    if (!globalThis.__kmaWeatherCache) {
        globalThis.__kmaWeatherCache = new Map<string, CacheEntry>()
    }
    return globalThis.__kmaWeatherCache
}

function pad2(n: number) {
    return String(n).padStart(2, "0")
}

function yyyymmdd(d: Date) {
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}

function addDays(d: Date, days: number) {
    const next = new Date(d)
    next.setDate(next.getDate() + days)
    return next
}

function getWeekdayKorean(d: Date) {
    const names = [
        "일요일",
        "월요일",
        "화요일",
        "수요일",
        "목요일",
        "금요일",
        "토요일",
    ]
    return names[d.getDay()]
}

// 단기예보 발표 기준
function vilageBase(now: Date): { baseDate: string; baseTime: string } {
    const publishHours = [23, 20, 17, 14, 11, 8, 5, 2]
    const hour = now.getHours()
    let baseHour = publishHours.find((h) => hour >= h)
    let baseDate = new Date(now)
    if (baseHour == null) {
        baseHour = 23
        baseDate = addDays(baseDate, -1)
    }
    return { baseDate: yyyymmdd(baseDate), baseTime: `${pad2(baseHour)}00` }
}

// 초단기실황 발표 기준
function ultraBase(now: Date): { baseDate: string; baseTime: string } {
    const minute = now.getMinutes()
    let baseHour = now.getHours()
    let baseDate = new Date(now)

    if (minute < 40) {
        baseHour -= 1
        if (baseHour < 0) {
            baseHour = 23
            baseDate = addDays(baseDate, -1)
        }
    }

    return { baseDate: yyyymmdd(baseDate), baseTime: `${pad2(baseHour)}30` }
}

function toIcon(sky: number | null, pty: number | null): WeatherIconKey {
    if (pty === 3) return "snow"
    if (pty === 1 || pty === 2 || pty === 4) return "rain"
    if (sky === 1) return "sun"
    if (sky === 3) return "partly"
    if (sky === 4) return "cloud"
    return "cloud"
}

function toCondition(icon: WeatherIconKey): string {
    switch (icon) {
        case "sun":
            return "맑음"
        case "partly":
            return "구름많음"
        case "cloud":
            return "흐림"
        case "rain":
            return "비"
        case "snow":
            return "눈"
    }
}

// 체감온도 계산
function feelsLikeC(tempC: number, windKmH: number): number {
    if (tempC <= 10 && windKmH >= 4.8) {
        const v16 = Math.pow(windKmH, 0.16)
        return Math.round(
            13.12 + 0.6215 * tempC - 11.37 * v16 + 0.3965 * tempC * v16
        )
    }
    return Math.round(tempC)
}

// 더미 데이터
function getMock(): WeatherCardData {
    return {
        location: "서울",
        temperature: 6,
        condition: "흐림",
        feelsLike: 6,
        minTemp: -4,
        maxTemp: 8,
        forecast: [
            {
                date: "",
                weekday: "화요일",
                minTemp: -4,
                maxTemp: 8,
                icon: "cloud",
            },
            {
                date: "",
                weekday: "수요일",
                minTemp: -4,
                maxTemp: 8,
                icon: "partly",
            },
            {
                date: "",
                weekday: "목요일",
                minTemp: -4,
                maxTemp: 8,
                icon: "partly",
            },
        ],
    }
}

// 초단기실황
async function fetchCurrentWeather(nx: number, ny: number, authKey: string) {
    const now = new Date()
    const { baseDate, baseTime } = ultraBase(now)

    const url = new URL(
        `${defaultLink}/openApi/VilageFcstInfoService_2.0/getUltraSrtNcst`
    )
    url.searchParams.append("authKey", authKey)
    url.searchParams.append("numOfRows", "1000")
    url.searchParams.append("pageNo", "1")
    url.searchParams.append("dataType", "XML")
    url.searchParams.append("base_date", baseDate)
    url.searchParams.append("base_time", baseTime)
    url.searchParams.append("nx", String(nx))
    url.searchParams.append("ny", String(ny))

    const res = await fetch(url.toString())
    const text = await res.text()
    const parser = new XMLParser()
    const data = parser.parse(text)
    const items = data?.response?.body?.items?.item ?? []

    let temperature = 0
    let wind = 0
    for (const item of items) {
        const cat = item.category
        const val = Number(item.obsrValue)
        if (cat === "T1H") temperature = val
        if (cat === "WSD") wind = val
    }
    return { temperature, feelsLike: feelsLikeC(temperature, wind) }
}

// 초단기예보
async function fetchUltraShortForecast(
    nx: number,
    ny: number,
    authKey: string
) {
    const now = new Date()
    const { baseDate, baseTime } = ultraBase(now)

    const url = new URL(
        `${defaultLink}/openApi/VilageFcstInfoService_2.0/getUltraSrtFcst`
    )
    url.searchParams.append("authKey", authKey)
    url.searchParams.append("numOfRows", "1000")
    url.searchParams.append("pageNo", "1")
    url.searchParams.append("dataType", "XML")
    url.searchParams.append("base_date", baseDate)
    url.searchParams.append("base_time", baseTime)
    url.searchParams.append("nx", String(nx))
    url.searchParams.append("ny", String(ny))

    const res = await fetch(url.toString())
    const text = await res.text()
    const parser = new XMLParser()
    const data = parser.parse(text)
    const items = data?.response?.body?.items?.item ?? []

    let sky = null
    let pty = null
    for (const item of items) {
        const cat = item.category
        const val = Number(item.fcstValue)
        if (cat === "SKY") sky = val
        if (cat === "PTY") pty = val
    }
    return { sky, pty }
}

// 단기예보
async function fetchVillageForecast(nx: number, ny: number, authKey: string) {
    const now = new Date()
    const { baseDate, baseTime } = vilageBase(now)

    const url = new URL(
        `${defaultLink}/openApi/VilageFcstInfoService_2.0/getVilageFcst`
    )
    url.searchParams.append("authKey", authKey)
    url.searchParams.append("numOfRows", "1000")
    url.searchParams.append("pageNo", "1")
    url.searchParams.append("dataType", "XML")
    url.searchParams.append("base_date", baseDate)
    url.searchParams.append("base_time", baseTime)
    url.searchParams.append("nx", String(nx))
    url.searchParams.append("ny", String(ny))

    const res = await fetch(url.toString())
    const text = await res.text()
    const parser = new XMLParser()
    const data = parser.parse(text)
    const items = data?.response?.body?.items?.item ?? []

    const byDate: Record<string, Record<string, string>> = {}
    for (const item of items) {
        const d = String(item.fcstDate ?? "")
        const c = String(item.category ?? "")
        const v = String(item.fcstValue ?? "")
        if (!d || !c) continue
        byDate[d] ??= {}
        byDate[d][c] = v
    }
    return byDate
}

// 초단기실황, 초단기예보, 단기예보 통합
export async function loader({ request }: { request: Request }) {
    const url = new URL(request.url)
    const nx = Number(url.searchParams.get("nx") ?? "60")
    const ny = Number(url.searchParams.get("ny") ?? "127")
    const cacheKey = `${nx},${ny}`
    const cache = getCache()
    const nowMs = Date.now()
    const cached = cache.get(cacheKey)
    if (cached && nowMs - cached.ts < CACHE_TTL_MS) {
        return new Response(JSON.stringify(cached.payload), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "public, max-age=3600",
            },
        })
    } else {
    }

    const authKey = process.env.KMA_API_KEY || ""
    if (!authKey) {
        return new Response(JSON.stringify(getMock()), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
        })
    }

    const now = new Date()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    try {
        // 초단기실황
        const current = await fetchCurrentWeather(nx, ny, authKey)

        // 초단기예보
        const ultraShort = await fetchUltraShortForecast(nx, ny, authKey)

        // 단기예보
        const { baseDate: vilageDate, baseTime: vilageTime } = vilageBase(now)
        const vilageUrl = new URL(
            `${defaultLink}/VilageFcstInfoService_2.0/getVilageFcst`
        )
        vilageUrl.searchParams.append("authKey", authKey)
        vilageUrl.searchParams.append("numOfRows", "1000")
        vilageUrl.searchParams.append("pageNo", "1")
        vilageUrl.searchParams.append("dataType", "XML")
        vilageUrl.searchParams.append("base_date", vilageDate)
        vilageUrl.searchParams.append("base_time", vilageTime)
        vilageUrl.searchParams.append("nx", String(nx))
        vilageUrl.searchParams.append("ny", String(ny))

        const vilageRes = await fetch(vilageUrl.toString(), {
            signal: controller.signal,
        })
        if (!vilageRes.ok)
            throw new Error(`Failed fetch vilage: ${vilageRes.status}`)
        const xmlData = await vilageRes.text()
        const parser = new XMLParser()
        const jsonData = parser.parse(xmlData)
        const fcstItems = jsonData?.response?.body?.items?.item ?? []

        const byDate: Record<
            string,
            Record<string, Record<string, string>>
        > = {}
        for (const item of fcstItems) {
            const d = String(item.fcstDate ?? "")
            const t = String(item.fcstTime ?? "")
            const c = String(item.category ?? "")
            const v = String(item.fcstValue ?? "")
            if (!d || !t || !c) continue
            byDate[d] ??= {}
            byDate[d][t] ??= {}
            byDate[d][t][c] = v
        }

        const days = [0, 1, 2].map((offset) => addDays(now, offset))
        const forecast: WeatherCardForecastItem[] = days.map((d) => {
            const date = yyyymmdd(d)
            const dayMap = byDate[date] ?? {}

            let minTemp: number | null = null
            let maxTemp: number | null = null
            for (const time of Object.keys(dayMap)) {
                if (minTemp == null && dayMap[time]?.TMN != null)
                    minTemp = Number(dayMap[time].TMN)
                if (maxTemp == null && dayMap[time]?.TMX != null)
                    maxTemp = Number(dayMap[time].TMX)
            }

            return {
                date,
                weekday: getWeekdayKorean(d),
                minTemp: Number.isFinite(minTemp as number)
                    ? Math.round(minTemp as number)
                    : 0,
                maxTemp: Number.isFinite(maxTemp as number)
                    ? Math.round(maxTemp as number)
                    : 0,
                icon: toIcon(ultraShort.sky, ultraShort.pty),
            }
        })

        const today = forecast[0]
        const condition = toCondition(today?.icon ?? "cloud")

        const payload: WeatherCardData = {
            location: "서울",
            temperature: current.temperature,
            feelsLike: current.feelsLike,
            minTemp: today?.minTemp ?? 0,
            maxTemp: today?.maxTemp ?? 0,
            condition,
            forecast,
        }

        cache.set(cacheKey, { ts: nowMs, payload })

        return new Response(JSON.stringify(payload), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "public, max-age=3600",
            },
        })
    } catch (err) {
        console.error("Error fetching weather:", err)
        const fallback = cache.get(cacheKey)
        if (fallback) {
            return new Response(JSON.stringify(fallback.payload), {
                status: 200,
                headers: { "content-type": "application/json; charset=utf-8" },
            })
        }
        return new Response(JSON.stringify(getMock()), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
        })
    } finally {
        clearTimeout(timeout)
    }
}
