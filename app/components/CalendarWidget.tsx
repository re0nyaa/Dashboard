import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
    IoAdd,
    IoCalendarOutline,
    IoCheckmark,
    IoChevronBack,
    IoChevronDown,
    IoClose,
    IoLocationOutline,
    IoMenuOutline,
    IoPeopleOutline,
    IoTimeOutline,
    IoTrashOutline,
    IoVideocamOutline,
} from "react-icons/io5"
import {
    createGoogleEvent,
    deleteGoogleEvent,
    fetchGoogleAuthStatus,
    fetchGoogleCalendarData,
    type GoogleCalendarMeta,
    type ScheduleItem,
    updateGoogleEvent,
} from "../utils/schedule"
import { useToaster } from "./Toaster"
import { isLightClockAppearance, useClockAppearance } from "./Clock"

type DayCell = {
    day: number
    inMonth: boolean
    isToday: boolean
    col: number
}

type HolidaySet = Set<number>

function buildMonthGrid(date: Date, todayDate?: Date): DayCell[] {
    const year = date.getFullYear()
    const month = date.getMonth()
    const isSameMonthAsToday =
        todayDate != null && todayDate.getFullYear() === year && todayDate.getMonth() === month
    const today = isSameMonthAsToday ? todayDate.getDate() : -1

    const firstDayCol = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()

    const cells: DayCell[] = []

    const totalCells = firstDayCol + daysInMonth <= 35 ? 35 : 42

    for (let i = 0; i < totalCells; i++) {
        const col = i % 7
        const dayInMonth = i - firstDayCol + 1

        if (dayInMonth < 1) {
            cells.push({
                day: daysInPrevMonth + dayInMonth,
                inMonth: false,
                isToday: false,
                col,
            })
            continue
        }

        if (dayInMonth > daysInMonth) {
            cells.push({
                day: dayInMonth - daysInMonth,
                inMonth: false,
                isToday: false,
                col,
            })
            continue
        }

        cells.push({
            day: dayInMonth,
            inMonth: true,
            isToday: dayInMonth === today,
            col,
        })
    }

    return cells
}

async function fetchKoreanHolidays(year: number, month: number): Promise<HolidaySet> {
    const url = `/api/holidays?year=${year}&month=${month}`

    try {
        const res = await fetch(url)
        if (!res.ok) return new Set<number>()

        const days = (await res.json()) as unknown
        if (!Array.isArray(days)) return new Set<number>()

        const set = new Set<number>()
        for (const d of days) {
            const n = typeof d === "number" ? d : Number.parseInt(String(d), 10)
            if (Number.isFinite(n)) set.add(n)
        }
        return set
    } catch {
        return new Set<number>()
    }
}

function pad2(n: number) {
    return String(n).padStart(2, "0")
}

function toDateKey(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function toTimeInputValue(d: Date) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function formatKoreanTime(d: Date) {
    return new Intl.DateTimeFormat("ko-KR", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(d)
}

function formatShortDate(d: Date) {
    return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatEventTimeText(item: ScheduleItem) {
    const start = new Date(item.start)
    const end = item.end ? new Date(item.end) : undefined
    const isMultiDay =
        end != null && Number.isFinite(end.getTime()) && toDateKey(start) !== toDateKey(end)

    if (item.allDay) {
        if (isMultiDay && end) {
            return `${formatShortDate(start)} - ${formatShortDate(end)} · 하루 종일`
        }
        return "하루 종일"
    }
    if (end) {
        if (isMultiDay) {
            return `${formatShortDate(start)} ${formatKoreanTime(start)} - ${formatShortDate(end)} ${formatKoreanTime(end)}`
        }
        return `${formatKoreanTime(start)} - ${formatKoreanTime(end)}`
    }
    return formatKoreanTime(start)
}

export type SelectOption = {
    value: string
    label: string
    dotColor?: string
}

export function CustomSelect({
    value,
    options,
    onChange,
    disabled = false,
    compact = false,
    placement = "bottom",
    align = "left",
    className = "",
    isLight = false,
}: {
    value: string
    options: SelectOption[]
    onChange: (value: string) => void
    disabled?: boolean
    compact?: boolean
    placement?: "bottom" | "top"
    align?: "left" | "right"
    className?: string
    isLight?: boolean
}) {
    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLDivElement | null>(null)
    const selected = options.find((o) => o.value === value) ?? options[0]

    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener("mousedown", onDown)
        return () => document.removeEventListener("mousedown", onDown)
    }, [open])

    return (
        <div ref={rootRef} className={`relative ${className}`}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setOpen((v) => !v)}
                className={`w-full flex items-center justify-between gap-2 rounded-xl transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                    isLight
                        ? "bg-black/[0.04] hover:bg-black/[0.08] ring-1 ring-black/10 text-zinc-900"
                        : "bg-white/[0.07] hover:bg-white/[0.11] ring-1 ring-white/15 text-white"
                } ${compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"}`}
            >
                <span className="flex items-center gap-2 min-w-0">
                    {selected?.dotColor ? (
                        <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: selected.dotColor }}
                        />
                    ) : null}
                    <span className="truncate">{selected?.label ?? ""}</span>
                </span>
                <IoChevronDown
                    className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                        isLight ? "text-zinc-500" : "text-white/55"
                    } ${open ? "rotate-180" : ""}`}
                />
            </button>

            <AnimatePresence>
                {open ? (
                    <motion.div
                        initial={{ opacity: 0, y: placement === "top" ? 4 : -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: placement === "top" ? 4 : -4, scale: 0.98 }}
                        transition={{ duration: 0.12 }}
                        className={`absolute z-50 w-max min-w-full max-w-[240px] max-h-44 overflow-y-auto no-scrollbar rounded-xl shadow-2xl p-1 ${
                            isLight
                                ? "bg-white border border-black/10"
                                : "bg-[#232836] border border-white/15"
                        } ${placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"} ${
                            align === "right" ? "right-0" : "left-0"
                        }`}
                    >
                        {options.map((opt) => {
                            const active = opt.value === value
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(opt.value)
                                        setOpen(false)
                                    }}
                                    className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition cursor-pointer ${
                                        compact ? "text-[11px]" : "text-xs"
                                    } ${
                                        active
                                            ? isLight
                                                ? "bg-[#0A84FF]/12 text-[#0A84FF] font-semibold"
                                                : "bg-[#8AB4F8]/20 text-[#8AB4F8] font-semibold"
                                            : isLight
                                              ? "text-zinc-800 hover:bg-black/[0.05]"
                                              : "text-white/85 hover:bg-white/[0.08]"
                                    }`}
                                >
                                    <span className="flex items-center gap-2 min-w-0">
                                        {opt.dotColor ? (
                                            <span
                                                className="w-2 h-2 rounded-full shrink-0"
                                                style={{ backgroundColor: opt.dotColor }}
                                            />
                                        ) : null}
                                        <span className="truncate">{opt.label}</span>
                                    </span>
                                    {active ? (
                                        <IoCheckmark className="w-3.5 h-3.5 shrink-0" />
                                    ) : null}
                                </button>
                            )
                        })}
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    )
}

