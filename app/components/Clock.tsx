import { useEffect, useState } from "react"
import { motion } from "framer-motion"

export type ClockStyle = "flip" | "minimal" | "neon" | "analog"
export type ClockBackground =
    | "charcoal"
    | "oled"
    | "white"
    | "aurora"
    | "sunset"
    | "ocean"
    | "forest"
    | "custom"

export type CustomClockBackground = {
    mode: "solid" | "gradient"
    color1: string
    color2: string
    angle: number
}

export type ClockAppearance = {
    style: ClockStyle
    background: ClockBackground
    customBg: CustomClockBackground
    showSeconds: boolean
}

export const CLOCK_STYLES: { id: ClockStyle; label: string }[] = [
    { id: "flip", label: "플립" },
    { id: "minimal", label: "모던" },
    { id: "neon", label: "네온" },
    { id: "analog", label: "아날로그" },
]

export const CLOCK_BACKGROUNDS: {
    id: Exclude<ClockBackground, "custom">
    label: string
    css: string
    swatch: string
    light?: boolean
}[] = [
    { id: "charcoal", label: "기본", css: "#1e1e1e", swatch: "#1e1e1e" },
    { id: "oled", label: "블랙", css: "#000000", swatch: "#000000" },
    { id: "white", label: "화이트", css: "#f5f5f7", swatch: "#f5f5f7", light: true },
    {
        id: "aurora",
        label: "오로라",
        css: "radial-gradient(circle at 20% 20%, #1e293b 0%, #0f172a 45%, #064e3b 100%)",
        swatch: "linear-gradient(135deg, #1e293b, #064e3b)",
    },
    {
        id: "sunset",
        label: "선셋",
        css: "radial-gradient(circle at 80% 20%, #7c2d12 0%, #3b0764 55%, #09090b 100%)",
        swatch: "linear-gradient(135deg, #9a3412, #3b0764)",
    },
    {
        id: "ocean",
        label: "오션",
        css: "radial-gradient(circle at 30% 80%, #0c4a6e 0%, #172554 55%, #020617 100%)",
        swatch: "linear-gradient(135deg, #0284c7, #172554)",
    },
    {
        id: "forest",
        label: "포레스트",
        css: "radial-gradient(circle at 75% 75%, #14532d 0%, #064e3b 45%, #090d0b 100%)",
        swatch: "linear-gradient(135deg, #15803d, #064e3b)",
    },
]

const CLOCK_APPEARANCE_KEY = "dashboard.clockAppearance.v1"
const DEFAULT_CUSTOM_BG: CustomClockBackground = {
    mode: "gradient",
    color1: "#1e1b4b",
    color2: "#0f172a",
    angle: 135,
}
const DEFAULT_APPEARANCE: ClockAppearance = {
    style: "flip",
    background: "charcoal",
    customBg: DEFAULT_CUSTOM_BG,
    showSeconds: true,
}

function hexLuminance(hex: string): number {
    const clean = hex.replace("#", "")
    if (clean.length !== 6) return 0
    const r = Number.parseInt(clean.slice(0, 2), 16) / 255
    const g = Number.parseInt(clean.slice(2, 4), 16) / 255
    const b = Number.parseInt(clean.slice(4, 6), 16) / 255
    return 0.299 * r + 0.587 * g + 0.114 * b
}

export function getClockBackgroundCss(appearance: ClockAppearance): string {
    if (appearance.background === "custom") {
        const { mode, color1, color2, angle } = appearance.customBg
        return mode === "gradient"
            ? `linear-gradient(${angle}deg, ${color1}, ${color2})`
            : color1
    }
    return CLOCK_BACKGROUNDS.find((b) => b.id === appearance.background)?.css ?? "#1e1e1e"
}

export function isLightClockAppearance(appearance: ClockAppearance): boolean {
    if (appearance.background === "custom") {
        const { mode, color1, color2 } = appearance.customBg
        const lum =
            mode === "gradient"
                ? (hexLuminance(color1) + hexLuminance(color2)) / 2
                : hexLuminance(color1)
        return lum > 0.62
    }
    return Boolean(CLOCK_BACKGROUNDS.find((b) => b.id === appearance.background)?.light)
}

