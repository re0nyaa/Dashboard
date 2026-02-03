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
        if (typeof window === "undefined") return
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
        const onResize = () => compute()
        window.addEventListener("resize", onResize)
        window.addEventListener("orientationchange", onResize)

        let ro: ResizeObserver | null = null
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(() => compute())
            ro.observe(el)
        }

        return () => {
            ro?.disconnect()
            window.removeEventListener("resize", onResize)
            window.removeEventListener("orientationchange", onResize)
        }
    }, [])

    const scaledSize = useMemo(() => {
        return {
            width: Math.round(BASE_W * stageScale),
            height: Math.round(baseH * stageScale),
        }
    }, [baseH, stageScale])

    const [activeWidget, setActiveWidget] = useState(0)
    const [sidePanelOpen, setSidePanelOpen] = useState(false)
    const [panelDragStartY, setPanelDragStartY] = useState<number | null>(null)
    const [panelDragActive, setPanelDragActive] = useState(false)

    // 엣지 스와이프
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

    // 위젯 상태
    const [editMode, setEditMode] = useState(false)
    const [editCardStyle, setEditCardStyle] = useState<{
        top: number
        left: number
        width: number
        height: number
    } | null>(null)
    const [widgetsOrder, setWidgetsOrder] = useState([0, 1, 2, 3, 4])
    const widgetComponents = [
        <NewsCarousel key="news" />,
        <WeatherWidget key="weather" />,
        <CalendarWidget key="calendar" />,
        <ScheduleWidget key="schedule" />,
        <MusicPlayer key="music" />,
    ]
    const widgets = widgetsOrder.map((i) => widgetComponents[i])
    const widgetCount = widgets.length
    const isMusicWidget = widgetsOrder[activeWidget] === 4
    const cardRefs = useRef<(HTMLDivElement | null)[]>([])

    // 롱프레스
    const longPressTimer = useRef<NodeJS.Timeout | null>(null)
    const LONG_PRESS_MS = 2000
    const handleLongPressStart = (idx: number) => {
        if (editMode || longPressTimer.current) return
        longPressTimer.current = setTimeout(() => {
            setEditCardStyle({
                top: cardTop,
                left: CARD.left,
                width: CARD.width,
                height: CARD.height,
            })
            setEditMode(true)
            clearTimeout(longPressTimer.current!)
            longPressTimer.current = null
        }, LONG_PRESS_MS)
    }
    const handleLongPressEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current)
            longPressTimer.current = null
        }
    }

    // 카드 드래그&드롭 편집
    const [draggedIdx, setDraggedIdx] = useState<number | null>(null)
    const handleDragStart = (idx: number) => {
        if (editMode) return
        setDraggedIdx(idx)
    }
    const handleDragOver = (idx: number) => {
        if (editMode || draggedIdx === null || draggedIdx === idx) return
        setWidgetsOrder((prev) => {
            const arr = [...prev]
            const [removed] = arr.splice(draggedIdx, 1)
            arr.splice(idx, 0, removed)
            return arr
        })
        setDraggedIdx(idx)
    }
    const handleDragEnd = () => {
        if (editMode) return
        setDraggedIdx(null)
    }

    // 카드 추가/제거
    const handleRemove = (idx: number) => {
        setWidgetsOrder((prev) => prev.filter((i) => i !== idx))
        if (activeWidget >= widgetsOrder.length - 1) setActiveWidget(0)
    }
    const handleAdd = (idx: number) => {
        if (!widgetsOrder.includes(idx)) setWidgetsOrder((prev) => [...prev, idx])
    }

    // 스와이프
    const swipeStartXRef = useRef<number | null>(null)
    const swipeStartYRef = useRef<number | null>(null)
    const swipeLockRef = useRef(false)
    const goNext = () => setActiveWidget((prev) => (prev + 1) % widgetCount)
    const goPrev = () => setActiveWidget((prev) => (prev - 1 + widgetCount) % widgetCount)

    const handleSwipeStart = (x: number, y: number) => {
        if (editMode) return
        swipeStartXRef.current = x
        swipeStartYRef.current = y
    }
    const handleSwipeMove = (x: number, y: number) => {
        if (editMode || swipeLockRef.current) return
        const sx = swipeStartXRef.current
        const sy = swipeStartYRef.current
        if (sx == null || sy == null) return
        const dx = x - sx
        const dy = y - sy
        if (Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.6) {
            swipeLockRef.current = true
            dx < 0 ? goNext() : goPrev()
            swipeStartXRef.current = null
            swipeStartYRef.current = null
            setTimeout(() => (swipeLockRef.current = false), 500)
        }
    }
    const handleSwipeEnd = () => {
        if (editMode) return
        swipeStartXRef.current = null
        swipeStartYRef.current = null
    }

    // 터치 카드 이동
    const [touchDragIdx, setTouchDragIdx] = useState<number | null>(null)
    const touchStartXRef = useRef<number | null>(null)
    const handleCardTouchStart = (e: React.TouchEvent<HTMLDivElement>, idx: number) => {
        if (editMode) return
        const t = e.touches[0]
        touchStartXRef.current = t.clientX
        setTouchDragIdx(idx)
    }
    const handleCardTouchMove = (e: React.TouchEvent<HTMLDivElement>, idx: number) => {
        if (editMode || touchDragIdx === null) return
        const t = e.touches[0]
        const startX = touchStartXRef.current
        if (startX == null) return
        const dx = t.clientX - startX
        if (Math.abs(dx) > 40) {
            setWidgetsOrder((prev) => {
                const arr = [...prev]
                const [removed] = arr.splice(touchDragIdx, 1)
                const newIdx =
                    dx > 0 ? Math.min(touchDragIdx + 1, arr.length) : Math.max(touchDragIdx - 1, 0)
                arr.splice(newIdx, 0, removed)
                return arr
            })
            setTouchDragIdx(idx)
            touchStartXRef.current = t.clientX
        }
    }
    const handleCardTouchEnd = () => {
        if (editMode) return
        setTouchDragIdx(null)
        touchStartXRef.current = null
    }

    return (
        <div className="bg-black overflow-hidden">
            <div
                ref={viewportRef}
                className="w-screen h-[100svh] flex items-center justify-center p-2 overflow-hidden"
            >
                <div className="relative" style={{ width: scaledSize.width, height: scaledSize.height }}>
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

                <div
                    className="absolute left-[35px] flex flex-col gap-[60px]"
                    style={{ top: clockTop }}
                >
                    <Clock />
                    <DateDisplay />
                </div>

                {/* 위젯 카드 */}
                <div
                    className="absolute"
                    style={{
                        top: cardTop,
                        left: CARD.left,
                        width: CARD.width,
                        height: CARD.height,
                    }}
                    onPointerDown={(e) => {
                        handleSwipeStart(e.clientX, e.clientY)
                        handleLongPressStart(activeWidget)
                    }}
                    onPointerMove={(e) => handleSwipeMove(e.clientX, e.clientY)}
                    onPointerUp={(e) => {
                        handleSwipeEnd()
                        handleLongPressEnd()
                    }}
                    onPointerLeave={handleLongPressEnd}
                    onTouchStart={(e) => {
                        const t = e.touches[0]
                        handleSwipeStart(t.clientX, t.clientY)
                        handleLongPressStart(activeWidget)
                    }}
                    onTouchMove={(e) => {
                        const t = e.touches[0]
                        handleSwipeMove(t.clientX, t.clientY)
                    }}
                    onTouchEnd={() => handleSwipeEnd()}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            ref={(el) => {
                                cardRefs.current[activeWidget] = el
                            }}
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

                    {editMode && editCardStyle && (
                        <div
                            className="absolute z-10 bg-[#4B4B4B] shadow-xl rounded-[60px] overflow-hidden"
                            style={{
                                top: cardTop,
                                left: CARD.left,
                                width: CARD.width,
                                height: CARD.height,
                            }}
                        >
                            <div className="flex flex-col items-center p-4 h-full w-full">
                                <div className="text-lg font-bold mb-2">카드 편집</div>
                                <div className="flex gap-2 overflow-x-auto w-full pb-2">
                                    {widgetsOrder.map((idx, i) => (
                                        <div
                                            key={idx}
                                            draggable
                                            onDragStart={() => handleDragStart(i)}
                                            onDragOver={(e) => {
                                                e.preventDefault()
                                                handleDragOver(i)
                                            }}
                                            onDragEnd={handleDragEnd}
                                            onTouchStart={(e) => handleCardTouchStart(e, i)}
                                            onTouchMove={(e) => handleCardTouchMove(e, i)}
                                            onTouchEnd={handleCardTouchEnd}
                                            className="relative flex flex-col items-center bg-gray-100 rounded-lg p-2 min-w-[80px] cursor-move"
                                        >
                                            <div className="w-10 h-10 flex items-center justify-center text-2xl mb-1">
                                                {widgetComponents[idx].key === "news" && "📰"}
                                                {widgetComponents[idx].key === "weather" && "☀️"}
                                                {widgetComponents[idx].key === "calendar" && "📅"}
                                                {widgetComponents[idx].key === "schedule" && "📋"}
                                                {widgetComponents[idx].key === "music" && "🎵"}
                                            </div>
                                            <div className="text-xs font-semibold text-gray-700 truncate w-full text-center">
                                                {widgetComponents[idx].key}
                                            </div>
                                            <button
                                                className="absolute top-1 right-1 text-red-500"
                                                onClick={() => handleRemove(idx)}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                {/* 추가 버튼 */}
                                <div className="mt-auto flex gap-1">
                                    {[0, 1, 2, 3, 4]
                                        .filter((idx) => !widgetsOrder.includes(idx))
                                        .map((idx) => (
                                            <button
                                                key={idx}
                                                className="flex items-center gap-1 px-2 py-1 bg-blue-500 text-white rounded"
                                                onClick={() => handleAdd(idx)}
                                            >
                                                + {widgetComponents[idx].key}
                                            </button>
                                        ))}
                                </div>
                                <button
                                    className="absolute top-5 right-10 text-white font-bold"
                                    onClick={() => setEditMode(false)}
                                >
                                    완료
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div
                    className="absolute left-[1010px] w-[860px] flex justify-center gap-3"
                    style={{ bottom: indicatorBottom }}
                >
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
                </div>
            </div>
        </div>
    )
}
