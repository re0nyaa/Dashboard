export type WeatherCardForecastItem = {
    date: string
    weekday: string
    minTemp: number
    maxTemp: number
    iconCodeAM: string
    iconCodePM: string
}

export type WeatherCardHourlyItem = {
    dt: string // ISO timestamp
    temp: number
    pop: number
    iconCode: string
}

export type WeatherCardData = {
    location: string
    temperature: number
    condition: string
    feelsLike: number
    minTemp: number
    maxTemp: number
    forecast: WeatherCardForecastItem[]
    hourly?: WeatherCardHourlyItem[]
    iconCode: string
    lastUpdated: string
}

export type LocationPreference =
    | { mode: "auto" }
    | { mode: "manual"; name: string; lat: number; lon: number }

export type LocationSearchResult = {
    name: string
    lat: number
    lon: number
}

const LOCATION_PREF_KEY = "dashboard.weather.location.v1"

export function getLocationPreference(): LocationPreference {
    if (typeof window === "undefined") return { mode: "auto" }
    try {
        const raw = localStorage.getItem(LOCATION_PREF_KEY)
        if (!raw) return { mode: "auto" }
        const parsed = JSON.parse(raw) as Partial<LocationPreference>
        if (
            parsed.mode === "manual" &&
            typeof parsed.name === "string" &&
            typeof parsed.lat === "number" &&
            typeof parsed.lon === "number" &&
            Number.isFinite(parsed.lat) &&
            Number.isFinite(parsed.lon)
        ) {
            return {
                mode: "manual",
                name: parsed.name,
                lat: parsed.lat,
                lon: parsed.lon,
            }
        }
    } catch {
        // ignore
    }
    return { mode: "auto" }
}

export function setLocationPreference(pref: LocationPreference): void {
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(LOCATION_PREF_KEY, JSON.stringify(pref))
        window.dispatchEvent(new Event("dashboard:location-changed"))
    } catch {
        // ignore
    }
}

export async function searchLocations(query: string): Promise<LocationSearchResult[]> {
    const q = query.trim()
    if (!q) return []
    try {
        const url = new URL("/api/weather", window.location.origin)
        url.searchParams.set("search", q)
        const res = await fetch(url.toString(), { cache: "no-store" })
        if (!res.ok) return []
        const data = (await res.json()) as unknown
        return Array.isArray(data) ? (data as LocationSearchResult[]) : []
    } catch {
        return []
    }
}

export async function fetchWeather(
    coords?: { lat: number; lon: number },
    force = false
): Promise<WeatherCardData | null> {
    try {
        const url = new URL("/api/weather", window.location.origin)
        if (coords) {
            url.searchParams.set("lat", String(coords.lat))
            url.searchParams.set("lon", String(coords.lon))
        }
        if (force) url.searchParams.set("update", "1")

        const response = await fetch(url.toString())
        if (!response.ok) return null
        const data = (await response.json()) as WeatherCardData
        if (!data || typeof data !== "object") return null
        return data
    } catch (error) {
        console.error("Error fetching weather:", error)
        return null
    }
}
