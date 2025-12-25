import { useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { Route } from "./+types/home"
import { Clock } from "../components/Clock"
import { DateDisplay } from "../components/DateDisplay"
import { NewsCarousel } from "../components/NewsCarousel"
import { MusicPlayer } from "../components/MusicPlayer"
import { CalendarWidget } from "~/components/CalendarWidget"
import { ScheduleWidget } from "~/components/ScheduleWidget"
import { WeatherWidget } from "~/components/WeatherWidget"

export function meta({}: Route.MetaArgs) {
    return [{ title: "Dashboard" }]
}

export default function Home() {
    const [activeWidget, setActiveWidget] = useState(0)

    const swipeStartXRef = useRef<number | null>(null)
    const swipeStartYRef = useRef<number | null>(null)
    const swipeStartTimeRef = useRef<number | null>(null)
    const swipeStartedInScrollableRef = useRef(false)
    const swipeLockRef = useRef(false)

    const widgets = [
        <NewsCarousel key="news" />,
        <WeatherWidget key="weather" />,
        <CalendarWidget key="calendar" />,
        <ScheduleWidget key="schedule" />,
        <MusicPlayer key="music" />,
    ]

    const widgetCount = widgets.length

    const isMusicWidget = activeWidget === 4

    const goNext = () => setActiveWidget((prev) => (prev + 1) % widgetCount)
    const goPrev = () =>
        setActiveWidget((prev) => (prev - 1 + widgetCount) % widgetCount)

    const handleSwipe = (
        dx: number,
        dy: number,
        dt: number,
        startedInScrollable: boolean
    ) => {
        if (swipeLockRef.current) return
        const SWIPE_THRESHOLD_PX = startedInScrollable ? 110 : 70
        const SWIPE_MAX_TIME_MS = 900

        if (dt > SWIPE_MAX_TIME_MS) return
        if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return
        if (startedInScrollable) {
            if (Math.abs(dy) > 24) return
            if (Math.abs(dy) > Math.abs(dx) * 0.25) return
        } else {
            if (Math.abs(dy) > Math.abs(dx) * 0.6) return
        }

        if (dx <= -SWIPE_THRESHOLD_PX) {
            swipeLockRef.current = true
            goNext()
        } else if (dx >= SWIPE_THRESHOLD_PX) {
            swipeLockRef.current = true
            goPrev()
        }

        if (swipeLockRef.current) {
            setTimeout(() => {
                swipeLockRef.current = false
            }, 520)
        }
    }

    const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        const target = e.target
        const el =
            target instanceof Element
                ? target
                : target instanceof Node
                ? target.parentElement
                : null
        swipeStartedInScrollableRef.current = Boolean(
            el?.closest('[data-disable-widget-swipe="true"]')
        )

        swipeStartXRef.current = e.clientX
        swipeStartYRef.current = e.clientY
        swipeStartTimeRef.current = Date.now()

        try {
            if (
                e.pointerType === "mouse" &&
                !swipeStartedInScrollableRef.current
            ) {
                e.currentTarget.setPointerCapture(e.pointerId)
            }
        } catch {}
    }

    const onPointerUpOrCancel: React.PointerEventHandler<HTMLDivElement> = (
        e
    ) => {
        const startX = swipeStartXRef.current
        const startY = swipeStartYRef.current
        const startTime = swipeStartTimeRef.current
        const startedInScrollable = swipeStartedInScrollableRef.current

        swipeStartXRef.current = null
        swipeStartYRef.current = null
        swipeStartTimeRef.current = null
        swipeStartedInScrollableRef.current = false

        if (startX == null || startY == null || startTime == null) return

        const dx = e.clientX - startX
        const dy = e.clientY - startY
        const dt = Date.now() - startTime

        handleSwipe(dx, dy, dt, startedInScrollable)
    }

    const onTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
        const touch = e.touches[0]
        const target = touch.target
        const el =
            target instanceof Element
                ? target
                : target instanceof Node
                ? target.parentElement
                : null
        swipeStartedInScrollableRef.current = Boolean(
            el?.closest('[data-disable-widget-swipe="true"]')
        )

        swipeStartXRef.current = touch.clientX
        swipeStartYRef.current = touch.clientY
        swipeStartTimeRef.current = Date.now()
    }

    const onTouchEnd: React.TouchEventHandler<HTMLDivElement> = (e) => {
        const touch = e.changedTouches[0]
        const startX = swipeStartXRef.current
        const startY = swipeStartYRef.current
        const startTime = swipeStartTimeRef.current
        const startedInScrollable = swipeStartedInScrollableRef.current

        swipeStartXRef.current = null
        swipeStartYRef.current = null
        swipeStartTimeRef.current = null
        swipeStartedInScrollableRef.current = false

        if (startX == null || startY == null || startTime == null) return

        const dx = touch.clientX - startX
        const dy = touch.clientY - startY
        const dt = Date.now() - startTime

        handleSwipe(dx, dy, dt, startedInScrollable)
    }

    return (
        <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden font-sans">
            <div className="w-[1920px] h-[540px] bg-[#1e1e1e] relative flex overflow-hidden shadow-2xl">
                <div className="absolute top-[60px] left-[35px] flex flex-col gap-[60px]">
                    <Clock />
                    <DateDisplay />
                </div>

                <div
                    className="absolute top-[50px] left-[1010px] w-[860px] h-[440px] touch-auto widget-swipe-area"
                    onPointerDown={onPointerDown}
                    onPointerUp={onPointerUpOrCancel}
                    onPointerCancel={onPointerUpOrCancel}
                    onTouchStart={onTouchStart}
                    onTouchEnd={onTouchEnd}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeWidget}
                            initial={
                                isMusicWidget
                                    ? { opacity: 0, y: 0 }
                                    : { opacity: 0, y: 20 }
                            }
                            animate={{ opacity: 1, y: 0 }}
                            exit={
                                isMusicWidget
                                    ? { opacity: 0, y: 0 }
                                    : { opacity: 0, y: -20 }
                            }
                            transition={{ duration: 0.5, ease: "easeInOut" }}
                            className="w-full h-full"
                        >
                            {widgets[activeWidget]}
                        </motion.div>
                    </AnimatePresence>
                </div>

                <div className="absolute bottom-[20px] left-[1010px] w-[860px] flex justify-center gap-3">
                    {Array.from({ length: widgetCount }, (_, idx) => idx).map(
                        (idx) => (
                            <button
                                key={idx}
                                onClick={() => setActiveWidget(idx)}
                                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                    activeWidget === idx
                                        ? "bg-white w-6"
                                        : "bg-white/20 hover:bg-white/40"
                                }`}
                            />
                        )
                    )}
                </div>
            </div>
            <style>{`
                .widget-swipe-area {
                    touch-action: pan-y;
                }
            `}</style>
        </div>
    )
}
