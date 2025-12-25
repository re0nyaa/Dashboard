import type { WeatherCardData, WeatherCardForecastItem } from "../utils/weather"

const OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5"
const OPENWEATHER_GEO_BASE = "https://api.openweathermap.org/geo/1.0"
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org"

type OpenWeatherReverseGeoItem = {
    name?: string
    local_names?: Record<string, string>
    country?: string
    state?: string
}

function formatLocationFromOpenWeatherGeo(
    item: OpenWeatherReverseGeoItem
): string | undefined {
    const place = (item.local_names?.ko ?? item.name ?? "").trim()
    if (!place) return undefined

    const state = (item.state ?? "").trim()
    if (state && state !== place) return `${state} ${place}`
    return place
}

type NominatimReverseResponse = {
    display_name?: string
    address?: {
        state?: string
        province?: string
        region?: string
        city?: string
        county?: string
        borough?: string
        city_district?: string
        district?: string
        suburb?: string
    }
}

function formatLocationFromNominatim(
    data: NominatimReverseResponse
): string | undefined {
    const a = data.address
    if (!a) return undefined

    const state = (a.state ?? a.province ?? a.region ?? "").trim()
    const sigungu = (
        a.city_district ??
        a.city ??
        a.county ??
        a.borough ??
        a.district ??
        a.suburb ??
        ""
    ).trim()

    if (state && sigungu && state !== sigungu) return `${state} ${sigungu}`
    if (sigungu) return sigungu
    if (state) return state
    return data.display_name?.trim() || undefined
}

/**
 * 현재 날씨 한글 조건
 */
function toCondition(main: string): string {
    switch (main) {
        case "Clear":
            return "맑음"
        case "Clouds":
            return "흐림"
        case "Rain":
        case "Drizzle":
            return "비"
        case "Thunderstorm":
            return "뇌우"
        case "Snow":
            return "눈"
        case "Mist":
        case "Smoke":
        case "Haze":
        case "Dust":
        case "Fog":
        case "Sand":
        case "Ash":
        case "Squall":
        case "Tornado":
            return "안개"
        default:
            return main
    }
}

function weekdayKorean(date: Date) {
    return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()] + "요일"
}

/**
 * 날짜별 집계 타입
 * - iconAM: 00~12
 * - iconPM: 13~24
 */
type DayAgg = {
    min: number
    max: number
    iconAM?: string
    iconPM?: string
}

export async function loader({ request }: { request: Request }) {
    const apiKey = process.env.OPENWEATHER_API_KEY
    if (!apiKey) {
        return new Response("Missing OPENWEATHER_API_KEY", { status: 500 })
    }

    const toFiniteNumber = (value: string | null): number | undefined => {
        if (!value) return undefined
        const n = Number(value)
        return Number.isFinite(n) ? n : undefined
    }

    const url = new URL(request.url)
    const latParam = toFiniteNumber(url.searchParams.get("lat"))
    const lonParam = toFiniteNumber(url.searchParams.get("lon"))

    const latEnv = toFiniteNumber(
        process.env.LOCATION_LAT ?? process.env.VITE_LOCATION_LAT ?? null
    )
    const lonEnv = toFiniteNumber(
        process.env.LOCATION_LON ?? process.env.VITE_LOCATION_LON ?? null
    )

    const lat = latParam ?? latEnv
    const lon = lonParam ?? lonEnv

    if (lat === undefined || lon === undefined) {
        return new Response(
            "Missing location. Provide ?lat=...&lon=... or set LOCATION_LAT/LOCATION_LON",
            { status: 400 }
        )
    }

    let resolvedLocation: string | undefined
    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 4000)
        const userAgent =
            process.env.NOMINATIM_USER_AGENT ??
            "29inch-dashboard/1.0 (local; contact via NOMINATIM_USER_AGENT)"

        const reverseRes = await fetch(
            `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=ko`,
            {
                signal: controller.signal,
                headers: {
                    "user-agent": userAgent,
                    accept: "application/json",
                },
            }
        )

        if (reverseRes.ok) {
            const reverseJson =
                (await reverseRes.json()) as NominatimReverseResponse
            resolvedLocation = formatLocationFromNominatim(reverseJson)
        }

        clearTimeout(timeout)
    } catch {
        // ignore reverse-geocoding failures; fall back to current.name
    }

    if (!resolvedLocation) {
        try {
            const owReverseRes = await fetch(
                `${OPENWEATHER_GEO_BASE}/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${apiKey}`
            )
            if (owReverseRes.ok) {
                const owJson =
                    (await owReverseRes.json()) as OpenWeatherReverseGeoItem[]
                if (Array.isArray(owJson) && owJson.length > 0) {
                    resolvedLocation = formatLocationFromOpenWeatherGeo(
                        owJson[0]
                    )
                }
            }
        } catch {
            // ignore OpenWeather Geo failures
        }
    }

    // 현재 날씨
    const currentRes = await fetch(
        `${OPENWEATHER_BASE}/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=kr`
    )
    if (!currentRes.ok) throw new Error("Current weather fetch failed")
    const current = await currentRes.json()

    // 예보
    const forecastRes = await fetch(
        `${OPENWEATHER_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=kr`
    )
    if (!forecastRes.ok) throw new Error("Forecast fetch failed")
    const forecastJson = await forecastRes.json()

    /**
     * 날짜별 집계
     * - 최저/최고 기온
     * - 오전(00~12) 아이콘 1개
     * - 오후(13~24) 아이콘 1개
     */
    const byDate: Record<string, DayAgg> = {}

    for (const item of forecastJson.list) {
        const [date, time] = item.dt_txt.split(" ")
        const hour = Number(time.split(":")[0])

        const temp = item.main.temp
        const iconCode = item.weather[0].icon

        if (!byDate[date]) {
            byDate[date] = {
                min: temp,
                max: temp,
            }
        }

        const day = byDate[date]

        day.min = Math.min(day.min, temp)
        day.max = Math.max(day.max, temp)

        // 00 ~ 12 아이콘
        if (hour <= 12 && !day.iconAM) {
            day.iconAM = iconCode
        }

        // 13 ~ 24 아이콘
        if (hour >= 13 && !day.iconPM) {
            day.iconPM = iconCode
        }
    }

    /**
     * Forecast 결과 생성
     * - 오늘 제외
     * - 최대 5일
     */
    const forecast: WeatherCardForecastItem[] = Object.entries(byDate)
        .slice(0, 5)
        .map(([date, v]) => {
            const d = new Date(date)
            return {
                date,
                weekday: weekdayKorean(d),
                minTemp: Math.round(v.min),
                maxTemp: Math.round(v.max),
                iconCodeAM: v.iconAM ?? "01d",
                iconCodePM: v.iconPM ?? "01n",
            }
        })
        .slice(1)

    const payload: WeatherCardData = {
        location: resolvedLocation ?? current.name,
        temperature: Math.round(current.main.temp),
        feelsLike: Math.round(current.main.feels_like),
        minTemp: Math.round(current.main.temp_min),
        maxTemp: Math.round(current.main.temp_max),
        condition: toCondition(current.weather[0].main),
        iconCode: current.weather[0].icon,
        forecast,
    }

    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=600",
        },
    })
}