export function getClockAppearance(): ClockAppearance {
    if (typeof window === "undefined") return DEFAULT_APPEARANCE
    try {
        const raw = localStorage.getItem(CLOCK_APPEARANCE_KEY)
        if (!raw) return DEFAULT_APPEARANCE
        const parsed = JSON.parse(raw) as Partial<ClockAppearance>
        const validStyle = CLOCK_STYLES.some((s) => s.id === parsed.style)
            ? (parsed.style as ClockStyle)
            : "flip"
        const validBg =
            parsed.background === "custom" ||
            CLOCK_BACKGROUNDS.some((b) => b.id === parsed.background)
                ? (parsed.background as ClockBackground)
                : "charcoal"
        const customBg: CustomClockBackground = {
            mode: parsed.customBg?.mode === "solid" ? "solid" : "gradient",
            color1:
                typeof parsed.customBg?.color1 === "string"
                    ? parsed.customBg.color1
                    : DEFAULT_CUSTOM_BG.color1,
            color2:
                typeof parsed.customBg?.color2 === "string"
                    ? parsed.customBg.color2
                    : DEFAULT_CUSTOM_BG.color2,
            angle:
                typeof parsed.customBg?.angle === "number"
                    ? parsed.customBg.angle
                    : DEFAULT_CUSTOM_BG.angle,
        }
        return {
            style: validStyle,
            background: validBg,
            customBg,
            showSeconds: typeof parsed.showSeconds === "boolean" ? parsed.showSeconds : true,
        }
    } catch {
        return DEFAULT_APPEARANCE
    }
}

export function setClockAppearance(patch: Partial<ClockAppearance>): ClockAppearance {
    const prev = getClockAppearance()
    const next: ClockAppearance = {
        ...prev,
        ...patch,
        customBg: patch.customBg ? { ...prev.customBg, ...patch.customBg } : prev.customBg,
    }
    if (typeof window !== "undefined") {
        try {
            localStorage.setItem(CLOCK_APPEARANCE_KEY, JSON.stringify(next))
            window.dispatchEvent(new Event("dashboard:clock-appearance"))
        } catch {
            // ignore
        }
    }
    return next
}

export function useClockAppearance(): ClockAppearance {
    const [appearance, setAppearance] = useState<ClockAppearance>(DEFAULT_APPEARANCE)

    useEffect(() => {
        setAppearance(getClockAppearance())
        const onChange = () => setAppearance(getClockAppearance())
        window.addEventListener("dashboard:clock-appearance", onChange)
        return () => window.removeEventListener("dashboard:clock-appearance", onChange)
    }, [])

    return appearance
}

interface FlipDigitProps {
    digit: string
    isLight?: boolean
}

const HALF_FLIP_DURATION = 0.18

