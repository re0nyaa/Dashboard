import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    IoAdd,
    IoAppsOutline,
    IoCheckmark,
    IoChevronBack,
    IoChevronForward,
    IoRefresh,
    IoRemove,
} from "react-icons/io5"
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

    type WidgetId = "news" | "weather" | "calendar" | "schedule" | "music"

    const WIDGET_CATALOG: {
        id: WidgetId
        label: string
        render: () => React.ReactNode
    }[] = [
        { id: "news", label: "뉴스", render: () => <NewsCarousel key="news" /> },
        { id: "weather", label: "날씨", render: () => <WeatherWidget key="weather" /> },
        { id: "calendar", label: "달력", render: () => <CalendarWidget key="calendar" /> },
        { id: "schedule", label: "일정", render: () => <ScheduleWidget key="schedule" /> },
        { id: "music", label: "음악", render: () => <MusicPlayer key="music" /> },
    ]
    const DEFAULT_WIDGET_ORDER: WidgetId[] = WIDGET_CATALOG.map((w) => w.id)
    const STORAGE_KEY = "dashboard.widgetsOrder.v1"

    const [activeWidget, setActiveWidget] = useState(0)
    const [editMode, setEditMode] = useState(false)
    const [widgetsOrder, setWidgetsOrder] = useState<WidgetId[]>(DEFAULT_WIDGET_ORDER)
    const [orderLoaded, setOrderLoaded] = useState(false)
    const [draggedId, setDraggedId] = useState<WidgetId | null>(null)
    const [dragOverId, setDragOverId] = useState<WidgetId | null>(null)

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (raw) {
                const parsed = JSON.parse(raw)
                if (Array.isArray(parsed)) {
                    const validIds = new Set<WidgetId>(DEFAULT_WIDGET_ORDER)
                    const filtered = parsed.filter(
                        (id): id is WidgetId => typeof id === "string" && validIds.has(id as WidgetId)
                    )
                    const deduped = Array.from(new Set(filtered))
                    setWidgetsOrder(deduped)
                }
            }
        } catch {
            // ignore storage errors
        } finally {
            setOrderLoaded(true)
        }
    }, [])

    useEffect(() => {
        if (!orderLoaded) return
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(widgetsOrder))
        } catch {
            // ignore storage errors
        }
    }, [widgetsOrder, orderLoaded])

    const widgets = useMemo(
        () =>
            widgetsOrder
                .map((id) => WIDGET_CATALOG.find((w) => w.id === id))
                .filter((w): w is (typeof WIDGET_CATALOG)[number] => Boolean(w)),
        [widgetsOrder]
    )

    const removedWidgets = useMemo(
        () => WIDGET_CATALOG.filter((w) => !widgetsOrder.includes(w.id)),
        [widgetsOrder]
    )

    const widgetCount = widgets.length
    const safeActiveIndex = widgetCount === 0 ? 0 : Math.min(activeWidget, widgetCount - 1)

    useEffect(() => {
        if (activeWidget !== safeActiveIndex) {
            setActiveWidget(safeActiveIndex)
        }
    }, [activeWidget, safeActiveIndex])

    const moveWidget = (fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex || toIndex < 0 || toIndex >= widgetsOrder.length) return
        setWidgetsOrder((prev) => {
            const next = [...prev]
            const [moved] = next.splice(fromIndex, 1)
            next.splice(toIndex, 0, moved)
            return next
        })
    }

    const removeWidget = (id: WidgetId) => {
        setWidgetsOrder((prev) => prev.filter((item) => item !== id))
    }

    const addWidget = (id: WidgetId) => {
        setWidgetsOrder((prev) => (prev.includes(id) ? prev : [...prev, id]))
    }

    const resetWidgets = () => {
        setWidgetsOrder(DEFAULT_WIDGET_ORDER)
        setActiveWidget(0)
    }

    const LONG_PRESS_MS = 2000
    const MOVE_THRESHOLD = 12

    const longPressTimer = useRef<NodeJS.Timeout | null>(null)
    const startXRef = useRef<number | null>(null)
    const startYRef = useRef<number | null>(null)
    const swipeLockRef = useRef(false)

    const goNext = () => {
        if (widgetCount <= 1) return
        setActiveWidget((p) => (p + 1) % widgetCount)
    }
    const goPrev = () => {
        if (widgetCount <= 1) return
        setActiveWidget((p) => (p - 1 + widgetCount) % widgetCount)
    }

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
                                touchAction: editMode ? "auto" : "none",
                            }}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerEnd}
                            onPointerCancel={handlePointerEnd}
                        >
                            {!editMode && widgetCount > 0 && (
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={widgets[safeActiveIndex].id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        transition={{ duration: 0.4 }}
                                        className="w-full h-full"
                                    >
                                        {widgets[safeActiveIndex].render()}
                                    </motion.div>
                                </AnimatePresence>
                            )}

                            {!editMode && widgetCount === 0 && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.96 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="w-full h-full rounded-[60px] bg-gradient-to-b from-white/[0.08] to-white/[0.03] backdrop-blur-2xl ring-1 ring-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.55)] flex flex-col items-center justify-center gap-5 text-white"
                                >
                                    <div className="w-16 h-16 rounded-3xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center text-white/70">
                                        <IoAppsOutline className="w-8 h-8" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xl font-semibold tracking-tight text-white/90">
                                            배치된 위젯이 없습니다
                                        </p>
                                        <p className="text-sm text-white/45 mt-1">
                                            원하는 위젯을 선택해 대시보드에 추가하세요
                                        </p>
                                    </div>
                                    <button
                                        className="flex items-center gap-2 bg-white text-neutral-950 hover:bg-white/90 active:scale-95 px-6 py-2.5 rounded-full text-sm font-semibold shadow-lg transition-all cursor-pointer"
                                        onClick={() => setEditMode(true)}
                                    >
                                        <IoAdd className="w-4 h-4" />
                                        위젯 추가
                                    </button>
                                </motion.div>
                            )}

                            <AnimatePresence>
                                {editMode && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.985 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.985 }}
                                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                        className="absolute inset-0 rounded-[60px] bg-neutral-900/80 backdrop-blur-3xl ring-1 ring-white/15 shadow-[0_30px_90px_rgba(0,0,0,0.75)] px-9 py-7 flex flex-col justify-between text-white overflow-hidden"
                                    >
                                        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/[0.07] to-transparent" />

                                        {/* Header */}
                                        <div className="relative flex items-center justify-between px-1">
                                            <h2 className="text-[19px] font-semibold tracking-tight text-white/95">
                                                위젯 편집
                                            </h2>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={resetWidgets}
                                                    className="flex items-center gap-1.5 bg-white/[0.08] hover:bg-white/[0.14] active:scale-[0.98] px-3.5 py-1.5 rounded-full text-xs font-medium text-white/80 transition-colors cursor-pointer"
                                                >
                                                    <IoRefresh className="w-3.5 h-3.5" />
                                                    재설정
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditMode(false)}
                                                    className="flex items-center gap-1 bg-white text-neutral-950 hover:bg-white/90 active:scale-[0.98] px-4 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer"
                                                >
                                                    <IoCheckmark className="w-3.5 h-3.5" />
                                                    완료
                                                </button>
                                            </div>
                                        </div>

                                        {/* Active Widgets Grid */}
                                        <div className="relative my-auto flex-1 flex flex-col justify-center">
                                            {widgets.length === 0 ? (
                                                <div className="h-[268px] rounded-3xl border border-dashed border-white/15 bg-white/[0.02] flex flex-col items-center justify-center gap-1.5 text-white/40">
                                                    <IoAppsOutline className="w-6 h-6 opacity-60" />
                                                    <span className="text-xs">
                                                        아래 보관함에서 위젯을 선택해 배치하세요
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-3 gap-x-4 gap-y-3.5">
                                                    {widgets.map((widget, idx) => {
                                                        const isDragging = draggedId === widget.id
                                                        const isDragOver = dragOverId === widget.id && !isDragging
                                                        return (
                                                            <motion.div
                                                                layout
                                                                key={widget.id}
                                                                transition={{
                                                                    layout: {
                                                                        duration: 0.25,
                                                                        ease: [0.22, 1, 0.36, 1],
                                                                    },
                                                                }}
                                                                draggable
                                                                onDragStart={() => setDraggedId(widget.id)}
                                                                onDragOver={(e) => {
                                                                    e.preventDefault()
                                                                    if (dragOverId !== widget.id) {
                                                                        setDragOverId(widget.id)
                                                                    }
                                                                }}
                                                                onDragLeave={() => {
                                                                    if (dragOverId === widget.id) {
                                                                        setDragOverId(null)
                                                                    }
                                                                }}
                                                                onDrop={() => {
                                                                    if (draggedId && draggedId !== widget.id) {
                                                                        const fromIdx = widgetsOrder.indexOf(draggedId)
                                                                        if (fromIdx !== -1) moveWidget(fromIdx, idx)
                                                                    }
                                                                    setDraggedId(null)
                                                                    setDragOverId(null)
                                                                }}
                                                                onDragEnd={() => {
                                                                    setDraggedId(null)
                                                                    setDragOverId(null)
                                                                }}
                                                                className={`group relative w-[252px] h-[129px] rounded-[20px] transition-[opacity,box-shadow] duration-200 select-none cursor-grab active:cursor-grabbing ${
                                                                    isDragging
                                                                        ? "opacity-45 ring-2 ring-white/40"
                                                                        : isDragOver
                                                                          ? "ring-2 ring-white/80 shadow-[0_12px_32px_rgba(255,255,255,0.16)]"
                                                                          : "ring-1 ring-white/15 hover:ring-white/35 shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
                                                                }`}
                                                            >
                                                                {/* Live Scaled Widget Preview */}
                                                                <div className="w-full h-full rounded-[20px] overflow-hidden bg-[#1e1e1e]">
                                                                    <div
                                                                        className="pointer-events-none"
                                                                        style={{
                                                                            width: CARD.width,
                                                                            height: CARD.height,
                                                                            transform: "scale(0.293023)",
                                                                            transformOrigin: "top left",
                                                                        }}
                                                                    >
                                                                        {widget.render()}
                                                                    </div>
                                                                </div>

                                                                {/* iOS-style Remove Badge */}
                                                                <button
                                                                    type="button"
                                                                    aria-label={`${widget.label} 제거`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        removeWidget(widget.id)
                                                                    }}
                                                                    className="absolute -top-2 -left-2 z-10 w-6 h-6 rounded-full bg-neutral-700/95 hover:bg-red-500 text-white ring-2 ring-neutral-900 flex items-center justify-center shadow-lg transition-colors cursor-pointer"
                                                                >
                                                                    <IoRemove className="w-3.5 h-3.5" />
                                                                </button>

                                                                {/* Floating Bottom Bar: Label + Reorder Arrows */}
                                                                <div className="absolute inset-x-2 bottom-1.5 z-10 flex items-center justify-between px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-md ring-1 ring-white/15 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <span className="text-[10px] font-medium text-white/90 pl-1">
                                                                        {idx + 1}. {widget.label}
                                                                    </span>
                                                                    <div className="flex items-center gap-0.5">
                                                                        <button
                                                                            type="button"
                                                                            aria-label="왼쪽으로 이동"
                                                                            disabled={idx === 0}
                                                                            onClick={() => moveWidget(idx, idx - 1)}
                                                                            className="w-5 h-5 rounded-full hover:bg-white/20 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer disabled:cursor-default"
                                                                        >
                                                                            <IoChevronBack className="w-3 h-3" />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            aria-label="오른쪽으로 이동"
                                                                            disabled={idx === widgets.length - 1}
                                                                            onClick={() => moveWidget(idx, idx + 1)}
                                                                            className="w-5 h-5 rounded-full hover:bg-white/20 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer disabled:cursor-default"
                                                                        >
                                                                            <IoChevronForward className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Widget Dock / Library */}
                                        <div className="relative rounded-[22px] bg-black/35 ring-1 ring-white/10 px-4 py-2.5 flex items-center justify-between gap-4">
                                            <span className="text-[11px] font-medium uppercase tracking-widest text-white/45 shrink-0">
                                                보관함
                                            </span>
                                            {removedWidgets.length === 0 ? (
                                                <span className="text-xs text-white/35 flex-1 text-center py-0.5">
                                                    모든 위젯이 배치되었습니다
                                                </span>
                                            ) : (
                                                <div className="flex items-center gap-2 flex-1 overflow-x-auto no-scrollbar">
                                                    {removedWidgets.map((widget) => (
                                                        <button
                                                            key={widget.id}
                                                            type="button"
                                                            onClick={() => addWidget(widget.id)}
                                                            className="flex items-center gap-1.5 bg-white/[0.08] hover:bg-white/[0.16] active:scale-95 ring-1 ring-white/10 px-3.5 py-1.5 rounded-full text-xs font-medium text-white/90 transition-all shrink-0 cursor-pointer"
                                                        >
                                                            <IoAdd className="w-3.5 h-3.5 text-white/70" />
                                                            <span>{widget.label}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        {!editMode && widgetCount > 0 && (
                            <div
                                className="absolute left-[1010px] w-[860px] flex justify-center gap-3"
                                style={{ bottom: indicatorBottom }}
                            >
                                {widgets.map((widget, idx) => (
                                    <button
                                        key={widget.id}
                                        onClick={() => setActiveWidget(idx)}
                                        className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                            safeActiveIndex === idx ? "bg-white w-6" : "bg-white/20"
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
