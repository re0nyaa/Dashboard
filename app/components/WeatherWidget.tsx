import { useEffect, useState } from "react"
import {
    fetchKMAWeather,
    type WeatherCardData,
    type WeatherIconKey,
} from "../utils/weather"

function LargeWeatherIcon({ iconCode }: { iconCode?: string }) {
    if (iconCode) {
        return <OWIcon icon={iconCode} size={180} />
    }
}

function OWIcon({ icon, size = 150 }: { icon: string; size?: number }) {
    return (
        <img
            src={`https://openweathermap.org/img/wn/${icon}@4x.png`}
            width={size}
            height={size}
            alt=""
            draggable={false}
        />
    )
}

function SmallWeatherIcon({ iconCode }: { iconCode?: string }) {
    if (iconCode) {
        return <OWIcon icon={iconCode} size={48} />
    }
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
                        <LargeWeatherIcon iconCode={data?.iconCode} />
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
                                        <SmallWeatherIcon
                                            iconCode={f.iconCode}
                                        />
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