export type GoogleEventFormState = {
    mode: "create" | "edit"
    eventId?: string
    calendarId: string
    title: string
    startDate: string
    endDate: string
    startTime: string
    endTime: string
    allDay: boolean
    location: string
    description: string
    attendees: string[]
    attendeeInput: string
    addGoogleMeet: boolean
    hangoutLink?: string
    recurrence: "" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
    reminderMinutes: number | null
    editingTime: boolean
}

export function GoogleEventForm({
    form,
    setForm,
    calendars,
    writableCalendars,
    submitting,
    onSubmit,
    onDelete,
    isLight = false,
}: {
    form: GoogleEventFormState
    setForm: (next: GoogleEventFormState) => void
    calendars: GoogleCalendarMeta[]
    writableCalendars: GoogleCalendarMeta[]
    submitting: boolean
    onSubmit: (e: React.FormEvent) => void
    onDelete: () => void
    isLight?: boolean
}) {
    const iconCls = `w-4 h-4 shrink-0 ${isLight ? "text-zinc-400" : "text-white/55"}`
    const inputCls = isLight
        ? "hover:bg-black/[0.04] focus:bg-black/[0.05] text-zinc-900 placeholder-zinc-400"
        : "hover:bg-white/[0.04] focus:bg-white/[0.06] text-white placeholder-white/40"
    const dateInputCls = isLight
        ? "rounded-lg bg-white ring-1 ring-black/10 px-2 py-1 text-zinc-900 outline-none"
        : "rounded-lg bg-white/[0.07] ring-1 ring-white/15 px-2 py-1 text-white outline-none"

    return (
        <form
            onSubmit={onSubmit}
            className="flex-1 min-h-0 overflow-y-auto no-scrollbar pt-3 px-0.5 flex flex-col gap-3 text-xs"
        >
            {/* 구글 스타일 밑줄 제목 입력 + 일정 칩 */}
            <div className="pl-7 space-y-2.5">
                <input
                    type="text"
                    placeholder="제목 추가"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className={`w-full bg-transparent border-b pb-1.5 text-base font-medium outline-none transition ${
                        isLight
                            ? "border-black/15 focus:border-[#0A84FF] text-zinc-900 placeholder-zinc-400"
                            : "border-white/25 focus:border-[#8AB4F8] text-white placeholder-white/40"
                    }`}
                />
                <div className="flex items-center gap-1.5">
                    <span
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                            isLight
                                ? "bg-[#0A84FF]/12 text-[#0A84FF]"
                                : "bg-[#8AB4F8]/20 text-[#8AB4F8]"
                        }`}
                    >
                        일정
                    </span>
                    {form.allDay ? (
                        <span
                            className={`px-2 py-1 rounded-md text-[11px] ${
                                isLight
                                    ? "bg-black/[0.05] text-zinc-600"
                                    : "bg-white/[0.06] text-white/60"
                            }`}
                        >
                            종일
                        </span>
                    ) : null}
                </div>
            </div>

            {/* 시간 / 날짜 행 */}
            <div className="flex items-start gap-3">
                <IoTimeOutline className={`${iconCls} mt-1`} />
                <div className="flex-1 min-w-0">
                    <button
                        type="button"
                        onClick={() => setForm({ ...form, editingTime: !form.editingTime })}
                        className={`w-full text-left rounded-lg px-2 py-1 -mx-2 transition cursor-pointer ${
                            isLight ? "hover:bg-black/[0.04]" : "hover:bg-white/[0.06]"
                        }`}
                    >
                        <div
                            className={`text-[13px] font-medium ${
                                isLight ? "text-zinc-900" : "text-white/90"
                            }`}
                        >
                            {form.startDate}
                            {!form.allDay
                                ? `  ${form.startTime} – ${form.endTime}`
                                : " (하루 종일)"}
                        </div>
                        <div
                            className={`text-[11px] mt-0.5 ${
                                isLight ? "text-zinc-500" : "text-white/45"
                            }`}
                        >
                            {form.allDay ? "하루 종일" : "시간 지정"} ·{" "}
                            {form.recurrence === "DAILY"
                                ? "매일 반복"
                                : form.recurrence === "WEEKLY"
                                  ? "매주 반복"
                                  : form.recurrence === "MONTHLY"
                                    ? "매월 반복"
                                    : form.recurrence === "YEARLY"
                                      ? "매년 반복"
                                      : "반복 안함"}
                        </div>
                    </button>

                    {form.editingTime ? (
                        <div
                            className={`mt-2 space-y-2 rounded-xl p-2.5 ring-1 ${
                                isLight
                                    ? "bg-black/[0.03] ring-black/8"
                                    : "bg-white/[0.04] ring-white/10"
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <label
                                    className={`flex items-center gap-1.5 cursor-pointer ${
                                        isLight ? "text-zinc-700" : "text-white/80"
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={form.allDay}
                                        onChange={(e) =>
                                            setForm({ ...form, allDay: e.target.checked })
                                        }
                                        className="rounded accent-[#0A84FF]"
                                    />
                                    하루 종일
                                </label>
                                <CustomSelect
                                    compact
                                    isLight={isLight}
                                    align="right"
                                    className="w-28"
                                    value={form.recurrence}
                                    options={[
                                        { value: "", label: "반복 안함" },
                                        { value: "DAILY", label: "매일" },
                                        { value: "WEEKLY", label: "매주" },
                                        { value: "MONTHLY", label: "매월" },
                                        { value: "YEARLY", label: "매년" },
                                    ]}
                                    onChange={(val) =>
                                        setForm({
                                            ...form,
                                            recurrence: val as GoogleEventFormState["recurrence"],
                                        })
                                    }
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                <input
                                    type="date"
                                    value={form.startDate}
                                    onChange={(e) =>
                                        setForm({ ...form, startDate: e.target.value })
                                    }
                                    className={dateInputCls}
                                />
                                <input
                                    type="date"
                                    value={form.endDate}
                                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                                    className={dateInputCls}
                                />
                            </div>
                            {!form.allDay ? (
                                <div className="grid grid-cols-2 gap-1.5">
                                    <input
                                        type="time"
                                        value={form.startTime}
                                        onChange={(e) =>
                                            setForm({ ...form, startTime: e.target.value })
                                        }
                                        className={dateInputCls}
                                    />
                                    <input
                                        type="time"
                                        value={form.endTime}
                                        onChange={(e) =>
                                            setForm({ ...form, endTime: e.target.value })
                                        }
                                        className={dateInputCls}
                                    />
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>

            {/* 참석자 행 */}
            <div className="flex items-start gap-3">
                <IoPeopleOutline className={`${iconCls} mt-1.5`} />
                <div className="flex-1 min-w-0">
                    <input
                        type="text"
                        placeholder="참석자 추가 (이메일 입력 후 띄어쓰기)"
                        value={form.attendeeInput}
                        onChange={(e) => {
                            const raw = e.target.value
                            if (/[\s,]/.test(raw)) {
                                const parts = raw
                                    .split(/[\s,]+/)
                                    .map((s) => s.trim())
                                    .filter(Boolean)
                                const validEmails = parts.filter((p) => p.includes("@"))
                                const lastToken =
                                    raw.endsWith(" ") || raw.endsWith(",")
                                        ? ""
                                        : (parts[parts.length - 1] ?? "")
                                const remain =
                                    lastToken && !lastToken.includes("@") ? lastToken : ""
                                setForm({
                                    ...form,
                                    attendees:
                                        validEmails.length > 0
                                            ? Array.from(
                                                  new Set([...form.attendees, ...validEmails])
                                              )
                                            : form.attendees,
                                    attendeeInput: remain,
                                })
                                return
                            }
                            setForm({ ...form, attendeeInput: raw })
                        }}
                        className={`w-full rounded-lg px-2 py-1 -mx-2 outline-none ${inputCls}`}
                    />
                    {form.attendees.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                            {form.attendees.map((email) => (
                                <span
                                    key={email}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${
                                        isLight
                                            ? "bg-black/[0.06] text-zinc-700"
                                            : "bg-white/10 text-white/85"
                                    }`}
                                >
                                    {email}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setForm({
                                                ...form,
                                                attendees: form.attendees.filter(
                                                    (x) => x !== email
                                                ),
                                            })
                                        }
                                        className={`cursor-pointer ${
                                            isLight
                                                ? "text-zinc-400 hover:text-zinc-700"
                                                : "text-white/50 hover:text-white"
                                        }`}
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Google Meet 화상 회의 */}
            <div className="flex items-center gap-3">
                <IoVideocamOutline className="w-4 h-4 text-[#FBCB04] shrink-0" />
                {form.hangoutLink ? (
                    <a
                        href={form.hangoutLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#0A84FF] hover:underline truncate text-xs"
                    >
                        Google Meet 참여 ({form.hangoutLink})
                    </a>
                ) : (
                    <button
                        type="button"
                        onClick={() => setForm({ ...form, addGoogleMeet: !form.addGoogleMeet })}
                        className={`flex-1 text-left rounded-lg px-2 py-1 -mx-2 transition cursor-pointer ${
                            form.addGoogleMeet
                                ? isLight
                                    ? "bg-[#0A84FF]/12 text-[#0A84FF] font-medium"
                                    : "bg-[#8AB4F8]/15 text-[#8AB4F8] font-medium"
                                : isLight
                                  ? "hover:bg-black/[0.04] text-zinc-600"
                                  : "hover:bg-white/[0.06] text-white/70"
                        }`}
                    >
                        {form.addGoogleMeet
                            ? "✓ Google Meet 화상 회의 추가됨"
                            : "Google Meet 화상 회의 추가"}
                    </button>
                )}
            </div>

            {/* 위치 추가 */}
            <div className="flex items-center gap-3">
                <IoLocationOutline className={iconCls} />
                <input
                    type="text"
                    placeholder="위치 추가"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className={`flex-1 rounded-lg px-2 py-1 -mx-2 outline-none ${inputCls}`}
                />
            </div>

            {/* 설명 추가 */}
            <div className="flex items-start gap-3">
                <IoMenuOutline className={`${iconCls} mt-1.5`} />
                <textarea
                    placeholder="설명 추가"
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className={`flex-1 rounded-lg px-2 py-1 -mx-2 outline-none resize-none ${inputCls}`}
                />
            </div>

            {/* 캘린더 & 알림 */}
            <div className="flex items-start gap-3">
                <IoCalendarOutline className={`${iconCls} mt-1.5`} />
                <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                    <CustomSelect
                        compact
                        isLight={isLight}
                        placement="top"
                        disabled={form.mode === "edit"}
                        value={form.calendarId}
                        options={(writableCalendars.length > 0 ? writableCalendars : calendars).map(
                            (c) => ({
                                value: c.id,
                                label: c.summary,
                                dotColor: c.backgroundColor || "#8AB4F8",
                            })
                        )}
                        onChange={(val) => setForm({ ...form, calendarId: val })}
                    />
                    <CustomSelect
                        compact
                        isLight={isLight}
                        placement="top"
                        align="right"
                        value={form.reminderMinutes == null ? "" : String(form.reminderMinutes)}
                        options={[
                            { value: "", label: "기본 알림" },
                            { value: "10", label: "10분 전 알림" },
                            { value: "30", label: "30분 전 알림" },
                            { value: "60", label: "1시간 전 알림" },
                        ]}
                        onChange={(val) =>
                            setForm({
                                ...form,
                                reminderMinutes: val === "" ? null : Number(val),
                            })
                        }
                    />
                </div>
            </div>

            {/* 하단 저장 / 삭제 */}
            <div
                className={`flex items-center justify-between pt-2 mt-auto border-t ${
                    isLight ? "border-black/10" : "border-white/10"
                }`}
            >
                {form.mode === "edit" ? (
                    <button
                        type="button"
                        onClick={onDelete}
                        disabled={submitting}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-semibold cursor-pointer disabled:opacity-50 ${
                            isLight
                                ? "bg-red-500/10 hover:bg-red-500/18 text-red-600"
                                : "bg-red-500/15 hover:bg-red-500/25 text-red-300"
                        }`}
                    >
                        삭제
                    </button>
                ) : (
                    <div />
                )}
                <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-1.5 rounded-full bg-[#1a73e8] hover:bg-[#1967d2] text-white font-semibold cursor-pointer disabled:opacity-50 transition"
                >
                    {submitting ? "저장 중..." : "저장"}
                </button>
            </div>
        </form>
    )
}

const CALENDAR_CACHE_KEY = "dashboard.calendar.cache.v1"

type CalendarCache = {
    connected: boolean
    calendars: GoogleCalendarMeta[]
    events: ScheduleItem[]
    holidays: number[]
}

let memoryCalendarCache: CalendarCache | null = null

function loadCalendarCache(): CalendarCache {
    if (memoryCalendarCache) return memoryCalendarCache
    if (typeof window !== "undefined") {
        try {
            const raw = localStorage.getItem(CALENDAR_CACHE_KEY)
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<CalendarCache>
                const cache: CalendarCache = {
                    connected: Boolean(parsed.connected),
                    calendars: Array.isArray(parsed.calendars) ? parsed.calendars : [],
                    events: Array.isArray(parsed.events) ? parsed.events : [],
                    holidays: Array.isArray(parsed.holidays) ? parsed.holidays : [],
                }
                memoryCalendarCache = cache
                return cache
            }
        } catch {
            // ignore storage errors
        }
    }
    return { connected: false, calendars: [], events: [], holidays: [] }
}

function saveCalendarCache(patch: Partial<CalendarCache>) {
    const next: CalendarCache = { ...loadCalendarCache(), ...patch }
    memoryCalendarCache = next
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(CALENDAR_CACHE_KEY, JSON.stringify(next))
    } catch {
        // ignore storage errors
    }
}

const EMPTY_EVENTS: ScheduleItem[] = []
const EMPTY_HOLIDAYS: HolidaySet = new Set<number>()

export function CalendarWidget() {
    const { pushToast } = useToaster()
    const isLight = isLightClockAppearance(useClockAppearance())
    const [now, setNow] = useState(() => new Date())
    const initialMonthKey = `${now.getFullYear()}-${now.getMonth()}`
    const [holidaysByMonth, setHolidaysByMonth] = useState<Record<string, HolidaySet>>(() => ({
        [initialMonthKey]: new Set(loadCalendarCache().holidays),
    }))
    const [connected, setConnected] = useState(() => loadCalendarCache().connected)
    const [calendars, setCalendars] = useState<GoogleCalendarMeta[]>(
        () => loadCalendarCache().calendars
    )
    const [eventsByMonth, setEventsByMonth] = useState<Record<string, ScheduleItem[]>>(() => ({
        [initialMonthKey]: loadCalendarCache().events,
    }))
    const [selectedDay, setSelectedDay] = useState<number | null>(null)
    const [form, setForm] = useState<GoogleEventFormState | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [monthOffset, setMonthOffset] = useState(0)
    const [monthDirection, setMonthDirection] = useState<1 | -1>(1)
    const wheelCooldownRef = useRef(0)
    const calSwipeStartRef = useRef<{ x: number; y: number } | null>(null)
    useEffect(() => {
        const now = new Date()

        const msUntilMidnight =
            new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()

        let interval: number

        const timeout = window.setTimeout(() => {
            setNow(new Date())

            interval = window.setInterval(
                () => {
                    setNow(new Date())
                },
                24 * 60 * 60 * 1000
            )
        }, msUntilMidnight)

        return () => {
            clearTimeout(timeout)
            if (interval) clearInterval(interval)
        }
    }, [])

    const viewDate = useMemo(
        () => new Date(now.getFullYear(), now.getMonth() + monthOffset, 1),
        [now.getFullYear(), now.getMonth(), monthOffset]
    )
    const viewYear = viewDate.getFullYear()
    const viewMonth = viewDate.getMonth()
    const monthKey = `${viewYear}-${viewMonth}`
    const holidays = holidaysByMonth[monthKey] ?? EMPTY_HOLIDAYS
    const events = eventsByMonth[monthKey] ?? EMPTY_EVENTS
    const day = String(now.getDate()).padStart(2, "0")

    const shiftMonth = useCallback((delta: 1 | -1) => {
        setMonthDirection(delta)
        setMonthOffset((prev) => prev + delta)
        setSelectedDay(null)
        setForm(null)
    }, [])

    useEffect(() => {
        const targetKey = `${viewYear}-${viewMonth}`
        let cancelled = false
        fetchKoreanHolidays(viewYear, viewMonth + 1).then((next) => {
            if (cancelled) return
            const nextArr = Array.from(next).sort((a, b) => a - b)
            setHolidaysByMonth((prev) => {
                const existing = prev[targetKey]
                const prevArr = existing ? Array.from(existing).sort((a, b) => a - b) : null
                if (prevArr && JSON.stringify(prevArr) === JSON.stringify(nextArr)) return prev
                if (monthOffset === 0) saveCalendarCache({ holidays: nextArr })
                return { ...prev, [targetKey]: next }
            })
        })
        return () => {
            cancelled = true
        }
    }, [viewYear, viewMonth, monthOffset])

    const loadGoogleCalendar = useCallback(async () => {
        const targetKey = `${viewYear}-${viewMonth}`
        const auth = await fetchGoogleAuthStatus()
        setConnected((prev) => (prev === auth.connected ? prev : auth.connected))

        if (!auth.connected) {
            setCalendars((prev) => (prev.length === 0 ? prev : []))
            setEventsByMonth((prev) => (Object.keys(prev).length === 0 ? prev : {}))
            saveCalendarCache({ connected: false, calendars: [], events: [] })
            return
        }

        const mStart = new Date(viewYear, viewMonth, 1, 0, 0, 0).toISOString()
        const mEnd = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59).toISOString()
        const data = await fetchGoogleCalendarData({ timeMin: mStart, timeMax: mEnd })

        setCalendars((prev) =>
            JSON.stringify(prev) === JSON.stringify(data.calendars) ? prev : data.calendars
        )
        setEventsByMonth((prev) => {
            const existing = prev[targetKey]
            if (existing && JSON.stringify(existing) === JSON.stringify(data.events)) return prev
            return { ...prev, [targetKey]: data.events }
        })
        if (monthOffset === 0) {
            saveCalendarCache({
                connected: true,
                calendars: data.calendars,
                events: data.events,
            })
        }
    }, [viewYear, viewMonth, monthOffset])

    useEffect(() => {
        void loadGoogleCalendar()
        const interval = window.setInterval(() => {
            void loadGoogleCalendar()
        }, 60 * 1000)
        return () => window.clearInterval(interval)
    }, [loadGoogleCalendar])

    const eventsByDay = useMemo(() => {
        const map = new Map<number, ScheduleItem[]>()
        const monthFirst = new Date(viewYear, viewMonth, 1)
        const monthLast = new Date(viewYear, viewMonth + 1, 0)

        for (const ev of events) {
            const start = new Date(ev.start)
            if (!Number.isFinite(start.getTime())) continue

            const rawEnd = ev.end ? new Date(ev.end) : start
            const validEnd =
                Number.isFinite(rawEnd.getTime()) && rawEnd.getTime() >= start.getTime()
                    ? rawEnd
                    : start
            const effectiveEnd =
                !ev.allDay && validEnd.getTime() > start.getTime()
                    ? new Date(validEnd.getTime() - 1)
                    : validEnd

            const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
            const endDay = new Date(
                effectiveEnd.getFullYear(),
                effectiveEnd.getMonth(),
                effectiveEnd.getDate()
            )

            const from = startDay > monthFirst ? startDay : monthFirst
            const to = endDay < monthLast ? endDay : monthLast
            if (from > to) continue

            for (let d = from.getDate(); d <= to.getDate(); d++) {
                const list = map.get(d) ?? []
                list.push(ev)
                map.set(d, list)
            }
        }
        return map
    }, [events, viewYear, viewMonth])

    const selectedDateObj = useMemo(
        () => (selectedDay != null ? new Date(viewYear, viewMonth, selectedDay) : null),
        [selectedDay, viewYear, viewMonth]
    )

    const selectedDayEvents = useMemo(
        () => (selectedDay != null ? (eventsByDay.get(selectedDay) ?? []) : []),
        [selectedDay, eventsByDay]
    )

    const writableCalendars = useMemo(
        () => calendars.filter((c) => c.accessRole === "owner" || c.accessRole === "writer"),
        [calendars]
    )

    const handleSelectDay = (dayNum: number) => {
        if (!connected) return
        setSelectedDay(dayNum)
        setForm(null)
    }

    const openCreateForm = () => {
        if (!selectedDateObj) return
        const dateStr = toDateKey(selectedDateObj)
        const defaultCal =
            writableCalendars.find((c) => c.primary)?.id ?? writableCalendars[0]?.id ?? "primary"
        setForm({
            mode: "create",
            calendarId: defaultCal,
            title: "",
            startDate: dateStr,
            endDate: dateStr,
            startTime: "10:30",
            endTime: "11:45",
            allDay: false,
            location: "",
            description: "",
            attendees: [],
            attendeeInput: "",
            addGoogleMeet: false,
            recurrence: "",
            reminderMinutes: 30,
            editingTime: false,
        })
    }

    const openEditForm = (item: ScheduleItem) => {
        if (!item.id) return
        const start = new Date(item.start)
        const end = item.end ? new Date(item.end) : new Date(start.getTime() + 60 * 60 * 1000)
        setForm({
            mode: "edit",
            eventId: item.id,
            calendarId: item.calendarId || "primary",
            title: item.title === "(제목 없음)" ? "" : item.title,
            startDate: toDateKey(start),
            endDate: toDateKey(end),
            startTime: toTimeInputValue(start),
            endTime: toTimeInputValue(end),
            allDay: Boolean(item.allDay),
            location: item.location || "",
            description: item.description || "",
            attendees: item.attendees ?? [],
            attendeeInput: "",
            addGoogleMeet: false,
            hangoutLink: item.hangoutLink,
            recurrence: "",
            reminderMinutes: 30,
            editingTime: false,
        })
    }

    const handleSaveForm = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form || !form.title.trim()) {
            pushToast("일정 제목을 입력해 주세요.", { kind: "error" })
            return
        }
        const pendingAttendee = form.attendeeInput.trim()
        const finalAttendees =
            pendingAttendee && pendingAttendee.includes("@")
                ? Array.from(new Set([...form.attendees, pendingAttendee]))
                : form.attendees

        setSubmitting(true)
        try {
            const payload = {
                calendarId: form.calendarId,
                title: form.title.trim(),
                startDate: form.startDate,
                endDate: form.endDate,
                startTime: form.startTime,
                endTime: form.endTime,
                allDay: form.allDay,
                location: form.location.trim() || undefined,
                description: form.description.trim() || undefined,
                attendees: finalAttendees.length > 0 ? finalAttendees : undefined,
                addGoogleMeet: form.addGoogleMeet || undefined,
                recurrence: form.recurrence || undefined,
                reminderMinutes: form.reminderMinutes,
            }
            if (form.mode === "create") {
                await createGoogleEvent(payload)
                pushToast("일정이 추가되었습니다.", { kind: "success" })
            } else if (form.eventId) {
                await updateGoogleEvent({ ...payload, eventId: form.eventId })
                pushToast("일정이 수정되었습니다.", { kind: "success" })
            }
            setForm(null)
            await loadGoogleCalendar()
        } catch (err) {
            pushToast(err instanceof Error ? err.message : "저장에 실패했습니다.", {
                kind: "error",
            })
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeleteForm = async () => {
        if (!form || form.mode !== "edit" || !form.eventId) return
        setSubmitting(true)
        try {
            await deleteGoogleEvent(form.calendarId, form.eventId)
            pushToast("일정이 삭제되었습니다.", { kind: "success" })
            setForm(null)
            await loadGoogleCalendar()
        } catch (err) {
            pushToast(err instanceof Error ? err.message : "삭제에 실패했습니다.", {
                kind: "error",
            })
        } finally {
            setSubmitting(false)
        }
    }

    const weekdayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]

    const weekday = weekdayNames[now.getDay()]

    const grid = useMemo(
        () => buildMonthGrid(viewDate, now),
        [viewYear, viewMonth, now.getFullYear(), now.getMonth(), now.getDate()]
    )

    const dayHeaders = ["일", "월", "화", "수", "목", "금", "토"]
    const rowCount = grid.length / 7

    return (
        <div className="w-full h-full bg-transparent overflow-hidden relative select-none">
            <div className="relative h-full w-full max-w-[1440px] mx-auto px-6 sm:px-14 lg:px-20 py-14 sm:py-16 flex flex-col lg:flex-row items-stretch gap-8 lg:gap-16">
                {/* 좌측 오늘 날짜 히어로 */}
                <div className="lg:w-[30%] shrink-0 flex flex-row lg:flex-col items-end lg:items-start justify-between lg:justify-center">
                    <div className="flex items-center gap-3">
                        <div
                            className={`text-[clamp(1.35rem,2.6vw,2.25rem)] font-bold tracking-tight ${
                                isLight ? "text-zinc-500" : "text-white/65"
                            }`}
                        >
                            {viewYear}년 {viewMonth + 1}월
                        </div>
                        {monthOffset !== 0 ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setMonthDirection(monthOffset > 0 ? -1 : 1)
                                    setMonthOffset(0)
                                    setSelectedDay(null)
                                    setForm(null)
                                }}
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                                    isLight
                                        ? "bg-black/[0.08] hover:bg-black/[0.14] text-zinc-700"
                                        : "bg-white/[0.1] hover:bg-white/[0.18] text-white/80"
                                }`}
                            >
                                오늘
                            </button>
                        ) : null}
                    </div>

                    <div className="flex items-baseline gap-3 lg:block lg:mt-2">
                        <div
                            className={`text-[clamp(3.75rem,9.5vw,9rem)] font-black leading-none tracking-tighter tabular-nums ${
                                isLight ? "text-zinc-900" : "text-white"
                            }`}
                        >
                            {day}
                        </div>
                        <div
                            className={`text-[clamp(1.25rem,2.4vw,2.25rem)] font-bold tracking-tight lg:mt-3 ${
                                isLight ? "text-zinc-700" : "text-white/85"
                            }`}
                        >
                            {weekday}
                        </div>
                    </div>
                </div>

                {/* 우측 월간 캘린더 */}
                <div className="flex-1 min-h-0 flex flex-col justify-center">
                    <div
                        onWheel={(e) => {
                            if (Math.abs(e.deltaY) < 12) return
                            const ts = Date.now()
                            if (ts - wheelCooldownRef.current < 260) return
                            wheelCooldownRef.current = ts
                            shiftMonth(e.deltaY > 0 ? 1 : -1)
                        }}
                        onPointerDown={(e) => {
                            calSwipeStartRef.current = { x: e.clientX, y: e.clientY }
                        }}
                        onPointerUp={(e) => {
                            const start = calSwipeStartRef.current
                            calSwipeStartRef.current = null
                            if (!start) return
                            const dx = e.clientX - start.x
                            const dy = e.clientY - start.y
                            if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.2) {
                                shiftMonth(dy < 0 ? 1 : -1)
                            }
                        }}
                        onPointerCancel={() => {
                            calSwipeStartRef.current = null
                        }}
                        className={`w-full h-full max-h-[640px] rounded-[32px] p-5 sm:p-8 flex flex-col overflow-hidden backdrop-blur-md ${
                            isLight
                                ? "bg-white/55 ring-1 ring-black/8 shadow-[0_12px_40px_rgba(0,0,0,0.06)]"
                                : "bg-white/[0.05] ring-1 ring-white/10"
                        }`}
                    >
                        {/* 요일 헤더 */}
                        <div
                            className={`grid grid-cols-7 pb-3 sm:pb-4 border-b shrink-0 ${
                                isLight ? "border-black/[0.08]" : "border-white/[0.08]"
                            }`}
                        >
                            {dayHeaders.map((label, i) => (
                                <div
                                    key={label}
                                    className={`text-center text-xs sm:text-sm font-bold tracking-wider ${
                                        i === 0
                                            ? isLight
                                                ? "text-[#E53935]"
                                                : "text-[#FF6B6B]"
                                            : i === 6
                                              ? isLight
                                                  ? "text-[#0A84FF]"
                                                  : "text-[#64B5F6]"
                                              : isLight
                                                ? "text-black/45"
                                                : "text-white/40"
                                    }`}
                                >
                                    {label}
                                </div>
                            ))}
                        </div>

                        {/* 날짜 그리드 */}
                        <div className="relative flex-1 min-h-0 overflow-hidden">
                            <AnimatePresence initial={false} custom={monthDirection}>
                                <motion.div
                                    key={`${viewYear}-${viewMonth}`}
                                    custom={monthDirection}
                                    variants={{
                                        enter: (dir: 1 | -1) => ({ opacity: 0, y: dir * 24 }),
                                        center: { opacity: 1, y: 0 },
                                        exit: (dir: 1 | -1) => ({ opacity: 0, y: dir * -24 }),
                                    }}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                    className={`absolute inset-0 grid grid-cols-7 pt-2 ${
                                        rowCount === 5 ? "grid-rows-5" : "grid-rows-6"
                                    }`}
                                >
                                    {grid.map((cell, idx) => {
                                        const isSunday = cell.col === 0
                                        const isSaturday = cell.col === 6
                                        const isSelected = cell.inMonth && cell.isToday

                                        const yyyymmdd =
                                            viewYear * 10000 + (viewMonth + 1) * 100 + cell.day
                                        const isHoliday = cell.inMonth && holidays.has(yyyymmdd)

                                        if (!cell.inMonth) {
                                            return (
                                                <div
                                                    key={idx}
                                                    className={`flex items-center justify-center text-[clamp(0.95rem,1.8vw,1.5rem)] font-semibold tabular-nums ${
                                                        isLight ? "text-black/25" : "text-white/15"
                                                    }`}
                                                >
                                                    {cell.day}
                                                </div>
                                            )
                                        }

                                        if (isSelected) {
                                            const dayEvs = eventsByDay.get(cell.day) ?? []
                                            const isSidebarSelected = selectedDay === cell.day
                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={() => handleSelectDay(cell.day)}
                                                    data-disable-widget-swipe={
                                                        connected ? "true" : undefined
                                                    }
                                                    className={`flex flex-col items-center justify-center gap-1 ${
                                                        connected ? "cursor-pointer" : ""
                                                    }`}
                                                >
                                                    <div
                                                        className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-[#FF453A] text-white flex items-center justify-center text-[clamp(1rem,1.9vw,1.6rem)] font-extrabold tabular-nums transition ${
                                                            isSidebarSelected
                                                                ? "ring-2 ring-white ring-offset-2 ring-offset-transparent"
                                                                : ""
                                                        }`}
                                                    >
                                                        {cell.day}
                                                    </div>
                                                    <div className="h-2 flex items-center justify-center gap-0.5">
                                                        {dayEvs.slice(0, 3).map((ev, i) => (
                                                            <span
                                                                key={i}
                                                                className="w-1.5 h-1.5 rounded-full"
                                                                style={{
                                                                    backgroundColor:
                                                                        ev.color || "#6E8BFF",
                                                                }}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        }

                                        const textColor =
                                            isHoliday || isSunday
                                                ? isLight
                                                    ? "text-[#E53935]"
                                                    : "text-[#FF6B6B]"
                                                : isSaturday
                                                  ? isLight
                                                      ? "text-[#0A84FF]"
                                                      : "text-[#64B5F6]"
                                                  : isLight
                                                    ? "text-zinc-800"
                                                    : "text-white/90"
                                        const dayEvs = eventsByDay.get(cell.day) ?? []
                                        const isSidebarSelected = selectedDay === cell.day

                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => handleSelectDay(cell.day)}
                                                data-disable-widget-swipe={
                                                    connected ? "true" : undefined
                                                }
                                                className={`flex flex-col items-center justify-center gap-1 rounded-2xl transition ${
                                                    connected
                                                        ? isLight
                                                            ? "cursor-pointer hover:bg-black/[0.04]"
                                                            : "cursor-pointer hover:bg-white/[0.06]"
                                                        : ""
                                                } ${
                                                    isSidebarSelected
                                                        ? isLight
                                                            ? "bg-black/[0.06] ring-1 ring-[#0A84FF]/60"
                                                            : "bg-white/[0.1] ring-1 ring-[#6E8BFF]/60"
                                                        : ""
                                                }`}
                                            >
                                                <span
                                                    className={`text-[clamp(0.95rem,1.8vw,1.55rem)] font-bold tabular-nums leading-none ${textColor}`}
                                                >
                                                    {cell.day}
                                                </span>
                                                <div className="h-2 flex items-center justify-center gap-0.5">
                                                    {isHoliday && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B6B]" />
                                                    )}
                                                    {dayEvs.slice(0, 3).map((ev, i) => (
                                                        <span
                                                            key={i}
                                                            className="w-1.5 h-1.5 rounded-full"
                                                            style={{
                                                                backgroundColor:
                                                                    ev.color || "#6E8BFF",
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>

            {/* 오른쪽 일정 사이드바 */}
            <AnimatePresence>
                {connected && selectedDateObj ? (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            onClick={() => {
                                setSelectedDay(null)
                                setForm(null)
                            }}
                            data-disable-widget-swipe="true"
                            className={`absolute inset-0 z-30 backdrop-blur-[2px] ${
                                isLight ? "bg-black/15" : "bg-black/25"
                            }`}
                        />
                        <motion.aside
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                            data-disable-widget-swipe="true"
                            className={`absolute top-0 right-0 bottom-0 z-40 w-[340px] max-w-[90%] shadow-2xl flex flex-col p-5 backdrop-blur-2xl ${
                                isLight
                                    ? "bg-white/55 border-l border-black/10 text-zinc-900"
                                    : "bg-black/30 border-l border-white/15 text-white"
                            }`}
                        >
                            {/* 사이드바 헤더 */}
                            <div
                                className={`flex items-center justify-between pb-3 border-b shrink-0 ${
                                    isLight ? "border-black/10" : "border-white/10"
                                }`}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    {form ? (
                                        <button
                                            type="button"
                                            onClick={() => setForm(null)}
                                            className={`p-1 rounded-lg cursor-pointer ${
                                                isLight
                                                    ? "hover:bg-black/5 text-zinc-600"
                                                    : "hover:bg-white/10 text-white/70"
                                            }`}
                                        >
                                            <IoChevronBack className="w-4 h-4" />
                                        </button>
                                    ) : null}
                                    <div className="truncate">
                                        <div className="text-sm font-bold">
                                            {selectedDateObj.getMonth() + 1}월{" "}
                                            {selectedDateObj.getDate()}일{" "}
                                            {weekdayNames[selectedDateObj.getDay()]}
                                        </div>
                                        <div
                                            className={`text-xs ${
                                                isLight ? "text-zinc-500" : "text-white/45"
                                            }`}
                                        >
                                            {form
                                                ? form.mode === "create"
                                                    ? "새 일정 추가"
                                                    : "일정 수정"
                                                : `일정 ${selectedDayEvents.length}건`}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1">
                                    {!form ? (
                                        <button
                                            type="button"
                                            onClick={openCreateForm}
                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                                                isLight
                                                    ? "bg-[#0A84FF]/12 hover:bg-[#0A84FF]/20 text-[#0A84FF]"
                                                    : "bg-[#6E8BFF]/20 hover:bg-[#6E8BFF]/30 text-[#9BB0FF]"
                                            }`}
                                        >
                                            <IoAdd className="w-3.5 h-3.5" />
                                            추가
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedDay(null)
                                            setForm(null)
                                        }}
                                        className={`p-1.5 rounded-lg cursor-pointer ${
                                            isLight
                                                ? "hover:bg-black/5 text-zinc-500"
                                                : "hover:bg-white/10 text-white/60"
                                        }`}
                                    >
                                        <IoClose className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* 사이드바 본문 */}
                            {form ? (
                                <GoogleEventForm
                                    form={form}
                                    setForm={setForm}
                                    calendars={calendars}
                                    writableCalendars={writableCalendars}
                                    submitting={submitting}
                                    onSubmit={handleSaveForm}
                                    onDelete={handleDeleteForm}
                                    isLight={isLight}
                                />
                            ) : (
                                <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pt-3 flex flex-col gap-2">
                                    {selectedDayEvents.length === 0 ? (
                                        <div
                                            className={`my-auto text-center text-xs py-8 ${
                                                isLight ? "text-zinc-400" : "text-white/45"
                                            }`}
                                        >
                                            등록된 일정이 없습니다.
                                        </div>
                                    ) : (
                                        selectedDayEvents.map((ev, i) => (
                                            <button
                                                key={`${ev.id ?? ev.start}-${i}`}
                                                type="button"
                                                onClick={() => openEditForm(ev)}
                                                className={`w-full text-left rounded-2xl p-3 transition cursor-pointer flex items-start gap-2.5 ${
                                                    isLight
                                                        ? "bg-black/[0.03] hover:bg-black/[0.06] ring-1 ring-black/8"
                                                        : "bg-white/[0.06] hover:bg-white/[0.11] ring-1 ring-white/10"
                                                }`}
                                            >
                                                <span
                                                    className="w-1.5 h-8 rounded-full shrink-0 mt-0.5"
                                                    style={{
                                                        backgroundColor: ev.color || "#6E8BFF",
                                                    }}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div
                                                        className={`text-sm font-bold truncate ${
                                                            isLight ? "text-zinc-900" : "text-white"
                                                        }`}
                                                    >
                                                        {ev.title}
                                                    </div>
                                                    <div
                                                        className={`text-xs mt-0.5 ${
                                                            isLight
                                                                ? "text-zinc-500"
                                                                : "text-white/55"
                                                        }`}
                                                    >
                                                        {formatEventTimeText(ev)}
                                                    </div>
                                                    {ev.location ? (
                                                        <div
                                                            className={`text-[11px] truncate mt-0.5 ${
                                                                isLight
                                                                    ? "text-zinc-400"
                                                                    : "text-white/40"
                                                            }`}
                                                        >
                                                            {ev.location}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </motion.aside>
                    </>
                ) : null}
            </AnimatePresence>
        </div>
    )
}
