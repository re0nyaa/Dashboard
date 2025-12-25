import { useEffect, useState } from "react"
import { fetchWeather, type WeatherCardData } from "../utils/weather"
import { FaLocationDot } from "react-icons/fa6"

function LargeWeatherIcon({ iconCode }: { iconCode?: string }) {
    if (iconCode) {
        return <OWIcon icon={iconCode} size={180} />
    }
    return null
}

function SmallWeatherIcon({ iconCode }: { iconCode?: string }) {
    if (iconCode) {
        return <OWIcon icon={iconCode} size={48} />
    }
    return null
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

export function WeatherWidget() {
    const [data, setData] = useState<WeatherCardData | null>(null)

    useEffect(() => {
        let cancelled = false

        const autoLocationRaw =
            (import.meta as any).env?.VITE_LOCATION_AUTO ??
            (import.meta as any).env?.LOCATION_AUTO
        const autoLocation =
            String(autoLocationRaw ?? "")
                .trim()
                .toLowerCase() === "true"

        const getCoords = () =>
            new Promise<{ lat: number; lon: number } | null>((resolve) => {
                if (!("geolocation" in navigator)) return resolve(null)

                navigator.geolocation.getCurrentPosition(
                    (pos) =>
                        resolve({
                            lat: pos.coords.latitude,
                            lon: pos.coords.longitude,
                        }),
                    () => resolve(null),
                    {
                        enableHighAccuracy: false,
                        timeout: 6000,
                        maximumAge: 10 * 60 * 1000,
                    }
                )
            })

        const readCachedCoords = (): { lat: number; lon: number } | null => {
            try {
                const raw = localStorage.getItem("weather:lastCoords")
                if (!raw) return null
                const parsed = JSON.parse(raw) as {
                    lat?: unknown
                    lon?: unknown
                    ts?: unknown
                }
                const lat = Number(parsed.lat)
                const lon = Number(parsed.lon)
                const ts = Number(parsed.ts)
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
                if (!Number.isFinite(ts)) return { lat, lon }

                // 10분 이내 좌표만 즉시 사용
                if (Date.now() - ts > 10 * 60 * 1000) return null
                return { lat, lon }
            } catch {
                return null
            }
        }

        const writeCachedCoords = (coords: { lat: number; lon: number }) => {
            try {
                localStorage.setItem(
                    "weather:lastCoords",
                    JSON.stringify({ ...coords, ts: Date.now() })
                )
            } catch {
                // ignore
            }
        }

        const load = async () => {
            if (autoLocation) {
                // 1) 캐시된 좌표가 있으면 즉시 사용
                const cached = readCachedCoords()
                if (cached) {
                    const next = await fetchWeather(cached)
                    if (!cancelled && next) setData(next)
                } else {
                    // 2) 서버 env fallback이 있으면 먼저 한 번 로드 (지오로케이션 대기 없이)
                    const base = await fetchWeather()
                    if (!cancelled && base) setData(base)
                }

                // 3) 백그라운드로 현재 위치를 받아서 최신 좌표로 갱신
                const coords = await getCoords()
                if (!coords) return
                writeCachedCoords(coords)
                const next = await fetchWeather(coords)
                if (!cancelled) setData(next)
                return
            }

            const next = await fetchWeather()
            if (!cancelled) setData(next)
        }

        load()
        const interval = window.setInterval(load, 30 * 60 * 1000)
        return () => {
            cancelled = true
            window.clearInterval(interval)
        }
    }, [])
    const location = data?.location ?? "알 수 없는 위치"
    const temperature = data?.temperature ?? 0
    const condition = data?.condition ?? "정보 없음"
    const minTemp = data?.minTemp ?? temperature
    const maxTemp = data?.maxTemp ?? temperature
    const feelsLike = data?.feelsLike ?? temperature
    const forecast = (data?.forecast ?? []).slice(0, 4)

    const gradientMap: Record<string, [string, string]> = {
        맑음: ["#538FFF", "#C7DBFF"],
        흐림: ["#8A94A6", "#D1D6DE"],
        비: ["#4A6FA5", "#AFC4DE"],
        눈: ["#D9D9D9", "#B7D6E3"],
        뇌우: ["#3B3F58", "#8A90B2"],
        안개: ["#7FAFD1", "#D6E4F0"],
    }

    const [fromHex, toHex] = gradientMap[condition] ?? ["#38BDF8", "#DBEAFE"]

    const isNight = data?.iconCode?.endsWith("n")

    let finalFrom = fromHex
    let finalTo = toHex

    if (isNight) {
        const fromHsl = hexToHsl(fromHex)
        const toHsl = hexToHsl(toHex)

        finalFrom = hslToHex(
            fromHsl.h,
            Math.max(fromHsl.s - 25, 0),
            Math.max(fromHsl.l - 40, 8)
        )

        finalTo = hslToHex(
            toHsl.h,
            Math.max(toHsl.s - 30, 0),
            Math.max(toHsl.l - 30, 12)
        )
    }

    return (
        <div className="w-[860px] h-[440px] rounded-[60px] overflow-hidden relative">
            {/* Background */}
            <div
                className="absolute inset-0"
                style={{
                    background: `linear-gradient(135deg, ${finalFrom}, ${finalTo})`,
                }}
            />

            <div className="relative h-full w-full px-[56px] py-[44px] flex">
                {/* Left */}
                <div className="w-[340px] h-full flex flex-col relative">
                    <div className="absolute -top-[45px] right-[0px]">
                        <LargeWeatherIcon iconCode={data?.iconCode} />
                    </div>

                    <div className="flex-1 flex flex-col justify-center">
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

                    <div className="text-gray-300 text-[18px] font-bold leading-tight flex items-center gap-2 mt-auto">
                        <FaLocationDot />
                        {location}
                    </div>
                </div>

                {/* Right */}
                <div className="flex-1 pl-[40px] flex flex-col justify-center">
                    {forecast.length === 0 ? (
                        <div className="text-white/90 text-[28px] font-bold">
                            날씨 정보를 불러오는 중...
                        </div>
                    ) : (
                        forecast.map((f, idx) => (
                            <div key={`${f.date}-${idx}`}>
                                <div className="grid grid-cols-[110px_100px_1fr] items-center py-[22px]">
                                    <div className="text-white text-[34px] font-black">
                                        {f.weekday}
                                    </div>

                                    <div className="flex justify-center">
                                        <SmallWeatherIcon
                                            iconCode={f.iconCodeAM}
                                        />
                                        <SmallWeatherIcon
                                            iconCode={f.iconCodePM}
                                        />
                                    </div>

                                    <div className="text-right text-white text-[34px] font-bold pr-[12px]">
                                        {f.maxTemp}° {f.minTemp}°
                                    </div>
                                </div>

                                {idx !== forecast.length - 1 && (
                                    <div className="h-[2px] bg-white/45" />
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}

/* ---------- Color Utils ---------- */

function hexToHsl(hex: string) {
    hex = hex.replace("#", "")
    if (hex.length === 3) {
        hex = hex
            .split("")
            .map((c) => c + c)
            .join("")
    }

    const r = parseInt(hex.slice(0, 2), 16) / 255
    const g = parseInt(hex.slice(2, 4), 16) / 255
    const b = parseInt(hex.slice(4, 6), 16) / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min

    let h = 0
    let s = 0
    const l = (max + min) / 2

    if (delta !== 0) {
        s = delta / (1 - Math.abs(2 * l - 1))

        switch (max) {
            case r:
                h = ((g - b) / delta) % 6
                break
            case g:
                h = (b - r) / delta + 2
                break
            case b:
                h = (r - g) / delta + 4
                break
        }

        h *= 60
        if (h < 0) h += 360
    }

    return {
        h: Math.round(h),
        s: Math.round(s * 100),
        l: Math.round(l * 100),
    }
}

function hslToHex(h: number, s: number, l: number) {
    s /= 100
    l /= 100

    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2

    let r = 0,
        g = 0,
        b = 0

    if (h < 60) [r, g, b] = [c, x, 0]
    else if (h < 120) [r, g, b] = [x, c, 0]
    else if (h < 180) [r, g, b] = [0, c, x]
    else if (h < 240) [r, g, b] = [0, x, c]
    else if (h < 300) [r, g, b] = [x, 0, c]
    else [r, g, b] = [c, 0, x]

    const toHex = (n: number) =>
        Math.round((n + m) * 255)
            .toString(16)
            .padStart(2, "0")

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
