import type { WeatherCardData, WeatherCardForecastItem } from "../utils/weather"

const OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5"
const OPENWEATHER_GEO_BASE = "https://api.openweathermap.org/geo/1.0"

const WEATHER_CACHE_TTL_MS = 60 * 1000
const LOCATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000

const weatherCache = new Map<string, { expiresAt: number; payload: WeatherCardData }>()

const locationCache = new Map<string, { expiresAt: number; location: string }>()

function cacheKeyForLatLon(lat: number, lon: number) {
    return `${lat.toFixed(3)},${lon.toFixed(3)}`
}

async function fetchWithTimeout(
    url: string,
    init: RequestInit | undefined,
    timeoutMs: number
): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
        return await fetch(url, { ...init, signal: controller.signal })
    } finally {
        clearTimeout(timeoutId)
    }
}

function delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function resolveLocationFast(
    lat: number,
    lon: number,
    apiKey: string
): Promise<string | undefined> {
    const key = cacheKeyForLatLon(lat, lon)
    const cached = locationCache.get(key)
    if (cached && cached.expiresAt > Date.now()) return cached.location

    try {
        const owReverseRes = await fetchWithTimeout(
            `${OPENWEATHER_GEO_BASE}/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${apiKey}`,
            undefined,
            900
        )
        if (owReverseRes.ok) {
            const owJson = (await owReverseRes.json()) as OpenWeatherReverseGeoItem[]
            if (Array.isArray(owJson) && owJson.length > 0) {
                const loc = formatLocationFromOpenWeatherGeo(owJson[0])
                if (loc) {
                    locationCache.set(key, {
                        expiresAt: Date.now() + LOCATION_CACHE_TTL_MS,
                        location: loc,
                    })
                    return loc
                }
            }
        }
    } catch {
        // ignore
    }

    return undefined
}

type OpenWeatherReverseGeoItem = {
    name?: string
    local_names?: Record<string, string>
    country?: string
    state?: string
}

function formatLocationFromOpenWeatherGeo(item: OpenWeatherReverseGeoItem): string | undefined {
    const place = (item.local_names?.ko ?? item.name ?? "").trim()
    if (!place) return undefined

    const state = (item.state ?? "").trim()
    if (state && state !== place) return `${state} ${place}`
    return place
}

function toCondition(main: string, cloudiness?: number): string {
    switch (main) {
        case "Clear":
            return "맑음"
        case "Clouds": {
            if (cloudiness === undefined) return "흐림"
            if (cloudiness <= 50) return "구름 약간"
            if (cloudiness <= 84) return "구름 많음"
            return "흐림"
        }
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
            return "안개"
        default:
            return main
    }
}

function weekdayKorean(date: Date) {
    return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()] + "요일"
}

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

    const latEnv = toFiniteNumber(process.env.LOCATION_LAT ?? process.env.VITE_LOCATION_LAT ?? null)
    const lonEnv = toFiniteNumber(process.env.LOCATION_LON ?? process.env.VITE_LOCATION_LON ?? null)

    const lat = latParam || latEnv
    const lon = lonParam || lonEnv

    if (lat === undefined || lon === undefined) {
        return new Response(
            "Missing location. Provide ?lat=...&lon=... or set LOCATION_LAT/LOCATION_LON",
            { status: 400 }
        )
    }

    const key = cacheKeyForLatLon(lat, lon)
    const cachedWeather = weatherCache.get(key)
    if (cachedWeather && cachedWeather.expiresAt > Date.now()) {
        return new Response(JSON.stringify(cachedWeather.payload), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "public, max-age=600",
            },
        })
    }

    const locationPromise = resolveLocationFast(lat, lon, apiKey)

    const currentUrl = `${OPENWEATHER_BASE}/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=kr`
    const forecastUrl = `${OPENWEATHER_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=kr`

    const [currentRes, forecastRes] = await Promise.all([
        fetchWithTimeout(currentUrl, undefined, 3500),
        fetchWithTimeout(forecastUrl, undefined, 3500),
    ])

    if (!currentRes.ok) throw new Error("Current weather fetch failed")
    if (!forecastRes.ok) throw new Error("Forecast fetch failed")

    const [current, forecastJson] = await Promise.all([currentRes.json(), forecastRes.json()])

    const byDate: Record<string, DayAgg> = {}
    const hourlyArray: { dt: string; temp: number; pop: number; iconCode: string }[] = []

    const nowDate = new Date()
    const tomorrowEnd = new Date(nowDate)
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 2)

    for (const item of forecastJson.list) {
        const [date, time] = item.dt_txt.split(" ")
        const hour = Number(time.split(":")[0])

        const temp = item.main.temp
        const iconCode = item.weather[0].icon

        const itemDate = new Date(item.dt_txt)
        if (itemDate >= nowDate && itemDate < tomorrowEnd) {
            hourlyArray.push({ dt: item.dt_txt, temp, pop: item.pop ?? 0, iconCode })
        }

        if (!byDate[date]) {
            byDate[date] = {
                min: temp,
                max: temp,
            }
        }

        const day = byDate[date]
        const pop = item.pop ?? 0
        const rain = item.rain?.["3h"] ?? item.snow?.["3h"] ?? 0

        day.min = Math.min(day.min, temp)
        day.max = Math.max(day.max, temp)

        if (hour <= 12 && !day.iconAM) {
            day.iconAM = iconCode
        }

        if (hour >= 13 && !day.iconPM) {
            day.iconPM = iconCode
        }
    }

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

    let resolvedLocation: string | undefined = undefined
    try {
        resolvedLocation = await Promise.race([locationPromise, delay(250).then(() => undefined)])
    } catch {
        resolvedLocation = undefined
    }

    const payload: WeatherCardData = {
        location: resolvedLocation ?? current.name,
        temperature: Math.round(current.main.temp),
        feelsLike: Math.round(current.main.feels_like),
        minTemp: Math.round(current.main.temp_min),
        maxTemp: Math.round(current.main.temp_max),
        condition: toCondition(current.weather[0].main, current.clouds?.all),
        iconCode: current.weather[0].icon,
        forecast,
        hourly: hourlyArray,
    }

    weatherCache.set(key, {
        expiresAt: Date.now() + WEATHER_CACHE_TTL_MS,
        payload,
    })

    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=600",
        },
    })
}
