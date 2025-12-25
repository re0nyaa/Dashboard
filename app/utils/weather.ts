export type WeatherCardForecastItem = {
    date: string
    weekday: string
    minTemp: number
    maxTemp: number
    iconCodeAM: string
    iconCodePM: string
}

export type WeatherCardData = {
    location: string
    temperature: number
    condition: string
    feelsLike: number
    minTemp: number
    maxTemp: number
    forecast: WeatherCardForecastItem[]
    iconCode: string
}

export async function fetchWeather(coords?: {
    lat: number
    lon: number
}): Promise<WeatherCardData | null> {
    try {
        const url = new URL("/api/weather", window.location.origin)
        if (coords) {
            url.searchParams.set("lat", String(coords.lat))
            url.searchParams.set("lon", String(coords.lon))
        }

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
