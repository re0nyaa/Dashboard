import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface FlipDigitProps {
    digit: string
}

function FlipDigit({ digit }: FlipDigitProps) {
    const [currentDigit, setCurrentDigit] = useState(digit)
    const [nextDigit, setNextDigit] = useState(digit)
    const [isFlipping, setIsFlipping] = useState(false)

    const FLIP_DURATION_MS = 400

    useEffect(() => {
        if (digit === currentDigit) return

        setNextDigit(digit)
        setIsFlipping(true)

        const timer = window.setTimeout(() => {
            setCurrentDigit(digit)
            setIsFlipping(false)
        }, FLIP_DURATION_MS)

        return () => window.clearTimeout(timer)
    }, [digit, currentDigit])

    return (
        <div
            className="relative w-[250px] h-[320px] bg-[#4b4b4b] rounded-[30px] overflow-hidden"
            style={{ perspective: "300px", transformStyle: "preserve-3d" }}
        >
            <div className="absolute top-0 left-0 right-0 h-1/2 overflow-hidden z-10 pointer-events-none">
                <div className="absolute inset-0 bg-[#4b4b4b]" />
                <div className="absolute left-0 top-0 w-full h-[320px] flex items-center justify-center">
                    <span className="text-[165px] font-bold text-white leading-none">
                        {isFlipping ? nextDigit : currentDigit}
                    </span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-1/2 overflow-hidden z-10 pointer-events-none">
                <div className="absolute inset-0 bg-[#4b4b4b]" />
                <div className="absolute left-0 bottom-0 w-full h-[320px] flex items-center justify-center">
                    <span className="text-[165px] font-bold text-white leading-none">
                        {currentDigit}
                    </span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>

            {/* 애니메이션 구현 */}
            <AnimatePresence>
                {isFlipping && (
                    <motion.div
                        key={`top-${currentDigit}->${nextDigit}`}
                        className="absolute top-0 left-0 right-0 h-1/2 overflow-hidden z-30 pointer-events-none"
                        initial={{ rotateX: 0 }}
                        animate={{ rotateX: -90 }}
                        exit={{ rotateX: -90 }}
                        transition={{
                            duration: FLIP_DURATION_MS / 1000 / 2,
                            ease: "easeIn",
                        }}
                        style={{
                            transformOrigin: "center bottom",
                            transformStyle: "preserve-3d",
                            backfaceVisibility: "hidden",
                        }}
                    >
                        <div className="absolute inset-0 bg-[#4b4b4b]" />
                        <div className="absolute left-0 top-0 w-full h-[320px] flex items-center justify-center">
                            <span
                                className="text-[165px] font-bold text-white leading-none"
                                style={{ backfaceVisibility: "hidden" }}
                            >
                                {currentDigit}
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isFlipping && (
                    <motion.div
                        key={`bottom-${currentDigit}->${nextDigit}`}
                        className="absolute bottom-0 left-0 right-0 h-1/2 overflow-hidden z-30 pointer-events-none"
                        initial={{ rotateX: 90 }}
                        animate={{ rotateX: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{
                            delay: FLIP_DURATION_MS / 1000 / 2,
                            duration: FLIP_DURATION_MS / 1000 / 2,
                            ease: "easeOut",
                        }}
                        style={{
                            transformOrigin: "center top",
                            transformStyle: "preserve-3d",
                            backfaceVisibility: "hidden",
                        }}
                    >
                        <div className="absolute inset-0 bg-[#4b4b4b]" />
                        <div className="absolute left-0 bottom-0 w-full h-[320px] flex items-center justify-center">
                            <span
                                className="text-[165px] font-bold text-white leading-none"
                                style={{ backfaceVisibility: "hidden" }}
                            >
                                {nextDigit}
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="absolute bg-[#2d2d2d] h-[8px] left-0 top-[156px] w-[250px] z-40" />
        </div>
    )
}

export function Clock() {
    const [time, setTime] = useState(new Date())

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date())
        }, 500)

        return () => clearInterval(timer)
    }, [])

    const hours = String(time.getHours()).padStart(2, "0")
    const minutes = String(time.getMinutes()).padStart(2, "0")
    const seconds = String(time.getSeconds()).padStart(2, "0")

    return (
        <div className="relative h-[320px] w-[890px]">
            <div className="absolute left-0 top-0">
                <FlipDigit digit={hours} />
            </div>

            <div className="absolute left-[275px] top-[120px] flex flex-col gap-[60px]">
                <div className="w-[20px] h-[20px] bg-white" />
                <div className="w-[20px] h-[20px] bg-white" />
            </div>

            <div className="absolute left-[320px] top-0">
                <FlipDigit digit={minutes} />
            </div>

            <div className="absolute left-[595px] top-[116px] flex flex-col gap-[60px]">
                <div className="w-[20px] h-[20px] bg-white" />
                <div className="w-[20px] h-[20px] bg-white" />
            </div>

            <div className="absolute left-[640px] top-0">
                <FlipDigit digit={seconds} />
            </div>
        </div>
    )
}