function FlipDigit({ digit, isLight = false }: FlipDigitProps) {
    const [currentDigit, setCurrentDigit] = useState(digit)
    const [prevDigit, setPrevDigit] = useState(digit)
    const [flipKey, setFlipKey] = useState(0)
    const [isFlipping, setIsFlipping] = useState(false)

    useEffect(() => {
        if (digit === currentDigit) return

        setPrevDigit(currentDigit)
        setCurrentDigit(digit)
        setFlipKey((k) => k + 1)
        setIsFlipping(true)
    }, [digit, currentDigit])

    const halfBg = isLight ? "bg-white" : "bg-[#2c2c2e]"
    const flapBg = halfBg
    const digitText = isLight ? "text-zinc-900" : "text-white"
    const topShade = isLight
        ? "bg-gradient-to-b from-black/[0.03] to-transparent"
        : "bg-gradient-to-b from-white/10 to-transparent"
    const bottomShade = isLight
        ? "bg-gradient-to-t from-black/[0.06] to-transparent"
        : "bg-gradient-to-t from-black/25 to-transparent"

    return (
        <div
            className={`relative w-[28.09cqw] h-[35.95cqw] rounded-[3.37cqw] overflow-hidden shrink-0 backdrop-blur-md ${
                isLight
                    ? "ring-1 ring-black/10 shadow-[0_12px_36px_rgba(0,0,0,0.08)]"
                    : "ring-1 ring-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.25)]"
            }`}
            style={{ perspective: "900px" }}
        >
            {/* 정적 상단 (새 숫자) */}
            <div className="absolute top-0 left-0 right-0 h-1/2 overflow-hidden z-10 pointer-events-none">
                <div className={`absolute inset-0 ${halfBg}`} />
                <div className="absolute left-0 top-0 w-full h-[200%] flex items-center justify-center">
                    <span
                        className={`font-bold ${digitText} leading-none`}
                        style={{ fontSize: "18.54cqw" }}
                    >
                        {currentDigit}
                    </span>
                </div>
                <div className={`absolute inset-0 ${topShade}`} />
            </div>

            {/* 정적 하단 (플립 중에는 이전 숫자, 완료 후 새 숫자) */}
            <div className="absolute bottom-0 left-0 right-0 h-1/2 overflow-hidden z-10 pointer-events-none">
                <div className={`absolute inset-0 ${halfBg}`} />
                <div className="absolute left-0 bottom-0 w-full h-[200%] flex items-center justify-center">
                    <span
                        className={`font-bold ${digitText} leading-none`}
                        style={{ fontSize: "18.54cqw" }}
                    >
                        {isFlipping ? prevDigit : currentDigit}
                    </span>
                </div>
                <div className={`absolute inset-0 ${bottomShade}`} />
            </div>

            {/* 상단 플립 (이전 숫자 0 -> -90도) */}
            {isFlipping && (
                <motion.div
                    key={`top-${flipKey}`}
                    className="absolute top-0 left-0 right-0 h-1/2 overflow-hidden z-30 pointer-events-none"
                    initial={{ rotateX: 0 }}
                    animate={{ rotateX: -90 }}
                    transition={{
                        duration: HALF_FLIP_DURATION,
                        ease: "easeIn",
                    }}
                    style={{
                        transformOrigin: "center bottom",
                        backfaceVisibility: "hidden",
                    }}
                >
                    <div className={`absolute inset-0 ${flapBg}`} />
                    <div className="absolute left-0 top-0 w-full h-[200%] flex items-center justify-center">
                        <span
                            className={`font-bold ${digitText} leading-none`}
                            style={{ fontSize: "18.54cqw" }}
                        >
                            {prevDigit}
                        </span>
                    </div>
                    <div className={`absolute inset-0 ${topShade}`} />
                </motion.div>
            )}

            {/* 하단 플립 (새 숫자 90 -> 0도) */}
            {isFlipping && (
                <motion.div
                    key={`bottom-${flipKey}`}
                    className="absolute bottom-0 left-0 right-0 h-1/2 overflow-hidden z-30 pointer-events-none"
                    initial={{ rotateX: 90 }}
                    animate={{ rotateX: 0 }}
                    onAnimationComplete={() => setIsFlipping(false)}
                    transition={{
                        delay: HALF_FLIP_DURATION,
                        duration: HALF_FLIP_DURATION,
                        ease: "easeOut",
                    }}
                    style={{
                        transformOrigin: "center top",
                        backfaceVisibility: "hidden",
                    }}
                >
                    <div className={`absolute inset-0 ${flapBg}`} />
                    <div className="absolute left-0 bottom-0 w-full h-[200%] flex items-center justify-center">
                        <span
                            className={`font-bold ${digitText} leading-none`}
                            style={{ fontSize: "18.54cqw" }}
                        >
                            {currentDigit}
                        </span>
                    </div>
                    <div className={`absolute inset-0 ${bottomShade}`} />
                </motion.div>
            )}

            <div
                className={`absolute h-[2px] left-0 top-1/2 -translate-y-1/2 w-full z-40 ${
                    isLight ? "bg-black/12" : "bg-black/40"
                }`}
            />
        </div>
    )
}

export function isLightClockBackground(bg: ClockBackground): boolean {
    return Boolean(CLOCK_BACKGROUNDS.find((b) => b.id === bg)?.light)
}

