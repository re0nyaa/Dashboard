export type WeatherIconKey = "sun" | "partly" | "cloud" | "rain" | "snow"

export type WeatherCardForecastItem = {
    date: string
    weekday: string
    minTemp: number
    maxTemp: number
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
    iconCode: string
}

export async function fetchKMAWeather(): Promise<WeatherCardData | null> {
    try {
        const response = await fetch("/api/weather")
        if (!response.ok) return null
        const data = (await response.json()) as WeatherCardData
        if (!data || typeof data !== "object") return null
        return data
    } catch (error) {
        console.error("Error fetching KMA weather:", error)
        return null
    }
}
