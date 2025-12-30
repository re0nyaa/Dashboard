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
    const [activeWidget, setActiveWidget] = useState(0)
    const [sidePanelOpen, setSidePanelOpen] = useState(false)
    const [panelDragStartY, setPanelDragStartY] = useState<number | null>(null)
    const [panelDragActive, setPanelDragActive] = useState(false)

    const edgePointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (sidePanelOpen) return
        setPanelDragStartY(e.clientY)
        setPanelDragActive(true)
    }

    const edgePointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (!panelDragActive || panelDragStartY == null) return
        const dy = e.clientY - panelDragStartY
        if (dy < -60) {
            setSidePanelOpen(true)
            setPanelDragActive(false)
            setPanelDragStartY(null)
        }
    }

    const edgePointerUp: React.PointerEventHandler<HTMLDivElement> = () => {
        setPanelDragActive(false)
        setPanelDragStartY(null)
    }

    const edgeTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
        if (sidePanelOpen) return
        setPanelDragStartY(e.touches[0].clientY)
        setPanelDragActive(true)
    }

    const edgeTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
        if (!panelDragActive || panelDragStartY == null) return
        const dy = e.touches[0].clientY - panelDragStartY
        if (dy < -60) {
            setSidePanelOpen(true)
            setPanelDragActive(false)
            setPanelDragStartY(null)
        }
    }

    const edgeTouchEnd = () => {
        setPanelDragActive(false)
        setPanelDragStartY(null)
    }

    const swipeStartXRef = useRef<number | null>(null)
    const swipeStartYRef = useRef<number | null>(null)
    const swipeStartTimeRef = useRef<number | null>(null)
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
    const goPrev = () => setActiveWidget((prev) => (prev - 1 + widgetCount) % widgetCount)

    const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        swipeStartXRef.current = e.clientX
        swipeStartYRef.current = e.clientY
        swipeStartTimeRef.current = Date.now()
    }
    const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (swipeLockRef.current) return
        const sx = swipeStartXRef.current
        const sy = swipeStartYRef.current
        if (sx == null || sy == null) return
        const dx = e.clientX - sx
        const dy = e.clientY - sy
        if (Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.6) {
            swipeLockRef.current = true
            dx < 0 ? goNext() : goPrev()
            swipeStartXRef.current = null
            swipeStartYRef.current = null
            swipeStartTimeRef.current = null
            setTimeout(() => (swipeLockRef.current = false), 500)
        }
    }
    const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
        swipeStartXRef.current = null
        swipeStartYRef.current = null
        swipeStartTimeRef.current = null
    }

    const onTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
        const t = e.touches[0]
        swipeStartXRef.current = t.clientX
        swipeStartYRef.current = t.clientY
        swipeStartTimeRef.current = Date.now()
    }
    const onTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
        if (swipeLockRef.current) return
        const t = e.touches[0]
        const sx = swipeStartXRef.current
        const sy = swipeStartYRef.current
        if (sx == null || sy == null) return
        const dx = t.clientX - sx
        const dy = t.clientY - sy
        if (Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.6) {
            swipeLockRef.current = true
            dx < 0 ? goNext() : goPrev()
            swipeStartXRef.current = null
            swipeStartYRef.current = null
            swipeStartTimeRef.current = null
            setTimeout(() => (swipeLockRef.current = false), 500)
        }
    }
    const onTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
        swipeStartXRef.current = null
        swipeStartYRef.current = null
        swipeStartTimeRef.current = null
    }

    return (
        <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden">
            <div className="w-[1920px] h-[540px] bg-[#1e1e1e] relative overflow-hidden">
                <div
                    className="absolute left-0 bottom-0 w-full h-[30px] z-[100]"
                    style={{ touchAction: "none" }}
                    onPointerDown={edgePointerDown}
                    onPointerMove={edgePointerMove}
                    onPointerUp={edgePointerUp}
                    onTouchStart={edgeTouchStart}
                    onTouchMove={edgeTouchMove}
                    onTouchEnd={edgeTouchEnd}
                />

                {sidePanelOpen && (
                    <div
                        className="fixed inset-0 bg-black/40 z-40"
                        onClick={() => setSidePanelOpen(false)}
                    />
                )}

                <motion.div
                    initial={false}
                    animate={{ y: sidePanelOpen ? 0 : 300 }}
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    className="fixed left-0 right-0 bottom-0 h-[300px] z-50 bg-[#23272e] rounded-t-[50px]"
                >
                    <SettingPanel />
                </motion.div>

                <div className="absolute top-[60px] left-[35px] flex flex-col gap-[60px]">
                    <Clock />
                    <DateDisplay />
                </div>

                <div
                    className="absolute top-[50px] left-[1010px] w-[860px] h-[440px]"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeWidget}
                            initial={isMusicWidget ? { opacity: 0 } : { opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={isMusicWidget ? { opacity: 0 } : { opacity: 0, y: -20 }}
                            transition={{ duration: 0.45 }}
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
                            className={`w-2 h-2 rounded-full transition-all duration-300 ${activeWidget === idx ? "bg-white w-6" : "bg-white/20 hover:bg-white/40"}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
