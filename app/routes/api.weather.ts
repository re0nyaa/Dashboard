import type {
    WeatherCardData,
    WeatherCardForecastItem,
    WeatherIconKey,
} from "../utils/weather"

const OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5"

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
        case "Snow":
            return "눈"
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
    iconCode: string
}

export async function loader() {
    const apiKey = process.env.OPENWEATHER_API_KEY
    if (!apiKey) {
        return new Response("Missing OPENWEATHER_API_KEY", { status: 500 })
    }

    // 서울 좌표
    const lat = 37.5665
    const lon = 126.978

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
     */
    const byDate: Record<string, DayAgg> = {}

    for (const item of forecastJson.list) {
        const date = item.dt_txt.split(" ")[0]
        const temp = item.main.temp
        const iconCode = item.weather[0].icon

        if (!byDate[date]) {
            byDate[date] = {
                min: temp,
                max: temp,
                iconCode,
            }
        } else {
            byDate[date].min = Math.min(byDate[date].min, temp)
            byDate[date].max = Math.max(byDate[date].max, temp)
            byDate[date].iconCode = byDate[date].iconCode
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
                iconCode: v.iconCode,
            }
        })
        .slice(1)

    const payload: WeatherCardData = {
        location: current.name,
        temperature: Math.round(current.main.temp),
        feelsLike: Math.round(current.main.feels_like),
        minTemp: Math.round(current.main.temp_min),
        maxTemp: Math.round(current.main.temp_max),
        condition: toCondition(current.weather[0].main),
        forecast,
        iconCode: current.weather[0].icon,
    }

    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=600",
        },
    })
}