export function Clock() {
    const [time, setTime] = useState<Date | null>(null)
    const appearance = useClockAppearance()
    const { style, showSeconds } = appearance
    const isLight = isLightClockAppearance(appearance)

    useEffect(() => {
        let timerId: number | null = null

        const tick = () => {
            const now = new Date()
            setTime(now)
            const msUntilNextSecond = 1000 - now.getMilliseconds() + 5
            timerId = window.setTimeout(tick, msUntilNextSecond)
        }

        tick()
        return () => {
            if (timerId !== null) window.clearTimeout(timerId)
        }
    }, [])

    if (!time) {
        return <div className="w-full aspect-[890/320]" />
    }

    const hours = String(time.getHours()).padStart(2, "0")
    const minutes = String(time.getMinutes()).padStart(2, "0")
    const seconds = String(time.getSeconds()).padStart(2, "0")

    if (style === "minimal") {
        return (
            <div
                className="w-full flex items-baseline justify-center gap-[2.5cqw] select-none"
                style={{ containerType: "inline-size" }}
            >
                <span
                    className={`font-black tracking-tight tabular-nums leading-none ${
                        isLight ? "text-zinc-900" : "text-white"
                    }`}
                    style={{ fontSize: showSeconds ? "24cqw" : "28cqw" }}
                >
                    {hours}:{minutes}
                </span>
                {showSeconds ? (
                    <span
                        className={`font-bold tabular-nums leading-none ${
                            isLight ? "text-zinc-400" : "text-white/45"
                        }`}
                        style={{ fontSize: "9cqw" }}
                    >
                        {seconds}
                    </span>
                ) : null}
            </div>
        )
    }

    if (style === "neon") {
        return (
            <div
                className="w-full flex items-center justify-center"
                style={{ containerType: "inline-size" }}
            >
                <div
                    className={`px-[5cqw] py-[3cqw] rounded-[4cqw] flex items-baseline gap-[2.2cqw] ${
                        isLight
                            ? "bg-white/80 ring-1 ring-[#0A84FF]/30 shadow-[0_8px_40px_rgba(10,132,255,0.14)]"
                            : "bg-white/[0.04] ring-1 ring-[#8AB4F8]/35 shadow-[0_0_60px_rgba(138,180,248,0.18)]"
                    }`}
                >
                    <span
                        className={`font-extrabold tracking-tight tabular-nums leading-none ${
                            isLight
                                ? "text-[#0A84FF]"
                                : "text-[#A8C7FA] drop-shadow-[0_0_24px_rgba(138,180,248,0.55)]"
                        }`}
                        style={{ fontSize: showSeconds ? "21cqw" : "24cqw" }}
                    >
                        {hours}:{minutes}
                    </span>
                    {showSeconds ? (
                        <span
                            className={`font-bold tabular-nums leading-none ${
                                isLight ? "text-[#0A84FF]/60" : "text-[#8AB4F8]/65"
                            }`}
                            style={{ fontSize: "8cqw" }}
                        >
                            {seconds}
                        </span>
                    ) : null}
                </div>
            </div>
        )
    }

    if (style === "analog") {
        const hDeg = ((time.getHours() % 12) + time.getMinutes() / 60) * 30
        const mDeg = (time.getMinutes() + time.getSeconds() / 60) * 6
        const sDeg = time.getSeconds() * 6
        return (
            <div
                className="w-full flex items-center justify-center py-2"
                style={{ containerType: "inline-size" }}
            >
                <div
                    className={`relative w-[min(44svh,340px,42cqw)] aspect-square rounded-full shadow-2xl flex items-center justify-center ${
                        isLight
                            ? "bg-white/90 ring-2 ring-black/10"
                            : "bg-white/[0.05] ring-2 ring-white/20"
                    }`}
                >
                    {Array.from({ length: 12 }, (_, i) => (
                        <div
                            key={i}
                            className="absolute inset-3 flex justify-center"
                            style={{ transform: `rotate(${i * 30}deg)` }}
                        >
                            <div
                                className={
                                    i % 3 === 0
                                        ? `w-1 h-3.5 rounded-full ${isLight ? "bg-zinc-800" : "bg-white/80"}`
                                        : `w-0.5 h-2 rounded-full ${isLight ? "bg-zinc-400" : "bg-white/35"}`
                                }
                            />
                        </div>
                    ))}
                    <div
                        className={`absolute w-2 h-[26%] rounded-full origin-bottom ${
                            isLight ? "bg-zinc-900" : "bg-white"
                        }`}
                        style={{ bottom: "50%", transform: `rotate(${hDeg}deg)` }}
                    />
                    <div
                        className={`absolute w-1.5 h-[36%] rounded-full origin-bottom ${
                            isLight ? "bg-zinc-800" : "bg-white/90"
                        }`}
                        style={{ bottom: "50%", transform: `rotate(${mDeg}deg)` }}
                    />
                    {showSeconds ? (
                        <div
                            className="absolute w-0.5 h-[41%] bg-[#FF453A] rounded-full origin-bottom"
                            style={{ bottom: "50%", transform: `rotate(${sDeg}deg)` }}
                        />
                    ) : null}
                    <div className="w-3.5 h-3.5 rounded-full bg-[#FF453A] ring-2 ring-white z-10" />
                </div>
            </div>
        )
    }

    const dotClass = `w-[2.25cqw] h-[2.25cqw] ${isLight ? "bg-zinc-800" : "bg-white"}`

    return (
        <div
            className={`w-full flex items-center ${
                showSeconds ? "justify-between" : "justify-center gap-[6cqw]"
            }`}
            style={{ containerType: "inline-size" }}
        >
            <FlipDigit digit={hours} isLight={isLight} />

            <div className="flex flex-col gap-[6.74cqw] shrink-0">
                <div className={dotClass} />
                <div className={dotClass} />
            </div>

            <FlipDigit digit={minutes} isLight={isLight} />

            {showSeconds ? (
                <>
                    <div className="flex flex-col gap-[6.74cqw] shrink-0">
                        <div className={dotClass} />
                        <div className={dotClass} />
                    </div>

                    <FlipDigit digit={seconds} isLight={isLight} />
                </>
            ) : null}
        </div>
    )
}
