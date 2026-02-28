import { useEffect, useState, useRef, useCallback } from "react"
import { fetchWeather, type WeatherCardData } from "../utils/weather"
import { FaLocationDot } from "react-icons/fa6"
import { FaRedoAlt } from "react-icons/fa"

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
    return <img src={`/weather/${icon}.svg`} width={size} height={size} alt="" draggable={false} />
}

export function WeatherWidget() {
    const [data, setData] = useState<WeatherCardData | null>(null)
    const [showDetail, setShowDetail] = useState(false)

    const isCancelledRef = useRef(false)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    const [isRefreshing, setIsRefreshing] = useState(false)

    const autoLocationRaw =
        (import.meta as any).env?.VITE_LOCATION_AUTO ?? (import.meta as any).env?.LOCATION_AUTO
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

    const load = useCallback(async (force = false) => {
        if (autoLocation) {
            const cached = readCachedCoords()
            if (cached) {
                const next = await fetchWeather(cached, force)
                if (!isCancelledRef.current && next) {
                    setData(next)
                    setLastUpdated(new Date())
                }
            } else {
                const base = await fetchWeather(undefined, force)
                if (!isCancelledRef.current && base) {
                    setData(base)
                    setLastUpdated(new Date())
                }
            }

            const coords = await getCoords()
            if (!coords) return
            writeCachedCoords(coords)
            const next = await fetchWeather(coords, force)
            if (!isCancelledRef.current && next) {
                setData(next)
                setLastUpdated(new Date())
            }
            return
        }

        const next = await fetchWeather(undefined, force)
        if (!isCancelledRef.current && next) {
            setData(next)
            setLastUpdated(new Date())
        }
    }, [])

    useEffect(() => {
        isCancelledRef.current = false
        load()
        const interval = window.setInterval(() => load(false), 30 * 60 * 1000)
        return () => {
            isCancelledRef.current = true
            window.clearInterval(interval)
        }
    }, [load])
    const location = data?.location ?? "알 수 없는 위치"
    const temperature = data?.temperature ?? 0
    const condition = data?.condition ?? "정보 없음"
    const minTemp = data?.minTemp ?? temperature
    const maxTemp = data?.maxTemp ?? temperature
    const feelsLike = data?.feelsLike ?? temperature
    const forecast = (data?.forecast ?? []).slice(0, 4)
    const hourly = data?.hourly ?? []

    const gradientMap: Record<string, [string, string]> = {
        맑음: ["#538FFF", "#C7DBFF"],
        흐림: ["#8A94A6", "#D1D6DE"],
        비: ["#4A6FA5", "#AFC4DE"],
        눈: ["#D9D9D9", "#B7D6E3"],
        뇌우: ["#3B3F58", "#8A90B2"],
        안개: ["#7FAFD1", "#D6E4F0"],
        "구름 약간": ["#7FAFD1", "#D6E4F0"],
        "구름 많음": ["#7FAFD1", "#D6E4F0"],
    }

    const [fromHex, toHex] = gradientMap[condition] ?? ["#38BDF8", "#DBEAFE"]

    const isNight = data?.iconCode?.endsWith("n")

    let finalFrom = fromHex
    let finalTo = toHex

    if (isNight) {
        const fromHsl = hexToHsl(fromHex)
        const toHsl = hexToHsl(toHex)

        finalFrom = hslToHex(fromHsl.h, Math.max(fromHsl.s - 25, 0), Math.max(fromHsl.l - 40, 8))

        finalTo = hslToHex(toHsl.h, Math.max(toHsl.s - 30, 0), Math.max(toHsl.l - 30, 12))
    }

    const formatTime = (d: Date) =>
        d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "numeric" })

    return (
        <div className="relative w-[860px] h-[440px]">
            <div
                onClick={() => setShowDetail(true)}
                className={`
        absolute inset-0 rounded-[60px] overflow-hidden cursor-pointer
        transition-opacity duration-200 ease-out
        ${showDetail ? "opacity-0 pointer-events-none" : "opacity-100"}
    `}
            >
                <div
                    className="absolute inset-0"
                    style={{
                        background: `linear-gradient(135deg, ${finalFrom}, ${finalTo})`,
                    }}
                />
                <div className="relative h-full w-full px-[56px] py-[44px] flex">
                    <div className="absolute top-[10px] right-[10px]">
                        <div className="animate-[float-slow_5s_ease-in-out_infinite]">
                            <LargeWeatherIcon iconCode={data?.iconCode} />
                        </div>
                    </div>
                    <div
                        className="absolute top-[10px] right-[40px] flex items-center gap-2"
                        onClick={async (e) => {
                            e.stopPropagation()
                            setIsRefreshing(true)
                            try {
                                await load(true)
                            } catch (err) {
                                console.error(err)
                            } finally {
                                setTimeout(() => setIsRefreshing(false), 700)
                            }
                        }}
                    >
                        <span>{lastUpdated ? formatTime(lastUpdated) : "업데이트 없음"}</span>
                        <FaRedoAlt className={isRefreshing ? "animate-[spin_700ms_linear]" : ""} />
                    </div>
                    <div className="mt-[40px] flex-1 flex flex-col justify-center">
                        <div className="text-white text-[96px] font-black leading-none tracking-tight">
                            {temperature}°
                        </div>

                        <div className="mt-[6px] text-white/95 text-[46px] font-black leading-none">
                            {condition}
                        </div>
                        <div className="text-gray-300 text-[18px] font-bold flex items-center gap-2">
                            {location}
                        </div>
                        <div className="flex mt-4 items-center">
                            {hourly.slice(0, 8).map(({ dt, temp, pop, iconCode }, idx) => (
                                <div key={idx} className="flex flex-col items-center text-center">
                                    <div className="text-[24px] font-bold ">
                                        {dt.split(" ")[1].slice(0, 2)}
                                    </div>

                                    <LargeWeatherIcon iconCode={iconCode} />

                                    <div className="text-[22px] font-bold">{Math.round(temp)}°</div>
                                    <div className="text-[18px] font-bold text-gray-300">{`${Math.round(pop * 100)}%`}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div
                onClick={() => setShowDetail(false)}
                className={`
        absolute inset-0 rounded-[60px] overflow-hidden cursor-pointer
        transition-all duration-250 ease-out
        ${
            showDetail
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-[4px] pointer-events-none"
        }
    `}
            >
                <div
                    className="absolute inset-0"
                    style={{
                        background: `linear-gradient(135deg, ${finalFrom}, ${finalTo})`,
                    }}
                />
                <div className="relative h-full w-full px-[56px] py-[44px] flex">
                    <div className="w-[340px] h-full flex flex-col relative">
                        <div className="absolute -top-[45px] right-[0px]">
                            <div className="animate-[float-slow_5s_ease-in-out_infinite]">
                                <LargeWeatherIcon iconCode={data?.iconCode} />
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col justify-center">
                            <div className="text-white text-[96px] font-black leading-none tracking-tight">
                                {temperature}°
                            </div>

                            <div className="mt-[6px] text-white/95 text-[46px] font-black leading-none">
                                {condition}
                            </div>

                            <div className="mt-[34px] text-white/90 text-[28px] font-bold leading-tight">
                                ↑ {maxTemp}° / ↓ {minTemp}°
                            </div>

                            <div className="text-white/90 text-[28px] font-bold leading-tight">
                                체감온도 {feelsLike}°
                            </div>
                        </div>

                        <div className="text-gray-300 text-[18px] font-bold leading-tight flex items-center gap-2 mt-auto">
                            <FaLocationDot />
                            {location}
                        </div>
                    </div>

                    <div className="flex-1 pl-[40px] flex flex-col justify-center">
                        <div
                            className="absolute top-[10px] right-[40px] flex items-center gap-2"
                            onClick={async (e) => {
                                e.stopPropagation()
                                setIsRefreshing(true)
                                try {
                                    await load(true)
                                } catch (err) {
                                    console.error(err)
                                } finally {
                                    setTimeout(() => setIsRefreshing(false), 700)
                                }
                            }}
                        >
                            <span>{lastUpdated ? formatTime(lastUpdated) : "업데이트 없음"}</span>
                            <FaRedoAlt
                                className={isRefreshing ? "animate-[spin_700ms_linear]" : ""}
                            />
                        </div>
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
                                            <SmallWeatherIcon iconCode={f.iconCodeAM} />
                                            <SmallWeatherIcon iconCode={f.iconCodePM} />
                                        </div>

                                        <div className="text-right text-white text-[34px] font-bold pr-[12px] flex flex-col items-end">
                                            <span>
                                                {f.maxTemp}° {f.minTemp}°
                                            </span>
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
        </div>
    )
}

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
// function getWeatherDescription({
//     condition,
//     temperature,
//     feelsLike,
//     minTemp,
//     maxTemp,
//     iconCode,
// }: {
//     condition: string
//     temperature: number
//     feelsLike: number
//     minTemp: number
//     maxTemp: number
//     iconCode?: string
// }): string {
//     // 시간대 판별 (오전/오후/밤)
//     const hour = new Date().getHours()
//     const isNight = iconCode?.endsWith("n") || hour < 6 || hour >= 20
//     // 온도 범주
//     let tempDesc = ""
//     if (feelsLike >= 28) tempDesc = "무더운"
//     else if (feelsLike >= 23) tempDesc = "따뜻한"
//     else if (feelsLike >= 17) tempDesc = "선선한"
//     else if (feelsLike >= 10) tempDesc = "쌀쌀한"
//     else tempDesc = "추운"

//     // 날씨별 문장
//     switch (condition) {
//         case "맑음":
//             return isNight
//                 ? `오늘 밤은 하늘이 맑고 ${tempDesc} 밤이에요.`
//                 : `오늘은 하늘이 맑고 ${tempDesc} 날씨예요.`
//         case "흐림":
//         case "구름 많음":
//         case "구름 약간":
//             return isNight
//                 ? `오늘 밤은 구름이 많고 ${tempDesc} 밤이에요.`
//                 : `오늘은 구름이 많고 ${tempDesc} 날씨예요.`
//         case "비":
//             return `오늘은 비가 내리니 우산을 챙기세요.`
//         case "눈":
//             return `오늘은 눈이 내려 길이 미끄러울 수 있어요.`
//         case "뇌우":
//             return `오늘은 천둥번개가 칠 수 있으니 실내 활동을 추천해요.`
//         case "안개":
//             return `오늘은 안개가 껴서 가시거리가 짧아요. 운전 시 주의하세요.`
//         default:
//             return `오늘의 날씨는 ${condition}입니다.`
//     }
// }
