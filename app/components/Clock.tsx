import { useEffect, useState } from "react"
import { motion } from "framer-motion"

interface FlipDigitProps {
    digit: string
}

const HALF_FLIP_DURATION = 0.18

function FlipDigit({ digit }: FlipDigitProps) {
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

    return (
        <div
            className="relative w-[28.09cqw] h-[35.95cqw] bg-[#4b4b4b] rounded-[3.37cqw] overflow-hidden shrink-0"
            style={{ perspective: "900px" }}
        >
            {/* 정적 상단 (새 숫자) */}
            <div className="absolute top-0 left-0 right-0 h-1/2 overflow-hidden z-10 pointer-events-none">
                <div className="absolute inset-0 bg-[#4b4b4b]" />
                <div className="absolute left-0 top-0 w-full h-[200%] flex items-center justify-center">
                    <span
                        className="font-bold text-white leading-none"
                        style={{ fontSize: "18.54cqw" }}
                    >
                        {currentDigit}
                    </span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
            </div>

            {/* 정적 하단 (플립 중에는 이전 숫자, 완료 후 새 숫자) */}
            <div className="absolute bottom-0 left-0 right-0 h-1/2 overflow-hidden z-10 pointer-events-none">
                <div className="absolute inset-0 bg-[#4b4b4b]" />
                <div className="absolute left-0 bottom-0 w-full h-[200%] flex items-center justify-center">
                    <span
                        className="font-bold text-white leading-none"
                        style={{ fontSize: "18.54cqw" }}
                    >
                        {isFlipping ? prevDigit : currentDigit}
                    </span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
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
                    <div className="absolute inset-0 bg-[#4b4b4b]" />
                    <div className="absolute left-0 top-0 w-full h-[200%] flex items-center justify-center">
                        <span
                            className="font-bold text-white leading-none"
                            style={{ fontSize: "18.54cqw" }}
                        >
                            {prevDigit}
                        </span>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
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
                    <div className="absolute inset-0 bg-[#4b4b4b]" />
                    <div className="absolute left-0 bottom-0 w-full h-[200%] flex items-center justify-center">
                        <span
                            className="font-bold text-white leading-none"
                            style={{ fontSize: "18.54cqw" }}
                        >
                            {currentDigit}
                        </span>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                </motion.div>
            )}

            <div className="absolute bg-[#2d2d2d] h-[0.9cqw] left-0 top-1/2 -translate-y-1/2 w-full z-40" />
        </div>
    )
}

export function Clock() {
    const [time, setTime] = useState<Date | null>(null)

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

    return (
        <div
            className="w-full flex items-center justify-between"
            style={{ containerType: "inline-size" }}
        >
            <FlipDigit digit={hours} />

            <div className="flex flex-col gap-[6.74cqw] shrink-0">
                <div className="w-[2.25cqw] h-[2.25cqw] bg-white" />
                <div className="w-[2.25cqw] h-[2.25cqw] bg-white" />
            </div>

            <FlipDigit digit={minutes} />

            <div className="flex flex-col gap-[6.74cqw] shrink-0">
                <div className="w-[2.25cqw] h-[2.25cqw] bg-white" />
                <div className="w-[2.25cqw] h-[2.25cqw] bg-white" />
            </div>

            <FlipDigit digit={seconds} />
        </div>
    )
}
