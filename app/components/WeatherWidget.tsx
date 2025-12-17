import { useEffect, useState } from "react"
import {
    fetchKMAWeather,
    type WeatherCardData,
    type WeatherIconKey,
} from "../utils/weather"

function LargeWeatherIcon({ icon }: { icon: WeatherIconKey }) {
    if (icon === "snow") {
        return (
            <div className="relative">
                <SnowIcon className="w-[120px] h-[120px] text-white" />
                <CloudIcon className="absolute -right-6 top-6 w-[140px] h-[140px] text-white" />
            </div>
        )
    }

    if (icon === "partly") {
        return (
            <div className="relative">
                <SunIcon className="w-[120px] h-[120px] text-white" />
                <CloudIcon className="absolute -right-6 top-6 w-[140px] h-[140px] text-white" />
            </div>
        )
    }

    if (icon === "sun") {
        return <SunIcon className="w-[150px] h-[150px] text-white" />
    }

    return <CloudIcon className="w-[150px] h-[150px] text-white" />
}

function CloudIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 64 64"
            fill="none"
            className={className}
            aria-hidden="true"
        >
            <path
                d="M22 48h26c6.6 0 12-5.4 12-12 0-6-4.4-11-10.2-11.9C48.3 16.9 41.6 12 34 12c-7.9 0-14.8 5.3-16.7 12.8C10.2 26 4 31.9 4 39.2 4 44.1 8 48 13 48h9Z"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

function SunIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 64 64"
            fill="none"
            className={className}
            aria-hidden="true"
        >
            <circle
                cx="32"
                cy="32"
                r="12"
                stroke="currentColor"
                strokeWidth="6"
            />
            <path
                d="M32 6v8M32 50v8M6 32h8M50 32h8M13 13l6 6M45 45l6 6M51 13l-6 6M19 45l-6 6"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
            />
        </svg>
    )
}

function SnowIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 64 64"
            fill="none"
            className={className}
            aria-hidden="true"
        >
            <path
                d="M32 8v48M16 16l32 32M48 16L16 48M10 32h44"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
            />
        </svg>
    )
}

function SmallWeatherIcon({ icon }: { icon: WeatherIconKey }) {
    if (icon === "snow") {
        return (
            <div className="flex items-center gap-2">
                <SnowIcon className="w-[34px] h-[34px] text-white/95" />
                <CloudIcon className="w-[40px] h-[40px] text-white/95" />
            </div>
        )
    }

    if (icon === "partly") {
        return (
            <div className="flex items-center gap-2">
                <SunIcon className="w-[30px] h-[30px] text-white/95" />
                <CloudIcon className="w-[40px] h-[40px] text-white/95" />
            </div>
        )
    }

    if (icon === "sun") {
        return <SunIcon className="w-[40px] h-[40px] text-white/95" />
    }

    return <CloudIcon className="w-[44px] h-[44px] text-white/95" />
}

export function WeatherWidget() {
    const [data, setData] = useState<WeatherCardData | null>(null)

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            const next = await fetchKMAWeather()
            if (cancelled) return
            setData(next)
        }

        load()
        const interval = window.setInterval(load, 30 * 60 * 1000)
        return () => {
            cancelled = true
            window.clearInterval(interval)
        }
    }, [])

    const temperature = data?.temperature ?? 6
    const condition = data?.condition ?? "흐림"
    const minTemp = data?.minTemp ?? -4
    const maxTemp = data?.maxTemp ?? 8
    const feelsLike = data?.feelsLike ?? temperature

    const forecast = (data?.forecast ?? []).slice(0, 3)
    const mainIcon: WeatherIconKey = condition.includes("눈")
        ? "snow"
        : condition.includes("비")
        ? "rain"
        : condition.includes("맑")
        ? "sun"
        : condition.includes("구름")
        ? "partly"
        : "cloud"

    return (
        <div className="w-[860px] h-[440px] rounded-[60px] overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-sky-400 to-blue-100" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-white/0" />

            <div className="relative h-full w-full px-[56px] py-[44px] flex">
                <div className="w-[340px] flex flex-col justify-center relative">
                    <div className="absolute -top-[10px] right-[20px]">
                        <LargeWeatherIcon icon={mainIcon} />
                    </div>

                    <div>
                        <div className="text-white text-[96px] font-black leading-none tracking-tight">
                            {temperature}°
                        </div>

                        <div className="mt-[6px] text-white/95 text-[44px] font-black leading-none">
                            {condition}
                        </div>

                        <div className="mt-[34px] text-white/90 text-[32px] font-bold leading-tight">
                            ↑ {maxTemp}° / ↓ {minTemp}°
                        </div>

                        <div className="text-white/90 text-[32px] font-bold leading-tight">
                            체감온도 {feelsLike}°
                        </div>
                    </div>
                </div>

                {/* Right */}
                <div className="flex-1 pl-[40px] flex flex-col justify-center">
                    <div className="flex flex-col">
                        {forecast.map((f, idx) => (
                            <div key={`${f.date}-${idx}`}>
                                <div className="flex items-center justify-between py-[22px]">
                                    <div className="text-white text-[34px] font-black">
                                        {f.weekday}
                                    </div>

                                    <div className="flex items-center gap-[18px]">
                                        <SmallWeatherIcon icon={f.icon} />
                                        <div className="text-white text-[34px] font-bold">
                                            {f.maxTemp}° {f.minTemp}°
                                        </div>
                                    </div>
                                </div>

                                {idx !== forecast.length - 1 ? (
                                    <div className="h-[2px] bg-white/45" />
                                ) : null}
                            </div>
                        ))}

                        {forecast.length === 0 ? (
                            <div className="text-white/90 text-[28px] font-bold">
                                날씨 정보를 불러오는 중...
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    )
}
