import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    IoAdd,
    IoAppsOutline,
    IoCheckmark,
    IoChevronBack,
    IoChevronForward,
    IoOptionsOutline,
    IoRefresh,
    IoRemove,
} from "react-icons/io5"
import { Clock } from "~/components/Clock"
import { DateDisplay } from "~/components/DateDisplay"
import { NewsCarousel } from "~/components/NewsCarousel"
import { MusicPlayer } from "~/components/MusicPlayer"
import { CalendarWidget } from "~/components/CalendarWidget"
import { ScheduleWidget } from "~/components/ScheduleWidget"
import { SettingPanel } from "~/components/SettingPanel"
import { WeatherWidget } from "~/components/WeatherWidget"

const CARD_W = 860
const CARD_H = 440

function ScaledWidgetBox({
    children,
    className = "",
    fullBleed = false,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
}: {
    children: React.ReactNode
    className?: string
    fullBleed?: boolean
    onPointerDown?: React.PointerEventHandler<HTMLDivElement>
    onPointerMove?: React.PointerEventHandler<HTMLDivElement>
    onPointerUp?: React.PointerEventHandler<HTMLDivElement>
    onPointerCancel?: React.PointerEventHandler<HTMLDivElement>
}) {
    const boxRef = useRef<HTMLDivElement | null>(null)
    const [scale, setScale] = useState(1)
    const [isCovered, setIsCovered] = useState(false)

    useEffect(() => {
        const el = boxRef.current
        if (!el) return

        const update = () => {
            const rect = el.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
                const scaleW = rect.width / CARD_W
                const scaleH = rect.height / CARD_H
                const ratioDiff = Math.max(scaleW / scaleH, scaleH / scaleW)
                if (fullBleed && ratioDiff <= 1.22) {
                    setScale(Math.max(scaleW, scaleH))
                    setIsCovered(true)
                } else {
                    setScale(Math.min(scaleW, scaleH))
                    setIsCovered(false)
                }
            }
        }

        update()
        const observer = new ResizeObserver(update)
        observer.observe(el)
        window.addEventListener("resize", update)
        return () => {
            observer.disconnect()
            window.removeEventListener("resize", update)
        }
    }, [fullBleed])

    return (
        <div
            ref={boxRef}
            className={`relative w-full h-full flex items-center justify-center overflow-hidden ${className}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
        >
            <div
                className="relative shrink-0"
                style={{
                    width: Math.round(CARD_W * scale),
                    height: Math.round(CARD_H * scale),
                }}
            >
                <div
                    className={`absolute top-0 left-0 ${isCovered ? "fullscreen-widget" : ""}`}
                    style={{
                        width: CARD_W,
                        height: CARD_H,
                        transform: `scale(${scale})`,
                        transformOrigin: "top left",
                    }}
                >
                    {children}
                </div>
            </div>
        </div>
    )
}

export default function Home() {
    useEffect(() => {
        const handler = (e: MouseEvent) => e.preventDefault()
        document.addEventListener("contextmenu", handler)
        return () => document.removeEventListener("contextmenu", handler)
    }, [])

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

    const [activePage, setActivePage] = useState(0)
    const [direction, setDirection] = useState<1 | -1>(1)
    const [editMode, setEditMode] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [settingsDragProgress, setSettingsDragProgress] = useState(0)
    const [isDraggingSettings, setIsDraggingSettings] = useState(false)
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

    // 0: 시계, 1..N: 배치된 위젯
    const totalPages = 1 + widgets.length
    const safePage = Math.min(activePage, totalPages - 1)

    useEffect(() => {
        if (activePage !== safePage) {
            setActivePage(safePage)
        }
    }, [activePage, safePage])

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
        setActivePage(0)
    }

    const LONG_PRESS_MS = 2000
    const MOVE_THRESHOLD = 12

    const longPressTimer = useRef<NodeJS.Timeout | null>(null)
    const startXRef = useRef<number | null>(null)
    const startYRef = useRef<number | null>(null)
    const swipeLockRef = useRef(false)
    const gestureModeRef = useRef<"none" | "horizontal" | "settings-open" | "settings-close">("none")

    const [showIndicator, setShowIndicator] = useState(false)
    const indicatorTimerRef = useRef<number | null>(null)
    const hasMountedPageRef = useRef(false)

    const scheduleHideIndicator = () => {
        if (indicatorTimerRef.current !== null) {
            window.clearTimeout(indicatorTimerRef.current)
        }
        setShowIndicator(true)
        indicatorTimerRef.current = window.setTimeout(() => {
            setShowIndicator(false)
            indicatorTimerRef.current = null
        }, 2500)
    }

    useEffect(() => {
        if (!hasMountedPageRef.current) {
            hasMountedPageRef.current = true
            return
        }
        scheduleHideIndicator()
    }, [safePage])

    useEffect(() => {
        return () => {
            if (indicatorTimerRef.current !== null) {
                window.clearTimeout(indicatorTimerRef.current)
            }
        }
    }, [])

    const goToPage = (target: number) => {
        if (target === safePage || target < 0 || target >= totalPages) return
        setDirection(target > safePage ? 1 : -1)
        setActivePage(target)
    }

    const goNext = () => {
        if (totalPages <= 1) return
        setDirection(1)
        setActivePage((p) => (p + 1) % totalPages)
    }

    const goPrev = () => {
        if (totalPages <= 1) return
        setDirection(-1)
        setActivePage((p) => (p - 1 + totalPages) % totalPages)
    }

    useEffect(() => {
        if (editMode) return
        const onKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null
            const active = document.activeElement as HTMLElement | null
            if (
                target?.closest('input, textarea, select, [contenteditable="true"]') ||
                active?.closest('input, textarea, select, [contenteditable="true"]')
            ) {
                return
            }
            if (e.key === "ArrowRight") goNext()
            else if (e.key === "ArrowLeft") goPrev()
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [editMode, totalPages])

    const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (editMode) return
        const target = e.target as HTMLElement | null
        const active = document.activeElement as HTMLElement | null
        if (
            !settingsOpen &&
            (target?.closest('input, textarea, select, [contenteditable="true"], aside, [role="dialog"]') ||
                active?.closest('input, textarea, select, [contenteditable="true"]'))
        ) {
            return
        }
        if (settingsOpen && target?.closest("button, a, input, select, textarea")) {
            return
        }

        startXRef.current = e.clientX
        startYRef.current = e.clientY
        gestureModeRef.current = "none"

        if (!settingsOpen) {
            longPressTimer.current = setTimeout(() => {
                setEditMode(true)
                longPressTimer.current = null
            }, LONG_PRESS_MS)
        }
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

        // 시계 페이지(safePage === 0)에서만 아래→위 스와이프로 설정창 따라 올라오게 함
        if (gestureModeRef.current === "none") {
            if (settingsOpen && dy > 10 && Math.abs(dy) > Math.abs(dx)) {
                gestureModeRef.current = "settings-close"
                setIsDraggingSettings(true)
            } else if (!settingsOpen && safePage === 0 && dy < -10 && Math.abs(dy) > Math.abs(dx)) {
                gestureModeRef.current = "settings-open"
                setIsDraggingSettings(true)
            } else if (!settingsOpen && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy)) {
                gestureModeRef.current = "horizontal"
            }
        }

        const dragRange = Math.max(240, window.innerHeight * 0.45)

        if (gestureModeRef.current === "settings-open") {
            const progress = Math.max(0, Math.min(1, -dy / dragRange))
            setSettingsDragProgress(progress)
            return
        }

        if (gestureModeRef.current === "settings-close") {
            const progress = Math.max(0, Math.min(1, 1 - dy / dragRange))
            setSettingsDragProgress(progress)
            return
        }

        if (!settingsOpen && Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.6) {
            swipeLockRef.current = true
            if (dx < 0) {
                goNext()
            } else {
                goPrev()
            }
            startXRef.current = null
            startYRef.current = null
            gestureModeRef.current = "none"
            setTimeout(() => (swipeLockRef.current = false), 360)
        }
    }

    const handlePointerEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current)
            longPressTimer.current = null
        }

        if (gestureModeRef.current === "settings-open") {
            setIsDraggingSettings(false)
            if (settingsDragProgress >= 0.24) {
                setSettingsOpen(true)
                setSettingsDragProgress(1)
            } else {
                setSettingsOpen(false)
                setSettingsDragProgress(0)
            }
        } else if (gestureModeRef.current === "settings-close") {
            setIsDraggingSettings(false)
            if (settingsDragProgress <= 0.78) {
                setSettingsOpen(false)
                setSettingsDragProgress(0)
            } else {
                setSettingsOpen(true)
                setSettingsDragProgress(1)
            }
        }

        gestureModeRef.current = "none"
        startXRef.current = null
        startYRef.current = null
    }

    const currentWidget = safePage > 0 ? widgets[safePage - 1] : null
    const pageKey = safePage === 0 ? "clock-page" : `widget-${currentWidget?.id}`

    return (
        <div
            className="w-screen h-[100svh] bg-[#1e1e1e] text-white overflow-hidden relative flex flex-col items-center justify-center select-none"
            style={{ touchAction: editMode ? "auto" : "none" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
        >
            {/* 설정창 (시계 페이지에서 아래→위 스와이프로 열림) */}
            <SettingPanel
                isOpen={settingsOpen}
                dragProgress={settingsDragProgress}
                isDragging={isDraggingSettings}
                onClose={() => {
                    setSettingsOpen(false)
                    setSettingsDragProgress(0)
                }}
                onOpenWidgetEditor={() => {
                    setSettingsOpen(false)
                    setSettingsDragProgress(0)
                    setEditMode(true)
                }}
            />

            {/* 메인 단일 페이지 스테이지 */}
            <div className="w-full h-full flex items-center justify-center">
                <AnimatePresence mode="wait" custom={direction}>
                    <motion.div
                        key={pageKey}
                        custom={direction}
                        variants={{
                            enter: (dir: 1 | -1) => ({ opacity: 0, x: dir * 48 }),
                            center: { opacity: 1, x: 0 },
                            exit: (dir: 1 | -1) => ({ opacity: 0, x: dir * -48 }),
                        }}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                        className="w-full h-full flex items-center justify-center"
                    >
                        {safePage === 0 ? (
                            <div
                                className="flex flex-col items-center justify-center gap-6 sm:gap-10 px-6 sm:px-14"
                                style={{
                                    width: "min(100%, 1360px, calc((100svh - 180px) * 2.78))",
                                }}
                            >
                                <Clock />
                                <DateDisplay />
                            </div>
                        ) : currentWidget ? (
                            <div className="w-full h-full">{currentWidget.render()}</div>
                        ) : null}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* 하단 페이지 인디케이터 (페이지 이동 후 2.5초간 표시) */}
            <AnimatePresence>
                {!editMode && totalPages > 1 && showIndicator && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseEnter={() => {
                            if (indicatorTimerRef.current !== null) {
                                window.clearTimeout(indicatorTimerRef.current)
                                indicatorTimerRef.current = null
                            }
                        }}
                        onMouseLeave={scheduleHideIndicator}
                        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-2 rounded-full bg-black/30 backdrop-blur-md ring-1 ring-white/15"
                    >
                        {Array.from({ length: totalPages }, (_, idx) => {
                            const label = idx === 0 ? "시계" : widgets[idx - 1]?.label ?? ""
                            return (
                                <button
                                    key={idx === 0 ? "clock" : widgets[idx - 1]?.id}
                                    type="button"
                                    aria-label={`${label} 페이지로 이동`}
                                    onClick={() => goToPage(idx)}
                                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                                        safePage === idx
                                            ? "bg-white w-6"
                                            : "bg-white/25 hover:bg-white/45 w-1.5"
                                    }`}
                                />
                            )
                        })}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* OS 스타일 전체 화면 위젯 편집 오버레이 */}
            <AnimatePresence>
                {editMode && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-8"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.985 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.985 }}
                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            className="w-full max-w-[920px] max-h-[90svh] rounded-[36px] bg-neutral-900/90 ring-1 ring-white/15 shadow-[0_30px_90px_rgba(0,0,0,0.8)] p-6 sm:p-8 flex flex-col gap-6 overflow-hidden"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-1 shrink-0">
                                <h2 className="text-[19px] font-semibold tracking-tight text-white/95">
                                    위젯 편집
                                </h2>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={resetWidgets}
                                        className="flex items-center gap-1.5 bg-white/[0.08] hover:bg-white/[0.14] px-3.5 py-1.5 rounded-full text-xs font-medium text-white/80 transition-colors cursor-pointer"
                                    >
                                        <IoRefresh className="w-3.5 h-3.5" />
                                        재설정
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditMode(false)}
                                        className="flex items-center gap-1 bg-white text-neutral-950 hover:bg-white/90 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer"
                                    >
                                        <IoCheckmark className="w-3.5 h-3.5" />
                                        완료
                                    </button>
                                </div>
                            </div>

                            {/* Active Widgets Grid */}
                            <div className="flex-1 overflow-y-auto no-scrollbar py-1">
                                {widgets.length === 0 ? (
                                    <div className="h-[220px] rounded-3xl border border-dashed border-white/15 bg-white/[0.02] flex flex-col items-center justify-center gap-1.5 text-white/40">
                                        <IoAppsOutline className="w-6 h-6 opacity-60" />
                                        <span className="text-xs">
                                            아래 보관함에서 위젯을 선택해 배치하세요
                                        </span>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 px-2 pt-2">
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
                                                            const fromIdx =
                                                                widgetsOrder.indexOf(draggedId)
                                                            if (fromIdx !== -1)
                                                                moveWidget(fromIdx, idx)
                                                        }
                                                        setDraggedId(null)
                                                        setDragOverId(null)
                                                    }}
                                                    onDragEnd={() => {
                                                        setDraggedId(null)
                                                        setDragOverId(null)
                                                    }}
                                                    className={`group relative w-full aspect-[860/440] rounded-[20px] transition-[opacity,box-shadow] duration-200 select-none cursor-grab active:cursor-grabbing ${
                                                        isDragging
                                                            ? "opacity-45 ring-2 ring-white/40"
                                                            : isDragOver
                                                              ? "ring-2 ring-white/80 shadow-[0_12px_32px_rgba(255,255,255,0.16)]"
                                                              : "ring-1 ring-white/15 hover:ring-white/35 shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
                                                    }`}
                                                >
                                                    <div className="w-full h-full rounded-[20px] overflow-hidden bg-[#1e1e1e] pointer-events-none">
                                                        <ScaledWidgetBox>
                                                            {widget.render()}
                                                        </ScaledWidgetBox>
                                                    </div>

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

                                                    <div className="absolute inset-x-2 bottom-1.5 z-10 flex items-center justify-between px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md ring-1 ring-white/15 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <span className="text-[11px] font-medium text-white/90 pl-1">
                                                            {idx + 1}. {widget.label}
                                                        </span>
                                                        <div className="flex items-center gap-0.5">
                                                            <button
                                                                type="button"
                                                                aria-label="왼쪽으로 이동"
                                                                disabled={idx === 0}
                                                                onClick={() =>
                                                                    moveWidget(idx, idx - 1)
                                                                }
                                                                className="w-5 h-5 rounded-full hover:bg-white/20 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer disabled:cursor-default"
                                                            >
                                                                <IoChevronBack className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                aria-label="오른쪽으로 이동"
                                                                disabled={idx === widgets.length - 1}
                                                                onClick={() =>
                                                                    moveWidget(idx, idx + 1)
                                                                }
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
                            <div className="rounded-[20px] bg-black/35 ring-1 ring-white/10 px-4 py-2.5 flex items-center justify-between gap-4 shrink-0">
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
                                                className="flex items-center gap-1.5 bg-white/[0.08] hover:bg-white/[0.16] ring-1 ring-white/10 px-3.5 py-1.5 rounded-full text-xs font-medium text-white/90 transition-colors shrink-0 cursor-pointer"
                                            >
                                                <IoAdd className="w-3.5 h-3.5 text-white/70" />
                                                <span>{widget.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
