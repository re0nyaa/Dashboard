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
import { SettingPanel } from "~/components/SettingPanel"
export function meta({}: Route.MetaArgs) {
    return [{ title: "Dashboard" }]
}

export default function Home() {
    // 아래 엣지 스와이프 핸들러 (아래에서 위로)
    const [panelDragStartY, setPanelDragStartY] = useState<number | null>(null)
    const edgePointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        if (!sidePanelOpen && e.clientY > rect.bottom - 30) {
            setPanelDragStartY(e.clientY)
            setPanelDragActive(true)
        }
        e.stopPropagation()
    }
    const edgePointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (panelDragActive && panelDragStartY !== null) {
            const dy = e.clientY - panelDragStartY
            if (dy < -60) {
                setSidePanelOpen(true)
                setPanelDragActive(false)
                setPanelDragStartY(null)
            }
        }
        e.stopPropagation()
    }
    const edgePointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (panelDragActive) {
            setPanelDragActive(false)
            setPanelDragStartY(null)
        }
        e.stopPropagation()
    }
    const [activeWidget, setActiveWidget] = useState(0)
    const [sidePanelOpen, setSidePanelOpen] = useState(false)
    const [panelDragStartX, setPanelDragStartX] = useState<number | null>(null)
    const [panelDragActive, setPanelDragActive] = useState(false)
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
    // 기존 위젯 스와이프
    const goNext = () => setActiveWidget((prev) => (prev + 1) % widgetCount)
    const goPrev = () => setActiveWidget((prev) => (prev - 1 + widgetCount) % widgetCount)
    const handleSwipe = (dx: number, dy: number, dt: number, startedInScrollable: boolean) => {
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
    // 엣지 스와이프 감지 및 패널 오픈
    const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (!sidePanelOpen && e.clientX < 30) {
            setPanelDragStartX(e.clientX)
            setPanelDragActive(true)
        }
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
            if (e.pointerType === "mouse" && !swipeStartedInScrollableRef.current) {
                e.currentTarget.setPointerCapture(e.pointerId)
            }
        } catch {}
    }
    const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (panelDragActive && panelDragStartX !== null) {
            const dx = e.clientX - panelDragStartX
            if (dx > 60) {
                setSidePanelOpen(true)
                setPanelDragActive(false)
                setPanelDragStartX(null)
            }
        }
    }
    const onPointerUpOrCancel: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (panelDragActive) {
            setPanelDragActive(false)
            setPanelDragStartX(null)
        }
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
        if (sidePanelOpen && startX < 340 && dx < -60 && Math.abs(dy) < 80) {
            setSidePanelOpen(false)
            return
        }
        handleSwipe(dx, dy, dt, startedInScrollable)
    }
    const onTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
        const touch = e.touches[0]
        if (!sidePanelOpen && touch.clientX < 30) {
            setPanelDragStartX(touch.clientX)
            setPanelDragActive(true)
        }
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
    const onTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
        if (panelDragActive && panelDragStartX !== null) {
            const touch = e.touches[0]
            const dx = touch.clientX - panelDragStartX
            if (dx > 60) {
                setSidePanelOpen(true)
                setPanelDragActive(false)
                setPanelDragStartX(null)
            }
        }
    }
    const onTouchEnd: React.TouchEventHandler<HTMLDivElement> = (e) => {
        if (panelDragActive) {
            setPanelDragActive(false)
            setPanelDragStartX(null)
        }
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
        // 패널 닫기: 패널이 열려있고, 패널 내에서 왼쪽으로 스와이프
        if (sidePanelOpen && startX < 340 && dx < -60 && Math.abs(dy) < 80) {
            setSidePanelOpen(false)
            return
        }
        handleSwipe(dx, dy, dt, startedInScrollable)
    }
    return (
        <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden font-sans">
            <div className="w-[1920px] h-[540px] bg-[#1e1e1e] relative flex overflow-hidden shadow-2xl">
                {/* 하단 엣지 감지 레이어 */}
                <div
                    className="absolute left-0 bottom-0 w-full h-[30px] z-[100] bg-transparent"
                    style={{ pointerEvents: "auto" }}
                    onPointerDown={edgePointerDown}
                    onPointerMove={edgePointerMove}
                    onPointerUp={edgePointerUp}
                />
                {sidePanelOpen && (
                    <div
                        className="fixed inset-0 z-40 bg-black/40"
                        onClick={() => setSidePanelOpen(false)}
                        style={{ touchAction: "none" }}
                    />
                )}
                <motion.div
                    initial={false}
                    animate={{ y: sidePanelOpen ? 0 : 300 }}
                    transition={{ type: "spring", stiffness: 400, damping: 38 }}
                    className="fixed left-0 right-0 bottom-0 z-50 w-full h-[300px] bg-[#23272e] shadow-2xl flex flex-col items-center justify-center rounded-t-[50px]"
                    style={{ touchAction: "pan-x" }}
                >
                    <SettingPanel />
                </motion.div>
                <div className="absolute top-[60px] left-[35px] flex flex-col gap-[60px]">
                    <Clock />
                    <DateDisplay />
                </div>
                <div
                    className="absolute top-[50px] left-[1010px] w-[860px] h-[440px] touch-auto widget-swipe-area"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUpOrCancel}
                    onPointerCancel={onPointerUpOrCancel}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeWidget}
                            initial={isMusicWidget ? { opacity: 0, y: 0 } : { opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={isMusicWidget ? { opacity: 0, y: 0 } : { opacity: 0, y: -20 }}
                            transition={{ duration: 0.5, ease: "easeInOut" }}
                            className="w-full h-full"
                        >
                            {widgets[activeWidget]}
                        </motion.div>
                    </AnimatePresence>
                </div>
                <div className="absolute bottom-[20px] left-[1010px] w-[860px] flex justify-center gap-3">
                    {Array.from({ length: widgetCount }, (_, idx) => idx).map((idx) => (
                        <button
                            key={idx}
                            onClick={() => setActiveWidget(idx)}
                            className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                activeWidget === idx
                                    ? "bg-white w-6"
                                    : "bg-white/20 hover:bg-white/40"
                            }`}
                        />
                    ))}
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
