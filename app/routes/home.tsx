import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Clock } from "~/components/Clock"
import { DateDisplay } from "~/components/DateDisplay"
import { NewsCarousel } from "~/components/NewsCarousel"
import { MusicPlayer } from "~/components/MusicPlayer"
import { CalendarWidget } from "~/components/CalendarWidget"
import { ScheduleWidget } from "~/components/ScheduleWidget"
import { WeatherWidget } from "~/components/WeatherWidget"
import { SettingPanel } from "~/components/SettingPanel"

export default function Home() {
    useEffect(() => {
        const handler = (e: MouseEvent) => e.preventDefault()
        document.addEventListener("contextmenu", handler)
        return () => document.removeEventListener("contextmenu", handler)
    }, [])

    const BASE_W = 1920
    const MIN_H = 540
    const CARD = { top: 50, left: 1010, width: 860, height: 440 }

    const viewportRef = useRef<HTMLDivElement | null>(null)
    const [baseH, setBaseH] = useState(MIN_H)
    const [stageScale, setStageScale] = useState(1)

    const vOffset = useMemo(() => Math.max(0, Math.round((baseH - MIN_H) / 2)), [baseH])
    const clockTop = 60 + vOffset
    const cardTop = CARD.top + vOffset
    const indicatorBottom = 20 + vOffset

    useEffect(() => {
        const el = viewportRef.current
        if (!el) return

        const compute = () => {
            const rect = el.getBoundingClientRect()
            const vw = Math.max(rect.width, 1)
            const vh = Math.max(rect.height, 1)
            const aspect = vw / vh

            const nextBaseH = Math.max(MIN_H, Math.round(BASE_W / aspect))
            setBaseH(nextBaseH)

            const nextScale = Math.min(vw / BASE_W, vh / nextBaseH)
            setStageScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1)
        }

        compute()
        window.addEventListener("resize", compute)
        return () => window.removeEventListener("resize", compute)
    }, [])

    const scaledSize = useMemo(() => {
        return {
            width: Math.round(BASE_W * stageScale),
            height: Math.round(baseH * stageScale),
        }
    }, [baseH, stageScale])

    const [activeWidget, setActiveWidget] = useState(0)
    const [editMode, setEditMode] = useState(false)

    const widgetComponents = [
        <NewsCarousel key="news" />,
        <WeatherWidget key="weather" />,
        <CalendarWidget key="calendar" />,
        <ScheduleWidget key="schedule" />,
        <MusicPlayer key="music" />,
    ]

    const [widgetsOrder, setWidgetsOrder] = useState([0, 1, 2, 3, 4])
    const widgets = widgetsOrder.map((i) => widgetComponents[i])

    const widgetCount = widgets.length

    const LONG_PRESS_MS = 2000
    const MOVE_THRESHOLD = 12

    const longPressTimer = useRef<NodeJS.Timeout | null>(null)
    const startXRef = useRef<number | null>(null)
    const startYRef = useRef<number | null>(null)
    const swipeLockRef = useRef(false)

    const goNext = () =>
        setActiveWidget((p) => {
            const next = (p + 1) % widgetCount
            return next
        })
    const goPrev = () =>
        setActiveWidget((p) => {
            const next = (p - 1 + widgetCount) % widgetCount
            return next
        })

    const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (editMode) return

        startXRef.current = e.clientX
        startYRef.current = e.clientY

        longPressTimer.current = setTimeout(() => {
            setEditMode(true)
            longPressTimer.current = null
        }, LONG_PRESS_MS)
    }

    const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (editMode || swipeLockRef.current) return
        const sx = startXRef.current
        const sy = startYRef.current
        if (sx == null || sy == null) return

        const dx = e.clientX - sx
        const dy = e.clientY - sy

        if (longPressTimer.current) {
            if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
                clearTimeout(longPressTimer.current)
                longPressTimer.current = null
            }
        }

        if (Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.6) {
            swipeLockRef.current = true
            if (dx < 0) {
                goNext()
            } else {
                goPrev()
            }
            startXRef.current = null
            startYRef.current = null
            setTimeout(() => (swipeLockRef.current = false), 400)
        }
    }

    const handlePointerEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current)
            longPressTimer.current = null
        }
        startXRef.current = null
        startYRef.current = null
    }

    return (
        <div className="bg-black overflow-hidden">
            <div
                ref={viewportRef}
                className="w-screen h-[100svh] flex items-center justify-center p-2 overflow-hidden"
            >
                <div
                    className="relative"
                    style={{ width: scaledSize.width, height: scaledSize.height }}
                >
                    <div
                        className="bg-[#1e1e1e] relative overflow-hidden"
                        style={{
                            width: BASE_W,
                            height: baseH,
                            transform: `scale(${stageScale})`,
                            transformOrigin: "top left",
                        }}
                    >
                        <div
                            className="absolute left-[35px] flex flex-col gap-[60px]"
                            style={{ top: clockTop }}
                        >
                            <Clock />
                            <DateDisplay />
                        </div>
                        <div
                            className="absolute"
                            style={{
                                top: cardTop,
                                left: CARD.left,
                                width: CARD.width,
                                height: CARD.height,
                                touchAction: "none",
                            }}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerEnd}
                            onPointerCancel={handlePointerEnd}
                        >
                            {!editMode && (
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={activeWidget}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        transition={{ duration: 0.4 }}
                                        className="w-full h-full"
                                    >
                                        {widgets[activeWidget]}
                                    </motion.div>
                                </AnimatePresence>
                            )}

                            {editMode && (
                                <div className="absolute inset-0  bg-[#4B4B4B] rounded-[60px] flex items-center justify-center text-white text-xl">
                                    카드 편집 모드
                                    <button
                                        className="ml-6 bg-blue-500 px-4 py-2 rounded"
                                        onClick={() => setEditMode(false)}
                                    >
                                        완료
                                    </button>
                                </div>
                            )}
                        </div>
                        {!editMode && (
                            <div
                                className="absolute left-[1010px] w-[860px] flex justify-center gap-3"
                                style={{ bottom: indicatorBottom }}
                            >
                                {Array.from({ length: widgetCount }, (_, idx) => idx).map((idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setActiveWidget(idx)}
                                        className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                            activeWidget === idx ? "bg-white w-6" : "bg-white/20"
                                        }`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
